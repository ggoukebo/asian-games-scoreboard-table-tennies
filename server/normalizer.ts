import type {
  GamePeriod,
  IndividualMatch,
  MatchSnapshot,
  MatchStatus,
  Player,
  SideDiscipline,
  TeamSide
} from "../shared/types";
import {
  getCountryCode,
  localizeAthleteName,
  localizeSideName
} from "./chineseNames";
import type { FlagMap } from "./flagAssets";

type RawRecord = Record<string, unknown>;

const asRecord = (value: unknown): RawRecord =>
  value !== null && typeof value === "object" ? (value as RawRecord) : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const integer = (value: unknown, fallback = 0): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nullableInteger = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const extensionValue = (record: RawRecord, code: string): string => {
  const extensions = asArray(record.Extensions);
  const match = extensions.find(
    (item) => text(asRecord(item).Code) === code
  );
  return text(asRecord(match).Value);
};

const countExtension = (record: RawRecord, code: string): number => {
  const parsed = Number.parseInt(extensionValue(record, code), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * 官方数据把牌与暂停记录在选手（或队伍）的 RESULT_INFO 扩展里：
 * CardY 黄牌、Card1/Card2 红牌、CoachCardYellow/CoachCardRed 教练牌、
 * Timeout 已用暂停次数（CardT 与 Timeout 同步增长，属于暂停本身，不单独展示）。
 */
export const readDiscipline = (competitor: RawRecord): SideDiscipline => ({
  yellowCards: countExtension(competitor, "CardY"),
  redCards:
    countExtension(competitor, "Card1") + countExtension(competitor, "Card2"),
  coachYellowCards: countExtension(competitor, "CoachCardYellow"),
  coachRedCards: countExtension(competitor, "CoachCardRed"),
  timeoutsUsed: countExtension(competitor, "Timeout")
});

const normalizeDiscipline = (
  competitors: RawRecord[]
): { home: SideDiscipline; away: SideDiscipline } => ({
  home: readDiscipline(competitors[0] ?? {}),
  away: readDiscipline(competitors[1] ?? {})
});

export const mapMatchStatus = (
  status: unknown,
  isLive = false
): MatchStatus => {
  if (isLive) {
    return "RUNNING";
  }

  switch (text(status).toUpperCase()) {
    case "RUNNING":
    case "LIVE":
      return "RUNNING";
    case "OFFICIAL":
    case "FINISHED":
    case "FINAL":
      return "FINISHED";
    case "START_LIST":
    case "PROVISIONAL":
    case "PLANNED":
    case "SCHEDULED":
      return "SCHEDULED";
    default:
      return "UNKNOWN";
  }
};

const parseScorePair = (
  value: unknown
): { home: number | null; away: number | null } => {
  const match = text(value).match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!match) {
    return { home: null, away: null };
  }

  return {
    home: Number.parseInt(match[1], 10),
    away: Number.parseInt(match[2], 10)
  };
};

const normalizePlayers = (competitor: RawRecord): Player[] =>
  asArray(competitor.Members).map((item, index) => {
    const member = asRecord(item);
    const localized = localizeAthleteName(member, `选手 ${index + 1}`);

    return {
      id: text(member.Reg, `${index + 1}`),
      name: localized.name,
      shortName: localized.shortName
    };
  });

const normalizeSide = (
  competitorValue: unknown,
  fallbackScore: number | null,
  flags: FlagMap = {}
): TeamSide => {
  const competitor = asRecord(competitorValue);
  const explicitScore = nullableInteger(competitor.Result);
  const localized = localizeSideName(competitorValue);
  const abbreviation = text(competitor.Org, "TBD");

  return {
    id: text(competitor.Reg),
    name: localized.name,
    shortName: localized.shortName,
    abbreviation,
    countryCode: getCountryCode(competitor),
    flagUrl: flags[abbreviation.toUpperCase()] ?? null,
    score: explicitScore ?? fallbackScore,
    players: normalizePlayers(competitor)
  };
};

const normalizePeriods = (
  rawPeriods: unknown,
  currentGame: number,
  status: MatchStatus
): GamePeriod[] =>
  asArray(rawPeriods).map((value, index) => {
    const period = asRecord(value);
    const order = integer(period.Order, index + 1);
    const home = integer(period.ResHome);
    const away = integer(period.ResAway);
    const hasScore = home > 0 || away > 0;
    const regulationComplete =
      (home >= 11 || away >= 11) && Math.abs(home - away) >= 2;
    const complete =
      regulationComplete || (status !== "RUNNING" && hasScore);
    const winner =
      complete && home !== away ? (home > away ? "home" : "away") : null;

    return {
      order,
      home,
      away,
      label: text(period.DescS, text(period.Desc, `第 ${order} 局`)),
      complete:
        complete &&
        (order < currentGame || regulationComplete),
      winner
    };
  });

const currentPoints = (
  periods: GamePeriod[],
  currentGame: number
): { home: number; away: number } => {
  const period =
    periods.find((item) => item.order === currentGame) ??
    [...periods].reverse().find((item) => item.home > 0 || item.away > 0);

  return {
    home: period?.home ?? 0,
    away: period?.away ?? 0
  };
};

const countGameWins = (
  periods: GamePeriod[]
): { home: number; away: number } =>
  periods.reduce(
    (score, period) => {
      if (period.winner === "home") {
        score.home += 1;
      } else if (period.winner === "away") {
        score.away += 1;
      }
      return score;
    },
    { home: 0, away: 0 }
  );

const normalizeIndividualMatch = (
  value: unknown,
  index: number,
  flags: FlagMap = {}
): IndividualMatch => {
  const unit = asRecord(value);
  const info = asRecord(unit.Info);
  const results = asRecord(unit.Results);
  const competitors = asArray(unit.Competitors).map(asRecord);
  const status = mapMatchStatus(info.Status, Boolean(info.IsLive));
  const currentGame = integer(results.CurrentPeriod);
  const periods = normalizePeriods(results.Periods, currentGame, status);
  const derivedGames = countGameWins(periods);
  const home = normalizeSide(competitors[0], derivedGames.home, flags);
  const away = normalizeSide(competitors[1], derivedGames.away, flags);
  const homeServer = extensionValue(competitors[0] ?? {}, "Server") === "true";
  const awayServer = extensionValue(competitors[1] ?? {}, "Server") === "true";
  const serverHomeAway = extensionValue(results, "ServerHomeAway");
  const server =
    serverHomeAway === "1"
      ? "home"
      : serverHomeAway === "2"
        ? "away"
        : homeServer
          ? "home"
          : awayServer
            ? "away"
            : null;
  const winner =
    status === "FINISHED" && home.score !== away.score
      ? (home.score ?? 0) > (away.score ?? 0)
        ? "home"
        : "away"
      : null;

  return {
    key: text(info.Key, text(info.RSC, `subunit-${index + 1}`)),
    order:
      nullableInteger(extensionValue(results, "SubMatchNum")) ?? index + 1,
    label: text(info.UnitDescA, text(info.UnitDesc, `第 ${index + 1} 场`)),
    status,
    statusDescription: text(info.StatusDesc, text(info.Status)),
    home,
    away,
    games: {
      home: home.score ?? derivedGames.home,
      away: away.score ?? derivedGames.away
    },
    currentGame,
    points: currentPoints(periods, currentGame),
    periods,
    server,
    winner,
    discipline: normalizeDiscipline(competitors)
  };
};

const normalizeTeamScore = (
  results: RawRecord,
  competitors: RawRecord[],
  completed: IndividualMatch[],
  running?: IndividualMatch
): { home: number | null; away: number | null } => {
  if (completed.length > 0 || running) {
    const allMatches = running ? [...completed, running] : completed;
    return allMatches.reduce(
      (score, match) => {
        if (match.status === "FINISHED" && match.winner === "home") {
          score.home += 1;
        }
        if (match.status === "FINISHED" && match.winner === "away") {
          score.away += 1;
        }
        return score;
      },
      { home: 0, away: 0 }
    );
  }

  const detailScore = parseScorePair(results.ResDetail);
  if (detailScore.home !== null && detailScore.away !== null) {
    return detailScore;
  }

  const explicitHome = nullableInteger(competitors[0]?.Result);
  const explicitAway = nullableInteger(competitors[1]?.Result);
  if (explicitHome !== null || explicitAway !== null) {
    return {
      home: explicitHome ?? 0,
      away: explicitAway ?? 0
    };
  }

  return { home: null, away: null };
};

export const normalizeMatch = (
  rawValue: unknown,
  flags: FlagMap = {}
): MatchSnapshot => {
  const raw = asRecord(rawValue);
  const info = asRecord(raw.Info);
  const results = asRecord(raw.Results);
  const competitors = asArray(raw.Competitors).map(asRecord);
  const individualMatches = asArray(raw.SubUnits).map((value, index) =>
    normalizeIndividualMatch(value, index, flags)
  );
  const status = mapMatchStatus(info.Status, Boolean(info.IsLive));
  const isTeamUnit =
    text(info.Type).toUpperCase() === "T" ||
    /\.TEAM(?:-|\.)/i.test(text(info.Key));
  const primaryMatch =
    individualMatches.length === 0 && !isTeamUnit
      ? normalizeIndividualMatch(raw, 0, flags)
      : null;
  const running = individualMatches.find(
    (match) => match.status === "RUNNING"
  );
  const scheduled = individualMatches.find(
    (match) => match.status === "SCHEDULED"
  );
  const finished = individualMatches
    .filter((match) => match.status === "FINISHED")
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const activeMatch =
    primaryMatch ??
    running ??
    scheduled ??
    (status === "FINISHED" ? finished.at(-1) : null) ??
    null;
  const completedMatches = primaryMatch
    ? []
    : finished.filter((match) => match.key !== activeMatch?.key);
  const teamScore = primaryMatch
    ? primaryMatch.games
    : normalizeTeamScore(results, competitors, finished, running);
  const fallbackHome = normalizeSide(competitors[0], teamScore.home, flags);
  const fallbackAway = normalizeSide(competitors[1], teamScore.away, flags);
  const updatedAt = new Date().toISOString();

  return {
    key: text(info.Key),
    discipline: "TTE",
    eventName: text(info.EventDesc, text(info.Event, "乒乓球")),
    phase: text(info.PhaseDesc, text(info.Phase, "")),
    unitLabel: text(info.UnitDesc, text(info.UnitDescA, "")),
    status,
    statusDescription: text(info.StatusDesc, text(info.Status)),
    live: Boolean(info.IsLive) || status === "RUNNING",
    venue: text(info.VenueDesc, text(info.Venue, "")),
    location: text(info.LocDesc, text(info.Loc, "")),
    scheduledAt: text(info.DateTimeRaw) || null,
    teams: {
      home: {
        ...fallbackHome,
        score: teamScore.home
      },
      away: {
        ...fallbackAway,
        score: teamScore.away
      }
    },
    teamScore,
    teamDiscipline: normalizeDiscipline(competitors),
    timeout: null,
    activeMatch,
    completedMatches,
    updatedAt,
    sourceUpdatedAt: text(results.Updated, text(info.Updated)) || null,
    stale: false
  };
};
