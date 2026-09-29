import { EventEmitter } from "node:events";
import {
  io,
  type ManagerOptions,
  type Socket
} from "socket.io-client";
import type {
  MatchSnapshot,
  StreamStatus,
  TimeoutState
} from "../shared/types";
import type { AgClient } from "./agClient";
import { config, resultRoom } from "./config";
import { decodePayload } from "./codec";
import {
  getCachedFlagMap,
  warmFlagMap
} from "./flagAssets";
import { normalizeMatch } from "./normalizer";

interface MatchState {
  snapshot: MatchSnapshot | null;
  status: StreamStatus;
  socket: Socket | null;
  pollTimer: NodeJS.Timeout | null;
  refreshInFlight: Promise<MatchSnapshot> | null;
  socketEventVersion: number;
  lastSocketEventAt: number | null;
  listeners: number;
  /** 当前正在进行的暂停 */
  timeout: TimeoutState | null;
  /** 暂停归属的场次 key，用于换场时清空 */
  timeoutMatchKey: string | null;
  /** 暂停开始时的比分，用于判断比赛是否已经恢复 */
  timeoutPoints: { home: number; away: number } | null;
  timeoutStartedAt: number | null;
  /** 上一次看到的暂停计数，用于识别“刚叫暂停”这一瞬间 */
  lastTimeouts: { home: number; away: number } | null;
}

type SocketFactory = (
  url: string,
  options: Partial<ManagerOptions>
) => Socket;

const SOCKET_FRESH_WINDOW_MS = Math.max(config.pollMs * 3, 10000);

const initialStatus = (): StreamStatus => ({
  state: "connecting",
  lastUpdatedAt: null,
  socketConnected: false,
  message: "正在连接官方结果服务"
});

const matchStatusRank: Record<MatchSnapshot["status"], number> = {
  UNKNOWN: 0,
  SCHEDULED: 1,
  RUNNING: 2,
  FINISHED: 3
};

const scoreDropped = (
  candidate: number | null,
  current: number | null
): boolean =>
  current !== null && (candidate === null || candidate < current);

const isSnapshotRegression = (
  current: MatchSnapshot,
  candidate: MatchSnapshot
): boolean => {
  if (
    scoreDropped(candidate.teamScore.home, current.teamScore.home) ||
    scoreDropped(candidate.teamScore.away, current.teamScore.away) ||
    candidate.completedMatches.length < current.completedMatches.length ||
    matchStatusRank[candidate.status] < matchStatusRank[current.status]
  ) {
    return true;
  }

  const currentMatch = current.activeMatch;
  const candidateMatch = candidate.activeMatch;
  if (!currentMatch) {
    return false;
  }
  if (!candidateMatch) {
    return true;
  }

  if (
    currentMatch.order !== null &&
    candidateMatch.order !== null &&
    candidateMatch.order < currentMatch.order
  ) {
    return true;
  }

  if (candidateMatch.key !== currentMatch.key) {
    return false;
  }

  if (
    matchStatusRank[candidateMatch.status] <
      matchStatusRank[currentMatch.status] ||
    candidateMatch.currentGame < currentMatch.currentGame ||
    scoreDropped(candidateMatch.games.home, currentMatch.games.home) ||
    scoreDropped(candidateMatch.games.away, currentMatch.games.away)
  ) {
    return true;
  }

  if (candidateMatch.currentGame !== currentMatch.currentGame) {
    return false;
  }

  if (
    candidateMatch.points.home < currentMatch.points.home ||
    candidateMatch.points.away < currentMatch.points.away
  ) {
    return true;
  }

  return (
    candidateMatch.points.home === currentMatch.points.home &&
    candidateMatch.points.away === currentMatch.points.away &&
    candidateMatch.server !== null &&
    currentMatch.server !== null &&
    candidateMatch.server !== currentMatch.server
  );
};

/** 暂停开始后至少经过这么久，比分变化才说明比赛已经恢复 */
const TIMEOUT_RESUME_GRACE_MS = 3000;

const sideTimeouts = (
  snapshot: MatchSnapshot
): { home: number; away: number } => {
  const active = snapshot.activeMatch?.discipline;
  return {
    home: Math.max(
      snapshot.teamDiscipline.home.timeoutsUsed,
      active?.home.timeoutsUsed ?? 0
    ),
    away: Math.max(
      snapshot.teamDiscipline.away.timeoutsUsed,
      active?.away.timeoutsUsed ?? 0
    )
  };
};

const activePoints = (
  snapshot: MatchSnapshot
): { home: number; away: number } | null =>
  snapshot.activeMatch
    ? { ...snapshot.activeMatch.points }
    : null;

export class MatchManager extends EventEmitter {
  private readonly states = new Map<string, MatchState>();

  constructor(
    private readonly client: Pick<AgClient, "getMatch">,
    private readonly createSocket: SocketFactory = (url, options) =>
      io(url, options)
  ) {
    super();
  }

  get activeMatches(): number {
    return this.states.size;
  }

  getSnapshot(matchKey: string): MatchSnapshot | null {
    return this.states.get(matchKey)?.snapshot ?? null;
  }

  getStatus(matchKey: string): StreamStatus {
    return this.states.get(matchKey)?.status ?? initialStatus();
  }

  async refresh(matchKey: string): Promise<MatchSnapshot> {
    const state = this.ensureState(matchKey);
    if (state.refreshInFlight) {
      return state.refreshInFlight;
    }

    state.refreshInFlight = this.performRefresh(matchKey, state).finally(() => {
      state.refreshInFlight = null;
    });

    return state.refreshInFlight;
  }

  subscribe(matchKey: string): () => void {
    const state = this.ensureState(matchKey);
    state.listeners += 1;
    this.start(matchKey);

    return () => {
      state.listeners = Math.max(0, state.listeners - 1);
      if (state.listeners === 0) {
        this.stop(matchKey);
      }
    };
  }

  private ensureState(matchKey: string): MatchState {
    const existing = this.states.get(matchKey);
    if (existing) {
      return existing;
    }

    const state: MatchState = {
      snapshot: null,
      status: initialStatus(),
      socket: null,
      pollTimer: null,
      refreshInFlight: null,
      socketEventVersion: 0,
      lastSocketEventAt: null,
      listeners: 0,
      timeout: null,
      timeoutMatchKey: null,
      timeoutPoints: null,
      timeoutStartedAt: null,
      lastTimeouts: null
    };
    this.states.set(matchKey, state);
    return state;
  }

  private start(matchKey: string): void {
    const state = this.ensureState(matchKey);
    if (!state.socket) {
      this.connectSocket(matchKey, state);
    }
    if (!state.pollTimer) {
      state.pollTimer = setInterval(() => {
        void this.refresh(matchKey).catch((error: unknown) => {
          this.markError(matchKey, error);
        });
      }, config.pollMs);
    }
    void this.refresh(matchKey).catch((error: unknown) => {
      this.markError(matchKey, error);
    });
  }

  private stop(matchKey: string): void {
    const state = this.states.get(matchKey);
    if (!state) {
      return;
    }

    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    if (state.socket) {
      state.socket.emit("leave", resultRoom(matchKey));
      state.socket.disconnect();
      state.socket = null;
    }
  }

  private connectSocket(matchKey: string, state: MatchState): void {
    const room = resultRoom(matchKey);
    const socket = this.createSocket(config.socketUrl, {
      transports: ["websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5
    });
    state.socket = socket;

    socket.on("connect", () => {
      socket.emit("join", room);
      this.updateStatus(matchKey, {
        state: state.snapshot ? "live" : "connecting",
        socketConnected: true,
        message: "实时通道已连接"
      });
    });

    socket.on("disconnect", () => {
      this.updateStatus(matchKey, {
        state: state.snapshot ? "polling" : "connecting",
        socketConnected: false,
        message: "实时通道已断开，正在使用轮询"
      });
    });

    socket.on("connect_error", (error) => {
      this.updateStatus(matchKey, {
        state: state.snapshot ? "polling" : "error",
        socketConnected: false,
        message: `实时通道连接失败：${error.message}`
      });
    });

    socket.on("data", (payload: unknown) => {
      try {
        const envelope =
          payload !== null && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : {};
        if (envelope.room !== room || envelope.info === undefined) {
          return;
        }

        const decoded = decodePayload(envelope.info);
        const snapshot = normalizeMatch(decoded, getCachedFlagMap());
        warmFlagMap();
        state.socketEventVersion += 1;
        state.lastSocketEventAt = Date.now();
        this.setSnapshot(matchKey, snapshot, "实时通道更新");
      } catch (error) {
        this.markError(matchKey, error);
      }
    });
  }

  private async performRefresh(
    matchKey: string,
    state: MatchState
  ): Promise<MatchSnapshot> {
    const socketEventVersionAtStart = state.socketEventVersion;
    const raw = await this.client.getMatch(matchKey);
    const snapshot = normalizeMatch(raw, getCachedFlagMap());
    warmFlagMap();

    const socketUpdatedDuringRequest =
      state.socketEventVersion !== socketEventVersionAtStart;
    const socketIsFresh =
      state.status.socketConnected &&
      state.lastSocketEventAt !== null &&
      Date.now() - state.lastSocketEventAt < SOCKET_FRESH_WINDOW_MS;

    if (
      socketUpdatedDuringRequest ||
      socketIsFresh ||
      (state.snapshot !== null &&
        isSnapshotRegression(state.snapshot, snapshot))
    ) {
      return state.snapshot ?? snapshot;
    }

    this.setSnapshot(
      matchKey,
      snapshot,
      "轮询同步"
    );
    return snapshot;
  }

  private setSnapshot(
    matchKey: string,
    snapshot: MatchSnapshot,
    message: string
  ): void {
    const state = this.ensureState(matchKey);
    const next = this.applyTimeout(state, snapshot);
    state.snapshot = next;
    this.updateStatus(matchKey, {
      state: state.status.socketConnected ? "live" : "polling",
      lastUpdatedAt: next.updatedAt,
      message
    });
    this.emit("snapshot", matchKey, next);
  }

  /**
   * 官方数据只给出“某一方已用暂停次数”，因此通过计数从 0 变 1 的瞬间判断
   * 暂停开始；暂停在时长耗尽或重新开始得分（比赛恢复）时结束。
   */
  private applyTimeout(
    state: MatchState,
    snapshot: MatchSnapshot
  ): MatchSnapshot {
    const now = Date.now();
    const activeKey = snapshot.activeMatch?.key ?? null;
    const counters = sideTimeouts(snapshot);
    const previous = state.lastTimeouts;
    const running = snapshot.status === "RUNNING";

    if (activeKey !== state.timeoutMatchKey) {
      state.timeout = null;
      state.timeoutPoints = null;
      state.timeoutStartedAt = null;
    }
    state.timeoutMatchKey = activeKey;

    const homeIncrease = previous ? counters.home - previous.home : 0;
    const awayIncrease = previous ? counters.away - previous.away : 0;
    const started =
      running && previous !== null && (homeIncrease > 0 || awayIncrease > 0);

    if (started) {
      const side = homeIncrease >= awayIncrease ? "home" : "away";
      const durationMs = config.timeoutSeconds * 1000;
      state.timeout = {
        side,
        startedAt: new Date(now).toISOString(),
        endsAt: new Date(now + durationMs).toISOString(),
        seconds: config.timeoutSeconds
      };
      state.timeoutPoints = activePoints(snapshot);
      state.timeoutStartedAt = now;
    } else if (state.timeout) {
      const endsAt = Date.parse(state.timeout.endsAt);
      const expired = !Number.isFinite(endsAt) || now >= endsAt;
      const points = activePoints(snapshot);
      const resumed =
        state.timeoutStartedAt !== null &&
        now - state.timeoutStartedAt >= TIMEOUT_RESUME_GRACE_MS &&
        state.timeoutPoints !== null &&
        points !== null &&
        (points.home !== state.timeoutPoints.home ||
          points.away !== state.timeoutPoints.away);

      if (!running || expired || resumed) {
        state.timeout = null;
        state.timeoutPoints = null;
        state.timeoutStartedAt = null;
      }
    }

    state.lastTimeouts = counters;

    return { ...snapshot, timeout: state.timeout };
  }

  private updateStatus(
    matchKey: string,
    patch: Partial<StreamStatus>
  ): void {
    const state = this.ensureState(matchKey);
    state.status = {
      ...state.status,
      ...patch
    };
    this.emit("status", matchKey, state.status);
  }

  private markError(matchKey: string, error: unknown): void {
    const state = this.ensureState(matchKey);
    const message =
      error instanceof Error ? error.message : "官方结果服务暂时不可用";
    const lastUpdatedAt = state.status.lastUpdatedAt;
    const stale =
      !lastUpdatedAt || Date.now() - Date.parse(lastUpdatedAt) > 15000;

    this.updateStatus(matchKey, {
      state: stale ? "stale" : "polling",
      message
    });
  }
}
