export type MatchStatus = "SCHEDULED" | "RUNNING" | "FINISHED" | "UNKNOWN";

export type ConnectionState =
  | "connecting"
  | "live"
  | "polling"
  | "stale"
  | "error";

export interface Player {
  id: string;
  name: string;
  shortName: string;
}

export interface TeamSide {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  countryCode: string | null;
  flagUrl: string | null;
  score: number | null;
  players: Player[];
}

export interface SideDiscipline {
  /** 运动员黄牌（CardY） */
  yellowCards: number;
  /** 运动员红牌（Card1 + Card2） */
  redCards: number;
  /** 教练黄牌（CoachCardYellow） */
  coachYellowCards: number;
  /** 教练红牌（CoachCardRed） */
  coachRedCards: number;
  /** 该场已使用的暂停次数（Timeout） */
  timeoutsUsed: number;
}

export interface TimeoutState {
  side: "home" | "away";
  /** 暂停开始的本地时间（ISO） */
  startedAt: string;
  /** 暂停结束的本地时间（ISO） */
  endsAt: string;
  /** 一次暂停的总时长（秒） */
  seconds: number;
}

export interface GamePeriod {
  order: number;
  home: number;
  away: number;
  label: string;
  complete: boolean;
  winner: "home" | "away" | null;
}

export interface IndividualMatch {
  key: string;
  order: number | null;
  label: string;
  status: MatchStatus;
  statusDescription: string;
  home: TeamSide;
  away: TeamSide;
  games: {
    home: number;
    away: number;
  };
  currentGame: number;
  points: {
    home: number;
    away: number;
  };
  periods: GamePeriod[];
  server: "home" | "away" | null;
  winner: "home" | "away" | null;
  discipline: {
    home: SideDiscipline;
    away: SideDiscipline;
  };
}

export interface MatchSnapshot {
  key: string;
  discipline: "TTE";
  eventName: string;
  phase: string;
  unitLabel: string;
  status: MatchStatus;
  statusDescription: string;
  live: boolean;
  venue: string;
  location: string;
  scheduledAt: string | null;
  teams: {
    home: TeamSide;
    away: TeamSide;
  };
  teamScore: {
    home: number | null;
    away: number | null;
  };
  /** 队伍层面（整场团体赛累计）的牌与暂停记录 */
  teamDiscipline: {
    home: SideDiscipline;
    away: SideDiscipline;
  };
  /** 当前正在进行的暂停；无暂停时为 null */
  timeout: TimeoutState | null;
  activeMatch: IndividualMatch | null;
  completedMatches: IndividualMatch[];
  updatedAt: string;
  sourceUpdatedAt: string | null;
  stale: boolean;
}

export interface StreamStatus {
  state: ConnectionState;
  lastUpdatedAt: string | null;
  socketConnected: boolean;
  message: string;
}

export interface ScheduleMatch {
  key: string;
  eventName: string;
  phase: string;
  label: string;
  home: {
    name: string;
    abbreviation: string;
    countryCode: string | null;
    flagUrl: string | null;
  };
  away: {
    name: string;
    abbreviation: string;
    countryCode: string | null;
    flagUrl: string | null;
  };
  status: MatchStatus;
  statusDescription: string;
  startAt: string | null;
  venue: string;
}

/** 晋级路线：某一场次中的一方（选手、双打组合或队伍） */
export interface RouteParticipant {
  /** 官方注册号；轮空时为空串 */
  reg: string;
  name: string;
  shortName: string;
  /** 协会代码，例如 CHN */
  abbreviation: string;
  countryCode: string | null;
  flagUrl: string | null;
  /** 该场总比分中本方的得分（字符串，未开赛为空） */
  score: string;
  winner: boolean;
  /** 是否为轮空 */
  bye: boolean;
}

export type RouteStepResult = "win" | "loss" | "pending" | "running" | "bye";

export type RouteStatus =
  | "active"
  | "eliminated"
  | "champion"
  | "runner-up"
  | "bronze";

export interface RouteStep {
  round: string;
  matchKey: string;
  opponent: string;
  opponentAbbreviation: string;
  opponentCountryCode: string | null;
  opponentFlagUrl: string | null;
  /** 本方视角的总比分，例如 4-1 */
  score: string;
  /** 本方视角的逐局比分 */
  games: string;
  result: RouteStepResult;
  startAt: string | null;
  venue: string;
  location: string;
}

export interface RouteNext {
  round: string;
  opponent: string;
  startAt: string | null;
  venue: string;
  location: string;
}

/** 一条晋级路线：某个仍在签表中的选手/组合/队伍从首轮到当前的全部经历 */
export interface RouteEntry {
  reg: string;
  name: string;
  abbreviation: string;
  countryCode: string | null;
  flagUrl: string | null;
  status: RouteStatus;
  steps: RouteStep[];
  /** 下一轮对手（当下一轮对阵尚未产生时给出推算） */
  next: RouteNext | null;
  /** 该路线当前所在（或最后一场）场次 */
  matchKey: string;
}

export interface RouteMatch {
  key: string;
  /** 该轮次内的场次序号 */
  index: number;
  label: string;
  status: MatchStatus;
  statusDescription: string;
  startAt: string | null;
  venue: string;
  /** 球台，例如 1 号台 */
  location: string;
  /** 总比分，例如 3-0 */
  score: string;
  /** 逐局比分（主队视角） */
  games: string;
  /** 团体赛的小盘比分 */
  subScores: string;
  /** 对手弃权（官方记为 0-0 / W-O） */
  walkover: boolean;
  home: RouteParticipant | null;
  away: RouteParticipant | null;
  winner: "home" | "away" | null;
  /** 出线后进入的场次 */
  feedsIntoKey: string | null;
  feedsIntoRound: string | null;
  feedsIntoIndex: number | null;
  /** 上一轮进入本场的两个场次 */
  feederKeys: (string | null)[];
}

export interface RouteRound {
  key: string;
  name: string;
  /** 小组赛阶段为 true */
  isGroup: boolean;
  startAt: string | null;
  matches: RouteMatch[];
}

export interface RouteEvent {
  key: string;
  name: string;
  shortName: string;
  englishName: string;
  type: "team" | "knockout";
  /** 当前阶段，例如「1/4决赛进行中」 */
  stage: string;
  finished: boolean;
  champion: string | null;
  runnerUp: string | null;
  bronze: string[];
  totalMatches: number;
  finishedMatches: number;
  finalMatchKey: string | null;
  finalStartAt: string | null;
  /** 淘汰赛各轮（按时间先后） */
  rounds: RouteRound[];
  /** 团体赛小组赛各轮 */
  groups: RouteRound[];
  /** 当前仍在签表中的选手/组合的晋级路线 */
  routes: RouteEntry[];
}

export interface RoutesSnapshot {
  updatedAt: string;
  /** 最近一次刷新是否失败（此时为上一次成功的数据） */
  stale: boolean;
  message: string;
  events: RouteEvent[];
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  source: {
    baseUrl: string;
    socketUrl: string;
    championship: string;
    language: string;
  };
  activeMatches: number;
  /** 晋级路线快照的最近刷新时间 */
  routesUpdatedAt: string | null;
  /** 晋级路线是否处于过期/失败状态 */
  routesStale: boolean;
}
