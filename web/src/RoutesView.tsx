import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  RefreshCw,
  Route as RouteIcon,
  Trophy
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  RouteEntry,
  RouteEvent,
  RouteMatch,
  RouteParticipant,
  RouteRound,
  RoutesSnapshot,
  RouteStep
} from "../../shared/types";
import { getRoutes, refreshRoutes } from "./api";
import { CountryFlag } from "./CountryFlag";

const STATUS_LABELS: Record<RouteEntry["status"], string> = {
  champion: "🥇 冠军",
  "runner-up": "🥈 亚军",
  bronze: "🥉 季军",
  active: "晋级中",
  eliminated: "已出局"
};

const RESULT_LABELS: Record<RouteStep["result"], string> = {
  win: "胜",
  loss: "负",
  running: "进行中",
  pending: "待战",
  bye: "轮空"
};

const formatMatchTime = (value: string | null): string => {
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

const formatClock = (value: string | null): string => {
  if (!value) {
    return "尚未同步";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(date);
};

const sideLabel = (side: RouteParticipant | null): string =>
  side ? (side.bye ? "轮空" : side.name) : "待定";

function SideBadge({ side }: { side: RouteParticipant | null }) {
  if (!side || side.bye) {
    return <span className="side-badge is-bye">{sideLabel(side)}</span>;
  }
  return (
    <span className={`side-badge${side.winner ? " is-winner" : ""}`}>
      <CountryFlag
        flagUrl={side.flagUrl}
        code={side.countryCode}
        label={side.name}
        className="side-flag"
      />
      <span className="side-name">{side.name}</span>
    </span>
  );
}

function RouteCard({
  route,
  isTeam,
  onSelectMatch
}: {
  route: RouteEntry;
  isTeam: boolean;
  onSelectMatch: (key: string) => void;
}) {
  return (
    <article className={`route-card is-${route.status}`}>
      <header className="route-card-head">
        <CountryFlag
          flagUrl={route.flagUrl}
          code={route.countryCode}
          label={route.name}
          className="route-flag"
        />
        <div className="route-identity">
          <strong>{route.name}</strong>
          {route.abbreviation ? <span>{route.abbreviation}</span> : null}
        </div>
        <span className={`route-status is-${route.status}`}>
          {STATUS_LABELS[route.status]}
        </span>
      </header>

      <ol className="route-steps">
        {route.steps.map((step, index) => (
          <li
            className={`route-step is-${step.result}`}
            key={`${step.round}-${step.matchKey}-${index}`}
          >
            <span className="route-step-round">{step.round}</span>
            {step.result === "bye" ? (
              <span className="route-step-opponent is-bye">轮空</span>
            ) : (
              <span className="route-step-opponent">
                {step.opponentCountryCode || step.opponentFlagUrl ? (
                  <CountryFlag
                    flagUrl={step.opponentFlagUrl}
                    code={step.opponentCountryCode}
                    label={step.opponent}
                    className="side-flag"
                  />
                ) : null}
                {step.opponent}
              </span>
            )}
            <span className="route-step-score">
              {step.result === "bye" ? "" : step.score || RESULT_LABELS[step.result]}
            </span>
            {step.matchKey ? (
              <button
                className="link-button"
                type="button"
                onClick={() => onSelectMatch(step.matchKey)}
                title="在记分牌中打开这场比赛的详细信息"
              >
                记分牌
              </button>
            ) : (
              <span className="route-step-time">
                {step.result === "bye" ? "" : formatMatchTime(step.startAt)}
              </span>
            )}
            {step.games ? (
              <span className="route-step-games">
                {isTeam ? "小盘 " : ""}
                {step.games}
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      {route.next ? (
        <p className="route-next">
          <GitBranch size={14} aria-hidden="true" />
          下一轮 {route.next.round}：待战 {route.next.opponent} ·{" "}
          {formatMatchTime(route.next.startAt)}
          {route.next.location ? ` · ${route.next.location}` : ""}
        </p>
      ) : null}
    </article>
  );
}

function MatchRow({
  match,
  isTeam,
  onSelectMatch
}: {
  match: RouteMatch;
  isTeam: boolean;
  onSelectMatch: (key: string) => void;
}) {
  const score = match.walkover ? "W/O" : match.score || "—";
  return (
    <div className={`round-match is-${match.status.toLowerCase()}`}>
      <span className="round-match-index">第 {match.index} 场</span>
      <SideBadge side={match.home} />
      <span className="round-match-score">{score}</span>
      <SideBadge side={match.away} />
      <span className="round-match-meta">
        {formatMatchTime(match.startAt)}
        {match.location ? ` · ${match.location}` : ""}
        {match.feedsIntoIndex
          ? ` · 晋级至${match.feedsIntoRound ?? ""}第 ${match.feedsIntoIndex} 场`
          : ""}
      </span>
      <button
        className="ghost-button small"
        type="button"
        onClick={() => onSelectMatch(match.key)}
      >
        记分牌
      </button>
      {match.subScores ? (
        <span className="round-match-sub">小盘 {match.subScores}</span>
      ) : null}
      {match.games && !match.walkover ? (
        <span className="round-match-games">
          {isTeam ? "小盘比分" : "局分"} {match.games}
        </span>
      ) : null}
    </div>
  );
}

function RoundBlock({
  round,
  isTeam,
  open,
  onToggle,
  onSelectMatch
}: {
  round: RouteRound;
  isTeam: boolean;
  open: boolean;
  onToggle: () => void;
  onSelectMatch: (key: string) => void;
}) {
  const finished = round.matches.filter(
    (match) => match.status === "FINISHED"
  ).length;
  return (
    <section className={`round-block${open ? " is-open" : ""}`}>
      <button className="round-head" type="button" onClick={onToggle}>
        {open ? (
          <ChevronDown size={16} aria-hidden="true" />
        ) : (
          <ChevronRight size={16} aria-hidden="true" />
        )}
        <span className="round-head-name">{round.name}</span>
        <span className="round-head-meta">
          {round.matches.length} 场 · 已完赛 {finished} · 起{" "}
          {formatMatchTime(round.startAt)}
        </span>
      </button>
      {open ? (
        <div className="round-matches">
          {round.matches.map((match) => (
            <MatchRow
              key={match.key}
              match={match}
              isTeam={isTeam}
              onSelectMatch={onSelectMatch}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

const defaultOpenRounds = (event: RouteEvent): Record<string, boolean> => {
  const hasSide = (match: RouteMatch): boolean =>
    Boolean((match.home && !match.home.bye) || (match.away && !match.away.bye));
  const withParticipants = event.rounds.filter((round) =>
    round.matches.some(hasSide)
  );
  const current = withParticipants[withParticipants.length - 1]?.key;
  const previous = withParticipants[withParticipants.length - 2]?.key;
  const open: Record<string, boolean> = {};
  for (const round of [...event.rounds, ...event.groups]) {
    open[round.key] = round.key === current || round.key === previous;
  }
  return open;
};

export function RoutesView({
  onSelectMatch
}: {
  onSelectMatch: (key: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<RoutesSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rounds, setRounds] = useState<{
    eventKey: string;
    open: Record<string, boolean>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getRoutes()
      .then((value) => {
        if (!cancelled) {
          setSnapshot(value);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "无法获取晋级路线"
          );
        }
      });

    const stream = new EventSource("/api/tt/routes/stream");
    stream.addEventListener("routes", (event) => {
      setSnapshot(JSON.parse((event as MessageEvent).data) as RoutesSnapshot);
      setError(null);
    });
    stream.onerror = () => {
      setError("实时通道中断，浏览器正在重连（仍可手动刷新）");
    };

    const poll = setInterval(() => {
      void getRoutes()
        .then(setSnapshot)
        .catch(() => undefined);
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      stream.close();
    };
  }, []);

  const events = snapshot?.events ?? [];
  const active = useMemo(() => {
    if (activeKey) {
      const matched = events.find((event) => event.key === activeKey);
      if (matched) {
        return matched;
      }
    }
    return events.find((event) => !event.finished) ?? events[0] ?? null;
  }, [events, activeKey]);

  useEffect(() => {
    if (active) {
      setRounds((current) =>
        current?.eventKey === active.key
          ? current
          : { eventKey: active.key, open: defaultOpenRounds(active) }
      );
    }
  }, [active]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      setSnapshot(await refreshRoutes());
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : "刷新失败"
      );
    } finally {
      setRefreshing(false);
    }
  };

  const toggleRound = (key: string) => {
    setRounds((current) => {
      const open = current?.open ?? {};
      return {
        eventKey: current?.eventKey ?? active?.key ?? "",
        open: { ...open, [key]: !open[key] }
      };
    });
  };

  if (!active) {
    return (
      <section className="empty-state">
        <div className="empty-icon">
          <RouteIcon size={28} aria-hidden="true" />
        </div>
        <h2>{error ? "暂时无法获取晋级路线" : "正在加载晋级路线"}</h2>
        <p>{error ?? "正在从官方成绩服务读取各项目对阵与晋级情况…"}</p>
        <button className="primary-button" type="button" onClick={handleRefresh}>
          <RefreshCw size={16} aria-hidden="true" />
          重新加载
        </button>
      </section>
    );
  }

  const openRounds = rounds?.open ?? {};

  return (
    <div className="routes-view">
      <section className="routes-toolbar">
        <div className="event-tabs" role="tablist" aria-label="项目">
          {events.map((event) => (
            <button
              key={event.key}
              type="button"
              role="tab"
              aria-selected={event.key === active.key}
              className={`event-tab${event.key === active.key ? " is-active" : ""}`}
              onClick={() => setActiveKey(event.key)}
            >
              <strong>{event.shortName}</strong>
              <small>{event.finished ? "已结束" : event.stage}</small>
            </button>
          ))}
        </div>
        <div className="routes-actions">
          <span className="routes-updated">
            快照 {formatClock(snapshot?.updatedAt ?? null)}
            {snapshot?.stale ? "（数据可能已过期）" : ""}
          </span>
          <button
            className="ghost-button"
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={refreshing ? "spin" : undefined}
              size={16}
              aria-hidden="true"
            />
            强制刷新
          </button>
        </div>
      </section>

      {error ? (
        <div className="error-message" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <section className="routes-summary">
        <div className="summary-copy">
          <span className="eyebrow">{active.englishName}</span>
          <h2>{active.name}</h2>
          <p>
            {active.stage} · 已完赛 {active.finishedMatches}/{active.totalMatches}{" "}
            场 · 决赛 {formatMatchTime(active.finalStartAt)}
          </p>
        </div>
        {active.finished ? (
          <div className="medal-row">
            <span className="medal is-gold">
              <Trophy size={15} aria-hidden="true" />
              {active.champion ?? "—"}
            </span>
            <span className="medal is-silver">🥈 {active.runnerUp ?? "—"}</span>
            <span className="medal is-bronze">
              🥉 {active.bronze.join("、") || "—"}
            </span>
          </div>
        ) : null}
      </section>

      <section className="routes-section">
        <div className="routes-heading">
          <span className="eyebrow">晋级路线</span>
          <h2>
            {active.type === "team"
              ? "四强队伍晋级历程"
              : "当前签表内选手 / 组合的晋级历程"}
          </h2>
          <p>
            每条路线按时间顺序列出该选手（组合）打过的每一轮、对手与比分；"记分牌"可跳到该场的实时详情。
          </p>
        </div>
        <div className="route-grid">
          {active.routes.map((route) => (
            <RouteCard
              key={route.reg}
              route={route}
              isTeam={active.type === "team"}
              onSelectMatch={onSelectMatch}
            />
          ))}
        </div>
      </section>

      <section className="routes-section">
        <div className="routes-heading">
          <span className="eyebrow">对阵进程</span>
          <h2>{active.name}全部场次</h2>
          <p>默认展开当前轮次与上一轮，点击标题可展开其余轮次。</p>
        </div>
        <div className="round-list">
          {[...active.rounds, ...active.groups].map((round) => (
            <RoundBlock
              key={round.key}
              round={round}
              isTeam={active.type === "team"}
              open={openRounds[round.key] ?? false}
              onToggle={() => toggleRound(round.key)}
              onSelectMatch={onSelectMatch}
            />
          ))}
        </div>
      </section>
    </div>
  );
}