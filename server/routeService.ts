import { EventEmitter } from "node:events";
import type { RoutesSnapshot } from "../shared/types";
import type { AgClient } from "./agClient";
import { config } from "./config";
import { getCachedFlagMap, warmFlagMap } from "./flagAssets";
import {
  buildRouteEvents,
  collectScheduleStatuses,
  isFinishedStatus,
  isLiveStatus,
  routeSignature,
  selectDetailKeys,
  toMatchDetail,
  type MatchDetail,
  type ScheduleStatus
} from "./routeModel";

interface DetailEntry {
  detail: MatchDetail;
  expiresAt: number;
}

const FINISHED_TTL = Number.MAX_SAFE_INTEGER;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "官方结果服务暂时不可用";

export class RouteService extends EventEmitter {
  private snapshot: RoutesSnapshot | null = null;
  private signature = "";
  private details = new Map<string, DetailEntry>();
  private refreshing: Promise<RoutesSnapshot> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: Pick<AgClient, "getRawUnits" | "getMatch">
  ) {
    super();
  }

  /** 启动后台定时刷新：接口始终返回最近一次快照 */
  start(): void {
    if (this.timer) {
      return;
    }
    void this.refresh().catch(() => undefined);
    this.timer = setInterval(() => {
      void this.refresh().catch(() => undefined);
    }, config.routesTtlMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSnapshot(): RoutesSnapshot | null {
    if (
      this.snapshot &&
      Date.now() - Date.parse(this.snapshot.updatedAt) > config.routesTtlMs
    ) {
      void this.refresh().catch(() => undefined);
    }
    return this.snapshot;
  }

  async getRoutes(): Promise<RoutesSnapshot> {
    const snapshot = this.getSnapshot();
    if (snapshot) {
      return snapshot;
    }
    return this.refresh();
  }

  refresh(force = false): Promise<RoutesSnapshot> {
    if (this.refreshing) {
      return this.refreshing;
    }
    const task = this.run(force).finally(() => {
      this.refreshing = null;
    });
    this.refreshing = task;
    return task;
  }

  private async run(force: boolean): Promise<RoutesSnapshot> {
    try {
      const raw = await this.client.getRawUnits();
      warmFlagMap();

      // 先用赛程数据（+ 已有细节）发布一次，保证接口响应足够快
      const events = buildRouteEvents(raw, this.liveDetails(), getCachedFlagMap());
      this.publish(events, false, "已同步官方成绩", force);

      // 再补齐当前轮次的逐局比分、团体小盘比分与双打中文名
      const pending = selectDetailKeys(
        raw,
        new Set(this.details.keys()),
        config.routesMaxDetails
      );
      if (pending.length > 0) {
        await this.loadDetails(pending, collectScheduleStatuses(raw));
        const enriched = buildRouteEvents(
          raw,
          this.liveDetails(),
          getCachedFlagMap()
        );
        this.publish(enriched, false, "已同步官方成绩", false);
      }
    } catch (error) {
      const message = errorMessage(error);
      if (this.snapshot) {
        this.snapshot = { ...this.snapshot, stale: true, message };
        this.emit("update", this.snapshot);
      } else {
        this.snapshot = {
          updatedAt: new Date().toISOString(),
          stale: true,
          message,
          events: []
        };
      }
    }

    return this.snapshot ?? {
      updatedAt: new Date().toISOString(),
      stale: true,
      message: "尚未获取到官方数据",
      events: []
    };
  }

  private liveDetails(): Map<string, MatchDetail> {
    const now = Date.now();
    const map = new Map<string, MatchDetail>();
    for (const [key, entry] of this.details) {
      if (entry.expiresAt <= now) {
        this.details.delete(key);
        continue;
      }
      map.set(key, entry.detail);
    }
    return map;
  }

  private async loadDetails(
    keys: string[],
    statuses: ReadonlyMap<string, ScheduleStatus>
  ): Promise<void> {
    const queue = [...keys];
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const key = queue.shift();
        if (!key) {
          continue;
        }
        try {
          const raw = await this.client.getMatch(key);
          const detail = toMatchDetail(raw);
          const schedule = statuses.get(key);
          const finished =
            isFinishedStatus(detail.status) ||
            isFinishedStatus(schedule?.status ?? null);
          const live =
            schedule?.live === true ||
            isLiveStatus(schedule?.status ?? null) ||
            isLiveStatus(detail.status);
          this.details.set(key, {
            detail,
            expiresAt: finished
              ? FINISHED_TTL
              : Date.now() +
                (live
                  ? config.routesDetailTtlMs
                  : config.routesIdleDetailTtlMs)
          });
        } catch {
          // 单场失败不影响整体：下次刷新再试
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(3, queue.length) }, () => worker())
    );
  }

  private publish(
    events: RoutesSnapshot["events"],
    stale: boolean,
    message: string,
    force: boolean
  ): void {
    const signature = routeSignature(events);
    const changed = signature !== this.signature;
    this.signature = signature;
    this.snapshot = {
      updatedAt: new Date().toISOString(),
      stale,
      message,
      events
    };
    if (changed || force) {
      this.emit("update", this.snapshot);
    }
  }
}