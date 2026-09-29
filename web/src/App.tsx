import {
  Activity,
  AlertCircle,
  CalendarDays,
  CircleDot,
  Clock3,
  ListTree,
  MapPin,
  Pause,
  Radio,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Trophy,
  Wifi,
  WifiOff
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConnectionState,
  GamePeriod,
  IndividualMatch,
  MatchSnapshot,
  ScheduleMatch,
  SideDiscipline,
  StreamStatus,
  TeamSide,
  TimeoutState
} from "../../shared/types";
import { getSchedule, resolveMatch } from "./api";
import { CountryFlag } from "./CountryFlag";
import { RoutesView } from "./RoutesView";

const DEFAULT_INPUT = "W.TEAM--------------.GPA-.00020000";

const statusLabels: Record<string, string> = {
  SCHEDULED: "未开始",
  RUNNING: "进行中",
  FINISHED: "已结束",
  UNKNOWN: "状态未知"
};

const connectionLabels: Record<ConnectionState, string> = {
  connecting: "连接中",
  live: "实时",
  polling: "轮询中",
  stale: "数据已过期",
  error: "连接异常"
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "时间待定";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo"
  }).format(date);
};

const formatUpdatedAt = (value: string | null): string => {
  if (!value) {
    return "尚未同步";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
};

const getInitialInput = (): string => {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("match") ??
    window.localStorage.getItem("ag2026-match") ??
    DEFAULT_INPUT
  );
};

const scoreText = (score: number | null): string =>
  score === null ? "-" : String(score);

const statusClass = (status: string): string =>
  `status-${status.toLowerCase()}`;

interface CardBadgeItem {
  key: string;
  tone: "yellow" | "red";
  label: string;
  count: number;
}

const disciplineBadges = (
  discipline: SideDiscipline | null | undefined
): CardBadgeItem[] => {
  if (!discipline) {
    return [];
  }

  const items: CardBadgeItem[] = [];
  if (discipline.yellowCards > 0) {
    items.push({
      key: "yellow",
      tone: "yellow",
      label: "黄牌",
      count: discipline.yellowCards
    });
  }
  if (discipline.redCards > 0) {
    items.push({
      key: "red",
      tone: "red",
      label: "红牌",
      count: discipline.redCards
    });
  }
  if (discipline.coachYellowCards > 0) {
    items.push({
      key: "coach-yellow",
      tone: "yellow",
      label: "教练黄牌",
      count: discipline.coachYellowCards
    });
  }
  if (discipline.coachRedCards > 0) {
    items.push({
      key: "coach-red",
      tone: "red",
      label: "教练红牌",
      count: discipline.coachRedCards
    });
  }
  return items;
};

const disciplineSignature = (discipline: SideDiscipline | null | undefined): string =>
  discipline
    ? [
        discipline.yellowCards,
        discipline.redCards,
        discipline.coachYellowCards,
        discipline.coachRedCards
      ].join("-")
    : "";

const snapshotCardSignature = (snapshot: MatchSnapshot): string =>
  [
    disciplineSignature(snapshot.teamDiscipline.home),
    disciplineSignature(snapshot.teamDiscipline.away),
    disciplineSignature(snapshot.activeMatch?.discipline.home),
    disciplineSignature(snapshot.activeMatch?.discipline.away)
  ].join("|");

function CardBadges({
  discipline,
  align = "left",
  fresh = false
}: {
  discipline: SideDiscipline | null | undefined;
  align?: "left" | "right";
  fresh?: boolean;
}) {
  const items = disciplineBadges(discipline);
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={`card-badges ${align === "right" ? "align-right" : ""} ${
        fresh ? "is-fresh" : ""
      }`}
    >
      {items.map((item) => (
        <span
          key={item.key}
          className={`card-chip card-chip-${item.tone}`}
          role="img"
          aria-label={`${item.label}${item.count > 1 ? ` ${item.count} 张` : ""}`}
          title={`${item.label}${item.count > 1 ? ` ×${item.count}` : ""}`}
        >
          <span className="card-chip-mark" aria-hidden="true" />
          <span className="card-chip-text">
            {item.label}
            {item.count > 1 ? ` ×${item.count}` : ""}
          </span>
        </span>
      ))}
    </div>
  );
}

function TimeoutNotice({
  timeout,
  teams,
  activeMatch
}: {
  timeout: TimeoutState | null;
  teams: MatchSnapshot["teams"] | null;
  activeMatch: IndividualMatch | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  if (!timeout) {
    return null;
  }

  const endsAt = Date.parse(timeout.endsAt);
  if (!Number.isFinite(endsAt)) {
    return null;
  }

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  if (remaining <= 0) {
    return null;
  }

  const side = timeout.side === "home" ? teams?.home : teams?.away;
  const player =
    timeout.side === "home"
      ? activeMatch?.home.shortName
      : activeMatch?.away.shortName;
  const total = Math.max(1, timeout.seconds);
  const progress = Math.min(100, Math.max(0, (remaining / total) * 100));

  return (
    <div
      className={`timeout-notice timeout-${timeout.side}`}
      role="status"
      aria-live="assertive"
    >
      <span className="timeout-icon" aria-hidden="true">
        <Pause size={18} />
      </span>
      <CountryFlag
        flagUrl={side?.flagUrl ?? null}
        code={side?.countryCode ?? null}
        label={side?.name ?? "暂停方"}
      />
      <div className="timeout-copy">
        <strong>{side?.name ?? "一方"} 请求暂停</strong>
        <span>
          比赛暂停中{player ? ` · ${player}` : ""} · 剩余 {remaining} 秒
        </span>
      </div>
      <div className="timeout-bar" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function TimeoutUsage({
  discipline,
  align = "left"
}: {
  discipline: SideDiscipline | null | undefined;
  align?: "left" | "right";
}) {
  if (!discipline || discipline.timeoutsUsed <= 0) {
    return null;
  }

  return (
    <span className={`timeout-usage ${align === "right" ? "align-right" : ""}`}>
      <Pause size={12} aria-hidden="true" />
      已用暂停 {discipline.timeoutsUsed}
    </span>
  );
}

function ConnectionBadge({
  state,
  message
}: {
  state: ConnectionState;
  message: string;
}) {
  const Icon = state === "live" ? Wifi : state === "error" ? WifiOff : Radio;
  return (
    <div className={`connection-badge ${statusClass(state)}`} title={message}>
      <Icon size={15} aria-hidden="true" />
      <span>{connectionLabels[state]}</span>
    </div>
  );
}

function TeamColumn({
  side,
  label,
  discipline
}: {
  side: TeamSide;
  label: string;
  discipline?: SideDiscipline;
}) {
  return (
    <div className="team-column">
      <span className="eyebrow">{label}</span>
      <div className="team-identity">
        <CountryFlag
          flagUrl={side.flagUrl}
          code={side.countryCode}
          label={side.name}
          className="country-flag-large"
        />
        <div>
          <div className="team-name">{side.name}</div>
          <div className="team-code">{side.abbreviation}</div>
        </div>
      </div>
      <CardBadges
        discipline={discipline}
        align={label === "客队" ? "right" : "left"}
      />
      <TimeoutUsage
        discipline={discipline}
        align={label === "客队" ? "right" : "left"}
      />
    </div>
  );
}

function PeriodRow({
  period,
  currentGame
}: {
  period: GamePeriod;
  currentGame: number;
}) {
  const isCurrent = period.order === currentGame && !period.complete;
  return (
    <div
      className={`period-row ${period.complete ? "is-complete" : ""} ${
        isCurrent ? "is-current" : ""
      }`}
    >
      <span className="period-label">{period.label}</span>
      <strong className={period.winner === "home" ? "winner" : ""}>
        {period.home}
      </strong>
      <span className="period-separator">:</span>
      <strong className={period.winner === "away" ? "winner" : ""}>
        {period.away}
      </strong>
    </div>
  );
}

function ActiveMatch({
  match,
  timeout,
  cardAlert
}: {
  match: IndividualMatch | null;
  timeout: TimeoutState | null;
  cardAlert: boolean;
}) {
  if (!match) {
    return (
      <div className="empty-match">
        <CircleDot size={20} aria-hidden="true" />
        <span>暂无当前场次</span>
      </div>
    );
  }

  return (
    <section className="active-match-band" aria-live="polite">
      <div className="section-heading">
        <div>
          <span className="eyebrow">当前场次</span>
          <h2>{match.label}</h2>
        </div>
        <span className={`match-state ${statusClass(match.status)}`}>
          {statusLabels[match.status]}
        </span>
      </div>

      <div className="match-score-grid">
        <div
          className={`player-side ${
            timeout?.side === "home" ? "is-timeout" : ""
          }`}
        >
          <span className="side-tag">一方</span>
          <h3>
            <CountryFlag
              flagUrl={match.home.flagUrl}
              code={match.home.countryCode}
              label={match.home.name}
            />
            {match.home.name}
          </h3>
          <p>{match.home.abbreviation}</p>
          <CardBadges
            discipline={match.discipline.home}
            fresh={cardAlert}
          />
          <TimeoutUsage discipline={match.discipline.home} />
          <div className="games-score">{match.games.home}</div>
          <span className="score-caption">已赢局数</span>
        </div>

        <div className="point-score">
          <span className="point-label">
            第 {match.currentGame || 1} 局 · 当前小分
          </span>
          <div className="point-numbers">
            <strong>{match.points.home}</strong>
            <span>:</span>
            <strong>{match.points.away}</strong>
          </div>
          {match.server ? (
            <span className="serve-indicator">
              <CircleDot size={13} aria-hidden="true" />
              {match.server === "home"
                ? `${match.home.shortName} 发球`
                : `${match.away.shortName} 发球`}
            </span>
          ) : (
            <span className="serve-indicator muted">发球方待定</span>
          )}
        </div>

        <div
          className={`player-side align-right ${
            timeout?.side === "away" ? "is-timeout" : ""
          }`}
        >
          <span className="side-tag">另一方</span>
          <h3>
            {match.away.name}
            <CountryFlag
              flagUrl={match.away.flagUrl}
              code={match.away.countryCode}
              label={match.away.name}
            />
          </h3>
          <p>{match.away.abbreviation}</p>
          <CardBadges
            discipline={match.discipline.away}
            align="right"
            fresh={cardAlert}
          />
          <TimeoutUsage discipline={match.discipline.away} align="right" />
          <div className="games-score">{match.games.away}</div>
          <span className="score-caption">已赢局数</span>
        </div>
      </div>

      <div className="period-strip">
        {match.periods.length > 0 ? (
          match.periods.map((period) => (
            <PeriodRow
              key={`${match.key}-${period.order}`}
              period={period}
              currentGame={match.currentGame}
            />
          ))
        ) : (
          <span className="muted">暂无局记录</span>
        )}
      </div>
    </section>
  );
}

function CompletedMatches({ matches }: { matches: IndividualMatch[] }) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <section className="completed-band">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">比赛进程</span>
          <h2>已完成场次</h2>
        </div>
      </div>
      <div className="completed-list">
        {matches.map((match) => (
          <div className="completed-row" key={match.key}>
            <span className="completed-label">{match.label}</span>
            <span className="completed-player">
              <CountryFlag
                flagUrl={match.home.flagUrl}
                code={match.home.countryCode}
                label={match.home.name}
              />
              {match.home.shortName}
            </span>
            <strong>
              {match.games.home} : {match.games.away}
            </strong>
            <span className="completed-player align-right">
              {match.away.shortName}
              <CountryFlag
                flagUrl={match.away.flagUrl}
                code={match.away.countryCode}
                label={match.away.name}
              />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Scoreboard({ snapshot }: { snapshot: MatchSnapshot }) {
  const [cardAlert, setCardAlert] = useState(false);
  const cardSignatureRef = useRef<string | null>(null);
  const cardSignature = snapshotCardSignature(snapshot);

  useEffect(() => {
    if (cardSignatureRef.current === cardSignature) {
      return;
    }
    const isFirstObservation = cardSignatureRef.current === null;
    cardSignatureRef.current = cardSignature;
    if (isFirstObservation) {
      return;
    }

    setCardAlert(true);
    const timer = setTimeout(() => setCardAlert(false), 15000);
    return () => clearTimeout(timer);
  }, [cardSignature]);

  return (
    <article className="scoreboard">
      <div className="scoreboard-heading">
        <div>
          <span className="eyebrow">{snapshot.phase || "乒乓球"}</span>
          <h1>{snapshot.eventName}</h1>
          <p>{snapshot.unitLabel}</p>
        </div>
        <div className="venue">
          <span>
            <MapPin size={15} aria-hidden="true" />
            {snapshot.venue || "场馆待定"}
          </span>
          <span>
            <Clock3 size={15} aria-hidden="true" />
            {formatDateTime(snapshot.scheduledAt)} 日本时间
          </span>
        </div>
      </div>

      <div className="team-score-band" aria-live="polite">
        <TeamColumn
          side={snapshot.teams.home}
          label="主队"
          discipline={snapshot.teamDiscipline.home}
        />
        <div className="team-score-center">
          <span className="team-score-label">比赛大比分</span>
          <div className="team-score-number">
            <strong>{scoreText(snapshot.teamScore.home)}</strong>
            <span>:</span>
            <strong>{scoreText(snapshot.teamScore.away)}</strong>
          </div>
          <span className={`live-state ${statusClass(snapshot.status)}`}>
            {snapshot.live ? "LIVE" : statusLabels[snapshot.status]}
          </span>
        </div>
        <TeamColumn
          side={snapshot.teams.away}
          label="客队"
          discipline={snapshot.teamDiscipline.away}
        />
      </div>

      <TimeoutNotice
        timeout={snapshot.timeout}
        teams={snapshot.teams}
        activeMatch={snapshot.activeMatch}
      />
      <ActiveMatch
        match={snapshot.activeMatch}
        timeout={snapshot.timeout}
        cardAlert={cardAlert}
      />
      <CompletedMatches matches={snapshot.completedMatches} />
    </article>
  );
}

export function App() {
  const [view, setView] = useState<"scoreboard" | "routes">("scoreboard");
  const [input, setInput] = useState(getInitialInput);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleMatch[]>([]);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [status, setStatus] = useState<StreamStatus>({
    state: "connecting",
    lastUpdatedAt: null,
    socketConnected: false,
    message: "准备连接"
  });
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    void getSchedule()
      .then(setSchedule)
      .catch(() => {
        // The URL/KEY input remains available when the schedule is unavailable.
      });
  }, []);

  useEffect(() => {
    const initial = getInitialInput().trim();
    if (!initial) {
      return;
    }
    void loadMatch(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedKey) {
      return;
    }

    setSnapshot(null);
    setError(null);
    const stream = new EventSource(
      `/api/tt/matches/${encodeURIComponent(selectedKey)}/stream`
    );

    stream.addEventListener("snapshot", (event) => {
      setSnapshot(JSON.parse((event as MessageEvent).data) as MatchSnapshot);
      setError(null);
    });

    stream.addEventListener("status", (event) => {
      setStatus(JSON.parse((event as MessageEvent).data) as StreamStatus);
    });

    stream.onerror = () => {
      setStatus((current) => ({
        ...current,
        state: "stale",
        message: "本地实时连接中断，浏览器正在重连"
      }));
    };

    return () => stream.close();
  }, [selectedKey]);

  const loadMatch = async (value: string) => {
    setIsResolving(true);
    setError(null);
    try {
      const resolved = await resolveMatch(value);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("match", resolved.key);
      window.history.replaceState({}, "", nextUrl);
      window.localStorage.setItem("ag2026-match", resolved.key);
      setSelectedKey(resolved.key);
      setInput(resolved.key);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "无法解析比赛地址"
      );
    } finally {
      setIsResolving(false);
    }
  };

  const scheduleOptions = useMemo(() => {
    const seen = new Set<string>();
    return schedule.filter((match) => {
      if (seen.has(match.key)) {
        return false;
      }
      seen.add(match.key);
      return true;
    });
  }, [schedule]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Trophy size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>AG2026</strong>
            <span>乒乓球实时记分牌</span>
          </div>
        </div>
        <div className="topbar-status">
          <nav className="view-tabs" aria-label="视图">
            <button
              type="button"
              className={`view-tab${view === "scoreboard" ? " is-active" : ""}`}
              onClick={() => setView("scoreboard")}
            >
              <Activity size={15} aria-hidden="true" />
              实时记分牌
            </button>
            <button
              type="button"
              className={`view-tab${view === "routes" ? " is-active" : ""}`}
              onClick={() => setView("routes")}
            >
              <RouteIcon size={15} aria-hidden="true" />
              晋级路线
            </button>
          </nav>
          <span className="last-update">
            <Activity size={15} aria-hidden="true" />
            更新于 {formatUpdatedAt(status.lastUpdatedAt)}
          </span>
          <ConnectionBadge state={status.state} message={status.message} />
        </div>
      </header>

      {view === "routes" ? (
        <main>
          <RoutesView
            onSelectMatch={(key) => {
              setView("scoreboard");
              void loadMatch(key);
            }}
          />
        </main>
      ) : (
        <main>
        <section className="control-band">
          <div className="control-copy">
            <span className="eyebrow">比赛来源</span>
            <h2>选择一场 TTE 比赛</h2>
            <p>粘贴官方结果 URL 或比赛 KEY，也可以从赛程中直接选择。</p>
          </div>
          <form
            className="match-form"
            onSubmit={(event) => {
              event.preventDefault();
              void loadMatch(input);
            }}
          >
            <label className="input-wrap">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="官方比赛 URL 或 KEY"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://results.asiangames2026.org/#/discipline/TTE/results/..."
              />
            </label>
            <button className="primary-button" type="submit" disabled={isResolving}>
              {isResolving ? (
                <RefreshCw className="spin" size={17} aria-hidden="true" />
              ) : (
                <Search size={17} aria-hidden="true" />
              )}
              加载比赛
            </button>
          </form>
          <label className="schedule-select">
            <CalendarDays size={16} aria-hidden="true" />
            <select
              aria-label="TTE 赛程"
              value={selectedKey ?? ""}
              onChange={(event) => {
                if (event.target.value) {
                  void loadMatch(event.target.value);
                }
              }}
            >
              <option value="">从 TTE 赛程选择</option>
              {scheduleOptions.map((match) => (
                <option key={match.key} value={match.key}>
                  {match.home.countryCode
                    ? `[${match.home.countryCode}] `
                    : ""}
                  {match.home.name} vs{" "}
                  {match.away.countryCode
                    ? `[${match.away.countryCode}] `
                    : ""}
                  {match.away.name} ·{" "}
                  {match.eventName} · {match.phase} · {match.label}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <div className="error-message" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              {error}
            </div>
          ) : null}
        </section>

        <section className="source-note">
          <ListTree size={16} aria-hidden="true" />
          <span>
            数据由官方结果服务提供。实时通道异常时，后端会自动切换到轮询。
          </span>
        </section>

        {snapshot ? (
          <Scoreboard snapshot={snapshot} />
        ) : (
          <section className="empty-state">
            <div className="empty-icon">
              <Radio size={28} aria-hidden="true" />
            </div>
            <h2>等待比赛数据</h2>
            <p>输入一场正在进行的 TTE 比赛，比分将在这里实时显示。</p>
          </section>
        )}
      </main>
      )}
    </div>
  );
}
