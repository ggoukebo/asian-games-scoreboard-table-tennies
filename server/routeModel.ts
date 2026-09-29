import type {
  MatchStatus,
  RouteEntry,
  RouteEvent,
  RouteMatch,
  RouteParticipant,
  RouteRound,
  RouteStep,
  RouteStepResult
} from "../shared/types";
import { getCountryCode, localizeSideName } from "./chineseNames";
import type { FlagMap } from "./flagAssets";
import { mapMatchStatus } from "./normalizer";

type RawRecord = Record<string, unknown>;

const asRecord = (value: unknown): RawRecord =>
  value !== null && typeof value === "object" ? (value as RawRecord) : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

/** 官方把「轮空」写成注册号 7/8/9，且没有名字 */
const BYE_REGISTRATIONS = new Set(["7", "8", "9"]);

const EVENT_META: Readonly<
  Record<string, { name: string; short: string; type: "team" | "knockout" }>
> = {
  "M.TEAM--------------": { name: "男子团体", short: "男团", type: "team" },
  "W.TEAM--------------": { name: "女子团体", short: "女团", type: "team" },
  "X.DOUBLES-----------": { name: "混合双打", short: "混双", type: "knockout" },
  "M.SINGLES-----------": { name: "男子单打", short: "男单", type: "knockout" },
  "W.SINGLES-----------": { name: "女子单打", short: "女单", type: "knockout" },
  "M.DOUBLES-----------": { name: "男子双打", short: "男双", type: "knockout" },
  "W.DOUBLES-----------": { name: "女子双打", short: "女双", type: "knockout" }
};

/** 页面与报告的项目顺序：团体 → 混双 → 单打 → 双打 */
export const EVENT_ORDER: readonly string[] = [
  "M.TEAM--------------",
  "W.TEAM--------------",
  "X.DOUBLES-----------",
  "M.SINGLES-----------",
  "W.SINGLES-----------",
  "M.DOUBLES-----------",
  "W.DOUBLES-----------"
];

const ROUND_NAMES: Readonly<Record<string, string>> = {
  "R64-": "第一轮（64强）",
  "R32-": "第二轮（32强）",
  "8FNL": "第三轮（16强）",
  QFNL: "1/4决赛",
  SFNL: "半决赛",
  "FNL-": "决赛"
};

export const roundSegment = (phaseKey: string): string => {
  const parts = phaseKey.split(".");
  return parts.length >= 2 ? parts[parts.length - 1] : phaseKey;
};

export const isGroupPhase = (phaseKey: string): boolean =>
  /\.GP[A-Z]-$/.test(phaseKey);

export const roundName = (phaseKey: string): string => {
  const segment = roundSegment(phaseKey);
  if (isGroupPhase(phaseKey)) {
    return `小组赛 ${segment.slice(2, 3)} 组`;
  }
  return ROUND_NAMES[segment] ?? phaseKey;
};

export const matchIndex = (unitKey: string): number => {
  const digits =
    (unitKey.match(/\.([0-9]+)/g) ?? []).pop()?.replace(".", "") ?? "";
  const parsed = Number.parseInt(digits.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const tableLabel = (locDesc: string): string => {
  const matched = locDesc.match(/Table\s*(\d+)/i);
  return matched ? `${matched[1]} 号台` : locDesc;
};

const compactScore = (value: string): string =>
  value.replace(/\s+/g, "").replace(/^(\d+):(\d+)$/, "$1-$2");

export const isWalkoverGames = (games: string): boolean =>
  games.trim().toUpperCase() === "W/O";

/** 官方用于表示“已确认完赛”的状态值 */
export const isFinishedStatus = (status: string | null): boolean => {
  const value = (status ?? "").toUpperCase();
  return value === "OFFICIAL" || value === "FINISHED" || value === "FINAL";
};

export const isLiveStatus = (status: string | null): boolean => {
  const value = (status ?? "").toUpperCase();
  return value === "RUNNING" || value === "LIVE";
};

export interface ScheduleStatus {
  status: string | null;
  live: boolean;
}

/** 场次 Key → 赛程中的状态，用于决定单场结果的缓存时长 */
export const collectScheduleStatuses = (
  rawUnits: unknown
): Map<string, ScheduleStatus> => {
  const map = new Map<string, ScheduleStatus>();
  for (const eventValue of asArray(rawUnits)) {
    for (const phaseValue of asArray(asRecord(eventValue).Phases)) {
      for (const unitValue of asArray(asRecord(phaseValue).Units)) {
        const unit = asRecord(unitValue);
        const key = text(unit.Key);
        if (key) {
          map.set(key, {
            status: text(unit.Status) || null,
            live: unit.IsLive === true
          });
        }
      }
    }
  }
  return map;
};

/**
 * 赛程与单场结果的状态来源不同：单场结果更早确认“已完赛”，
 * 而赛程更早反映“进行中”，因此只在单场结果表示完赛时采用它。
 */
export const resolveStatusValue = (
  scheduleStatus: string | null,
  detailStatus: string | null
): string | null =>
  isFinishedStatus(detailStatus) ? detailStatus : scheduleStatus ?? detailStatus;

/* ------------------------------ 单场结果补充 ------------------------------ */

/** 由 /results/{key} 提取的补充信息：逐局比分、团体小盘比分、双打成员中文名 */
export interface DetailSide {
  reg: string;
  org: string;
  name: string | null;
  shortName: string | null;
  score: string | null;
  winner: boolean;
}

export interface MatchDetail {
  status: string | null;
  games: string;
  subScores: string;
  score: string | null;
  home: DetailSide;
  away: DetailSide;
}

const emptySide = (): DetailSide => ({
  reg: "",
  org: "",
  name: null,
  shortName: null,
  score: null,
  winner: false
});

export const toMatchDetail = (value: unknown): MatchDetail => {
  const record = asRecord(value);
  const info = asRecord(record.Info);
  const results = asRecord(record.Results);
  const competitors = asArray(record.Competitors).map(asRecord);
  const side = (index: number): DetailSide => {
    const competitor = competitors[index];
    if (!competitor) {
      return emptySide();
    }
    const localized = localizeSideName(competitor, text(competitor.Name));
    return {
      reg: text(competitor.Reg),
      org: text(competitor.Org).toUpperCase(),
      name: localized.name,
      shortName: localized.shortName,
      score: text(competitor.Result) || null,
      winner: competitor.Winner === true
    };
  };

  return {
    status: text(info.Status) || null,
    games: text(results.ResDetail),
    subScores: asArray(record.SubUnits)
      .map((unit) => text(asRecord(asRecord(unit).Results).Result))
      .filter(Boolean)
      .join("、"),
    score: text(results.Result) || null,
    home: side(0),
    away: side(1)
  };
};

/* --------------------------------- 模型构建 -------------------------------- */

interface Round extends RouteRound {
  order: number;
}

interface BuildContext {
  details: ReadonlyMap<string, MatchDetail>;
  flags: FlagMap;
}

const buildParticipant = (
  sideValue: unknown,
  detailSide: DetailSide | undefined,
  flags: FlagMap
): RouteParticipant | null => {
  const side = asRecord(sideValue);
  const scheduleReg = text(side.Reg);
  const reg = detailSide?.reg || scheduleReg;
  const abbreviation = (detailSide?.org || text(side.Org)).toUpperCase();
  const detailName = detailSide?.name ?? null;
  const hasName = Boolean(text(side.Name) || text(side.NameS));
  if (!reg && !hasName && !detailName) {
    return null;
  }

  const bye = BYE_REGISTRATIONS.has(scheduleReg) || (!hasName && !detailName);
  const localized = bye
    ? { name: "轮空", shortName: "轮空" }
    : detailName
      ? { name: detailName, shortName: detailSide?.shortName ?? detailName }
      : localizeSideName(side, text(side.NameS, text(side.Name, "待定")));

  return {
    reg: bye ? "" : reg,
    name: localized.name,
    shortName: localized.shortName,
    abbreviation: bye ? "" : abbreviation,
    countryCode: bye ? null : getCountryCode(side) ?? (abbreviation || null),
    flagUrl: !bye && abbreviation ? (flags[abbreviation] ?? null) : null,
    score: detailSide?.score ?? text(side.Result),
    winner: detailSide?.winner === true || side.Winner === true,
    bye
  };
};

const numericWinner = (
  home: RouteParticipant | null,
  away: RouteParticipant | null
): "home" | "away" | null => {
  const homeScore = Number.parseInt(home?.score ?? "", 10);
  const awayScore = Number.parseInt(away?.score ?? "", 10);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return null;
  }
  if (homeScore === awayScore) {
    return null;
  }
  return homeScore > awayScore ? "home" : "away";
};

const buildMatch = (
  unitValue: unknown,
  key: string,
  context: BuildContext
): RouteMatch => {
  const unit = asRecord(unitValue);
  const detail = context.details.get(key);
  const home = buildParticipant(unit.Home, detail?.home, context.flags);
  const away = buildParticipant(unit.Away, detail?.away, context.flags);
  const status: MatchStatus = mapMatchStatus(
    resolveStatusValue(text(unit.Status) || null, detail?.status ?? null),
    Boolean(unit.IsLive)
  );
  const scheduleScore = compactScore(text(unit.Result));
  const detailScore = compactScore(detail?.score ?? "");
  const score =
    scheduleScore ||
    detailScore ||
    (home && away && !home.bye && !away.bye && home.score && away.score
      ? `${home.score}-${away.score}`
      : "");
  const games = detail?.games ?? "";
  // 部分场次官方未回填 Winner，此时用总比分推断（仅限已结束的比赛）
  const winner: "home" | "away" | null = home?.winner
    ? "home"
    : away?.winner
      ? "away"
      : status === "FINISHED"
        ? numericWinner(home, away)
        : null;

  return {
    key,
    index: matchIndex(key),
    label: text(unit.UnitDescA, text(unit.UnitDesc, key)),
    status,
    statusDescription: text(unit.StatusDesc, text(unit.Status)),
    startAt: text(unit.DateTimeRaw) || null,
    venue: text(unit.VenueDesc, text(unit.Venue)),
    location: tableLabel(text(unit.LocDesc)),
    score,
    games,
    subScores: detail?.subScores ?? "",
    walkover: isWalkoverGames(games),
    home,
    away,
    winner,
    feedsIntoKey: null,
    feedsIntoRound: null,
    feedsIntoIndex: null,
    feederKeys: [null, null]
  };
};

/** 注册号优先；官方偶尔不回填注册号（例如刚填好对阵的双打），此时用姓名匹配 */
export const participantIdentity = (participant: RouteParticipant): string =>
  participant.reg || `name:${participant.name}`;

const matchesSide = (
  side: RouteParticipant | null,
  identity: string,
  name: string
): boolean => {
  if (!side || side.bye) {
    return false;
  }
  if (side.reg) {
    return side.reg === identity;
  }
  return identity.startsWith("name:") && side.name === name;
};

const slotOf = (
  match: RouteMatch,
  identity: string,
  name: string
): "home" | "away" | null =>
  matchesSide(match.home, identity, name)
    ? "home"
    : matchesSide(match.away, identity, name)
      ? "away"
      : null;

const hasParticipant = (match: RouteMatch): boolean =>
  Boolean(
    (match.home && !match.home.bye) || (match.away && !match.away.bye)
  );

const orientScore = (score: string, slot: "home" | "away"): string => {
  const matched = score.match(/^(\d+)-(\d+)$/);
  if (!matched) {
    return score;
  }
  return slot === "home"
    ? `${matched[1]}-${matched[2]}`
    : `${matched[2]}-${matched[1]}`;
};

const orientGames = (games: string, slot: "home" | "away"): string => {
  if (!games) {
    return games;
  }
  return games
    .split(",")
    .map((game) => {
      const matched = game.trim().match(/^(\d+)\s*([:\-])\s*(\d+)$/);
      if (!matched) {
        return game.trim();
      }
      return slot === "home"
        ? `${matched[1]}:${matched[3]}`
        : `${matched[3]}:${matched[1]}`;
    })
    .join(", ");
};

export const collectRounds = (
  rawUnits: unknown,
  context: BuildContext = { details: new Map(), flags: {} }
): Map<string, { event: RawRecord; rounds: Round[] }> => {
  const buckets = new Map<string, { event: RawRecord; rounds: Round[] }>();

  for (const eventValue of asArray(rawUnits)) {
    const event = asRecord(eventValue);
    const eventKey = text(event.EvKey);
    if (!EVENT_META[eventKey]) {
      continue;
    }
    const bucket = buckets.get(eventKey) ?? { event, rounds: [] };
    buckets.set(eventKey, bucket);

    for (const phaseValue of asArray(event.Phases)) {
      const phase = asRecord(phaseValue);
      const units = asArray(phase.Units);
      if (units.length === 0) {
        continue;
      }
      const matches = units
        .map((unit) => buildMatch(unit, text(asRecord(unit).Key), context))
        .filter((match) => Boolean(match.key))
        .sort((left, right) => left.index - right.index);
      bucket.rounds.push({
        key: text(phase.Key),
        name: roundName(text(phase.Key)),
        isGroup: isGroupPhase(text(phase.Key)),
        startAt: matches[0]?.startAt ?? null,
        matches,
        order: Number(phase.Order ?? 0)
      });
    }
  }

  return buckets;
};

const linkRounds = (knockouts: Round[]): void => {
  for (let roundIndex = 0; roundIndex < knockouts.length; roundIndex += 1) {
    const round = knockouts[roundIndex];
    const previous = roundIndex > 0 ? knockouts[roundIndex - 1] : null;
    const byIndex = new Map(
      previous?.matches.map((match) => [match.index, match]) ?? []
    );
    for (const match of round.matches) {
      if (!previous) {
        continue;
      }
      match.feederKeys = [
        byIndex.get(match.index * 2 - 1)?.key ?? null,
        byIndex.get(match.index * 2)?.key ?? null
      ];
    }
  }

  for (let roundIndex = 0; roundIndex < knockouts.length - 1; roundIndex += 1) {
    const next = knockouts[roundIndex + 1];
    const byIndex = new Map(next.matches.map((match) => [match.index, match]));
    for (const match of knockouts[roundIndex].matches) {
      const target = byIndex.get(Math.ceil(match.index / 2));
      if (target) {
        match.feedsIntoKey = target.key;
        match.feedsIntoRound = next.name;
        match.feedsIntoIndex = target.index;
      }
    }
  }
};

const knockoutsOf = (rounds: Round[]): Round[] =>
  rounds
    .filter((round) => !round.isGroup)
    .sort((left, right) => right.order - left.order);

const buildRoute = (
  knockouts: Round[],
  participant: RouteParticipant
): RouteEntry => {
  const identity = participantIdentity(participant);
  const name = participant.name;
  const roundsWithReg = knockouts
    .map((round, index) =>
      round.matches.some((match) => slotOf(match, identity, name) !== null)
        ? index
        : -1
    )
    .filter((index) => index >= 0);

  const steps: RouteStep[] = [];
  let lastMatch: RouteMatch | null = null;

  if (roundsWithReg.length > 0) {
    const lastIndex = roundsWithReg[roundsWithReg.length - 1];
    for (let index = 0; index <= lastIndex; index += 1) {
      const round = knockouts[index];
      const match =
        round.matches.find((item) => slotOf(item, identity, name) !== null) ??
        null;
      if (!match) {
        steps.push({
          round: round.name,
          matchKey: "",
          opponent: "",
          opponentAbbreviation: "",
          opponentCountryCode: null,
          opponentFlagUrl: null,
          score: "",
          games: "",
          result: "bye",
          startAt: round.startAt,
          venue: "",
          location: ""
        });
        continue;
      }

      lastMatch = match;
      const slot = slotOf(match, identity, name)!;
      const self = slot === "home" ? match.home : match.away;
      const opponent = slot === "home" ? match.away : match.home;
      const result: RouteStepResult = self?.winner
        ? "win"
        : match.status === "FINISHED"
          ? "loss"
          : match.status === "RUNNING"
            ? "running"
            : "pending";

      steps.push({
        round: round.name,
        matchKey: match.key,
        opponent: opponent?.bye ? "轮空" : (opponent?.name ?? "待定"),
        opponentAbbreviation: opponent?.abbreviation ?? "",
        opponentCountryCode: opponent?.countryCode ?? null,
        opponentFlagUrl: opponent?.flagUrl ?? null,
        score: match.walkover ? "W/O" : orientScore(match.score, slot),
        games: match.walkover ? "" : orientGames(match.games, slot),
        result,
        startAt: match.startAt,
        venue: match.venue,
        location: match.location
      });
    }
  }

  const finalMatch = knockouts[knockouts.length - 1]?.matches[0] ?? null;
  const isFinal = Boolean(lastMatch && finalMatch && lastMatch.key === finalMatch.key);
  const isSemi = lastMatch?.key.includes(".SFNL.") === true;
  let status: RouteEntry["status"] = "eliminated";
  if (lastMatch && lastMatch.winner === null) {
    status = "active";
  } else if (lastMatch) {
    const won = slotOf(lastMatch, identity, name) === lastMatch.winner;
    status = won
      ? isFinal
        ? "champion"
        : "active"
      : isFinal
        ? "runner-up"
        : isSemi
          ? "bronze"
          : "eliminated";
  }

  let next: RouteEntry["next"] = null;
  if (lastMatch?.feedsIntoKey && status === "active") {
    const all = knockouts.flatMap((round) => round.matches);
    const target =
      all.find((match) => match.key === lastMatch?.feedsIntoKey) ?? null;
    if (target && !target.home?.reg && !target.away?.reg) {
      const siblingKey =
        target.feederKeys[lastMatch.key === target.feederKeys[0] ? 1 : 0] ?? null;
      const sibling = all.find((match) => match.key === siblingKey) ?? null;
      const siblingWinner =
        sibling && sibling.winner
          ? sibling.winner === "home"
            ? sibling.home
            : sibling.away
          : null;
      const targetRound = knockouts.find((round) =>
        round.matches.some((match) => match.key === target.key)
      );
      next = {
        round: targetRound?.name ?? "下一轮",
        opponent: siblingWinner?.name ?? "另一场胜者（待定）",
        startAt: target.startAt,
        venue: target.venue,
        location: target.location
      };
    }
  }

  return {
    reg: identity,
    name: participant.name,
    abbreviation: participant.abbreviation,
    countryCode: participant.countryCode,
    flagUrl: participant.flagUrl,
    status,
    steps,
    next,
    matchKey: lastMatch?.key ?? ""
  };
};

/** 当前仍在签表中的选手/组合（至少给出 4 个，便于展示半决赛级别的路线） */
const focusMatches = (knockouts: Round[]): RouteMatch[] => {
  const selected: RouteMatch[] = [];
  let participantCount = 0;
  for (let index = knockouts.length - 1; index >= 0; index -= 1) {
    const round = knockouts[index];
    if (!round.matches.some(hasParticipant)) {
      continue;
    }
    selected.push(...round.matches);
    participantCount = new Set(
      selected
        .flatMap((match) => [match.home, match.away])
        .filter(
          (side): side is RouteParticipant => Boolean(side && !side.bye)
        )
        .map(participantIdentity)
    ).size;
    if (participantCount >= 4) {
      break;
    }
  }
  return selected;
};

const stageText = (knockouts: Round[]): string => {
  const finalMatch = knockouts[knockouts.length - 1]?.matches[0];
  if (finalMatch?.winner) {
    return "已结束";
  }
  let current: RouteRound | null = null;
  for (let index = knockouts.length - 1; index >= 0; index -= 1) {
    if (knockouts[index].matches.some(hasParticipant)) {
      current = knockouts[index];
      break;
    }
  }
  if (!current) {
    return "未开始";
  }
  const running = current.matches.some((match) => match.status === "RUNNING");
  return running ? `${current.name}进行中` : `${current.name}待战`;
};

export const buildRouteEvents = (
  rawUnits: unknown,
  details: ReadonlyMap<string, MatchDetail> = new Map(),
  flags: FlagMap = {}
): RouteEvent[] => {
  const context: BuildContext = { details, flags };
  const buckets = collectRounds(rawUnits, context);
  const events: RouteEvent[] = [];

  for (const [eventKey, bucket] of buckets) {
    const meta = EVENT_META[eventKey];
    const rounds = bucket.rounds;
    const knockouts = knockoutsOf(rounds);
    const groups = rounds
      .filter((round) => round.isGroup)
      .sort((left, right) => left.key.localeCompare(right.key));
    linkRounds(knockouts);

    const routes: RouteEntry[] = [];
    for (const match of focusMatches(knockouts)) {
      for (const participant of [match.home, match.away]) {
        if (!participant || participant.bye) {
          continue;
        }
        const identity = participantIdentity(participant);
        if (routes.some((route) => route.reg === identity)) {
          continue;
        }
        routes.push(buildRoute(knockouts, participant));
      }
    }

    const finalMatch = knockouts[knockouts.length - 1]?.matches[0] ?? null;
    const semi = knockouts.find((round) => round.key.endsWith("SFNL"));
    const everyRound = [...groups, ...knockouts];

    events.push({
      key: eventKey,
      name: meta.name,
      shortName: meta.short,
      englishName: text(bucket.event.Desc, meta.name),
      type: meta.type,
      stage: stageText(knockouts),
      finished: Boolean(finalMatch?.winner),
      champion: finalMatch?.winner
        ? (finalMatch.winner === "home" ? finalMatch.home : finalMatch.away)?.name ??
          null
        : null,
      runnerUp: finalMatch?.winner
        ? (finalMatch.winner === "home" ? finalMatch.away : finalMatch.home)?.name ??
          null
        : null,
      bronze: (semi?.matches ?? [])
        .map((match) => (match.winner === "home" ? match.away : match.home))
        .filter((side): side is RouteParticipant => Boolean(side?.name))
        .map((side) => side.name),
      totalMatches: everyRound.reduce(
        (sum, round) => sum + round.matches.length,
        0
      ),
      finishedMatches: everyRound.reduce(
        (sum, round) =>
          sum +
          round.matches.filter((match) => match.status === "FINISHED").length,
        0
      ),
      finalMatchKey: finalMatch?.key ?? null,
      finalStartAt: finalMatch?.startAt ?? null,
      rounds: knockouts,
      groups,
      routes
    });
  }

  return events.sort(
    (left, right) =>
      EVENT_ORDER.indexOf(left.key) - EVENT_ORDER.indexOf(right.key)
  );
};

/* ------------------------------ 需要补全的场次 ------------------------------ */

/**
 * 选出值得抓取单场结果的场次：当前轮次（含正在进行）与下一轮，以及前一整轮，
 * 用于补齐逐局比分、团体小盘比分与双打组合的中文名。
 */
export const selectDetailKeys = (
  rawUnits: unknown,
  cachedKeys: ReadonlySet<string>,
  limit: number
): string[] => {
  const priorityLists: string[][] = [];
  const secondaryLists: string[][] = [];
  const historyLists: string[][] = [];

  for (const eventValue of asArray(rawUnits)) {
    const event = asRecord(eventValue);
    if (!EVENT_META[text(event.EvKey)]) {
      continue;
    }
    const phases = asArray(event.Phases)
      .map((value) => {
        const phase = asRecord(value);
        return {
          key: text(phase.Key),
          order: Number(phase.Order ?? 0),
          units: asArray(phase.Units)
        };
      })
      .filter((phase) => phase.units.length > 0)
      .sort((left, right) => left.order - right.order); // 决赛 → 首轮

    const scheduledParticipants = (units: unknown[]): boolean =>
      units.some((unit) => {
        const record = asRecord(unit);
        const home = asRecord(record.Home);
        const away = asRecord(record.Away);
        return Boolean(text(home.Name) || text(away.Name));
      });

    const focusIndex = phases.findIndex((phase) =>
      scheduledParticipants(phase.units)
    );
    if (focusIndex < 0) {
      continue;
    }

    const priority: string[] = [];
    const secondary: string[] = [];
    const focus = phases[focusIndex];
    for (const unit of focus.units) {
      const record = asRecord(unit);
      const key = text(record.Key);
      if (!key) {
        continue;
      }
      const status = text(record.Status).toUpperCase();
      if (status === "RUNNING" || record.IsLive === true) {
        priority.push(key);
      } else {
        secondary.push(key);
      }
    }
    for (const phase of [phases[focusIndex + 1], phases[focusIndex - 1]]) {
      for (const unit of phase?.units ?? []) {
        const key = text(asRecord(unit).Key);
        if (key) {
          secondary.push(key);
        }
      }
    }

    // 更早的轮次：从靠近当前轮次的一侧开始，逐轮补齐（每轮上限有限，靠多轮刷新累积）
    const history: string[] = [];
    for (const phase of phases.slice(focusIndex + 2)) {
      for (const unit of phase.units) {
        const key = text(asRecord(unit).Key);
        if (key) {
          history.push(key);
        }
      }
    }

    priorityLists.push(priority);
    secondaryLists.push(secondary);
    historyLists.push(history);
  }

  const selected: string[] = [];
  const push = (key: string): void => {
    if (!key || cachedKeys.has(key) || selected.includes(key)) {
      return;
    }
    if (selected.length < limit) {
      selected.push(key);
    }
  };
  // 各项目轮流取一个场次，避免排在最后的项目一直拿不到配额
  const pushRoundRobin = (lists: string[][]): void => {
    let cursor = 0;
    while (selected.length < limit) {
      let moved = false;
      for (const list of lists) {
        if (cursor >= list.length) {
          continue;
        }
        moved = true;
        push(list[cursor]);
      }
      if (!moved) {
        return;
      }
      cursor += 1;
    }
  };

  pushRoundRobin(priorityLists);
  pushRoundRobin(secondaryLists);
  pushRoundRobin(historyLists);
  return selected;
};

/** 用于判断模型是否发生变化（避免无谓推送） */
export const routeSignature = (events: RouteEvent[]): string =>
  events
    .map(
      (event) =>
        `${event.key}|${event.stage}|${event.champion ?? ""}|` +
        event.rounds
          .map((round) =>
            round.matches
              .map(
                (match) =>
                  `${match.key}:${match.status}:${match.score}:${match.games}:${match.winner ?? ""}`
              )
              .join(",")
          )
          .join(";") +
        `|${event.routes
          .map((route) => `${route.reg}:${route.status}`)
          .join(",")}`
    )
    .join("#");