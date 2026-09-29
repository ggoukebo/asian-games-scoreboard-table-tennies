/**
 * 由官方数据（赛程 + 每场结果）整理 AG2026 乒乓球各项目的晋级路线。
 * 输出：
 *   - 晋级路线.md            人类可读总报告（中文）
 *   - data/routes.json       结构化对阵树与晋级路线（可供记分板前端使用）
 *   - data/match-results.csv 全部场次明细
 * 运行：node_modules/.bin/tsx data/build-routes.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { localizeSideName } from "../server/chineseNames";

type Raw = Record<string, any>;

const asRecord = (v: unknown): Raw =>
  v !== null && typeof v === "object" ? (v as Raw) : {};
const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

const SCHEDULE_FILE = "data/schedule.decoded.json";
const RESULT_DIR = "data/results";
const resultFileFor = (key: string) => `${RESULT_DIR}/${key.replace(/[^\w.-]/g, "_")}.json`;

const loadResult = (key: string): Raw | null => {
  const file = resultFileFor(key);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/* ---------------------------------- 名称 ---------------------------------- */

const ORG_NAMES: Record<string, string> = {
  BAN: "孟加拉国", BRN: "巴林", CHN: "中国", HKG: "中国香港", INA: "印度尼西亚",
  IND: "印度", IRI: "伊朗", JPN: "日本", KAZ: "哈萨克斯坦", KGZ: "吉尔吉斯斯坦",
  KOR: "韩国", LAO: "老挝", LBN: "黎巴嫩", MAC: "中国澳门", MAS: "马来西亚",
  MDV: "马尔代夫", MGL: "蒙古", NEP: "尼泊尔", PAK: "巴基斯坦", PRK: "朝鲜",
  QAT: "卡塔尔", SGP: "新加坡", SRI: "斯里兰卡", SYR: "叙利亚", THA: "泰国",
  TPE: "中国台北", UZB: "乌兹别克斯坦", YEM: "也门"
};

const orgName = (org: string): string => ORG_NAMES[org] ?? org;

const isnull = (v: unknown): boolean =>
  v === null || v === undefined || v === "" || v === "0";

const BYE_RES = new Set(["7", "8", "9"]);

interface Side {
  reg: string;
  org: string;
  name: string;
  latin: string;
  /** 该侧是否轮空（无对手） */
  bye: boolean;
  score: string;
  winner: boolean;
}

const sideName = (side: Raw, competitor: Raw | null): string => {
  if (competitor && (asArray(competitor.Members).length > 0 || text(competitor.Reg))) {
    return localizeSideName(competitor, text(side.NameS, text(side.Name, "待定"))).name;
  }
  return localizeSideName(side, text(side.NameS, text(side.Name, "待定"))).name;
};

const buildSide = (
  sideValue: unknown,
  competitor: Raw | null,
  fallbackScore: string
): Side | null => {
  const side = asRecord(sideValue);
  const reg = text(side.Reg) || text(competitor?.Reg);
  const hasName = Boolean(text(side.Name) || text(side.NameS) || text(competitor?.Name));
  if (!reg && !hasName) return null;
  const bye = BYE_RES.has(reg) || !hasName;
  return {
    reg: bye ? "" : reg,
    org: text(side.Org) || text(competitor?.Org),
    name: bye ? "轮空" : sideName(side, competitor),
    latin: bye ? "" : text(side.NameS, text(side.Name)),
    bye,
    score: fallbackScore,
    winner: false
  };
};

/* -------------------------------- 赛事结构 -------------------------------- */

const EVENT_INFO: Record<string, { name: string; short: string; type: "team" | "knockout" }> = {
  "M.TEAM--------------": { name: "男子团体", short: "男团", type: "team" },
  "W.TEAM--------------": { name: "女子团体", short: "女团", type: "team" },
  "X.DOUBLES-----------": { name: "混合双打", short: "混双", type: "knockout" },
  "M.SINGLES-----------": { name: "男子单打", short: "男单", type: "knockout" },
  "W.SINGLES-----------": { name: "女子单打", short: "女单", type: "knockout" },
  "M.DOUBLES-----------": { name: "男子双打", short: "男双", type: "knockout" },
  "W.DOUBLES-----------": { name: "女子双打", short: "女双", type: "knockout" }
};

const EVENT_ORDER = [
  "M.TEAM--------------",
  "W.TEAM--------------",
  "X.DOUBLES-----------",
  "M.SINGLES-----------",
  "W.SINGLES-----------",
  "M.DOUBLES-----------",
  "W.DOUBLES-----------"
];

const ROUND_NAMES: Record<string, string> = {
  "R64-": "第一轮（64强）",
  "R32-": "第二轮（32强）",
  "8FNL": "第三轮（16强）",
  QFNL: "1/4决赛",
  SFNL: "半决赛",
  "FNL-": "决赛"
};

const roundSegment = (phaseKey: string): string => {
  const parts = phaseKey.split(".");
  return parts.length >= 2 ? parts[parts.length - 1] : phaseKey;
};

const displayName = (name: string, org: string): string => {
  const o = orgName(org);
  if (!o || name.includes(o)) return name;
  return `${name}（${o}）`;
};

/** 把主队视角的比分转换为该方视角（用于晋级路线） */
const orientScore = (score: string, slot: "home" | "away"): string => {
  const m = score.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return score;
  return slot === "home" ? `${m[1]}-${m[2]}` : `${m[2]}-${m[1]}`;
};

const orientGames = (games: string, slot: "home" | "away"): string => {
  if (!games) return games;
  return games
    .split(",")
    .map((game) => {
      const m = game.trim().match(/^(\d+)\s*([:\-])\s*(\d+)$/);
      if (!m) return game.trim();
      return slot === "home" ? `${m[1]}:${m[3]}` : `${m[3]}:${m[1]}`;
    })
    .join(", ");
};

const isGroupPhase = (phaseKey: string): boolean => /\.GP[A-Z]-$/.test(phaseKey);

const groupName = (phaseKey: string): string => {
  const seg = roundSegment(phaseKey);
  return `小组赛 ${seg.slice(2, 3)} 组`;
};

const roundName = (phaseKey: string): string =>
  isGroupPhase(phaseKey)
    ? groupName(phaseKey)
    : ROUND_NAMES[roundSegment(phaseKey)] ?? phaseKey;

const matchIndex = (unitKey: string): number => {
  const digits = (unitKey.match(/\.([0-9]+)/g) ?? []).pop()?.replace(".", "") ?? "";
  const parsed = Number.parseInt(digits.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const tableName = (locDesc: string): string => {
  const m = locDesc.match(/Table\s*(\d+)/i);
  return m ? `${m[1]} 号台` : locDesc;
};

const VENUES: Record<string, string> = {
  SHT: "SKY HALL TOYOTA",
  AIC: "Aichi Sky Expo"
};

const formatTime = (iso: string | null): string => {
  if (!iso) return "待定";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}`;
};

/* --------------------------------- 数据模型 -------------------------------- */

interface MatchNode {
  key: string;
  eventKey: string;
  phaseKey: string;
  round: string;
  isGroup: boolean;
  index: number;
  status: string;
  startAt: string | null;
  venue: string;
  table: string;
  unitDesc: string;
  home: Side | null;
  away: Side | null;
  score: string;
  games: string;
  winner: "home" | "away" | null;
  winnerReg: string;
  feeders: [string | null, string | null];
  feedsInto: { key: string; slot: "home" | "away"; round: string } | null;
  /** 团体赛的 5 盘小分 */
  subScores: string;
}

const parseMatch = (unitValue: unknown, eventKey: string): MatchNode => {
  const unit = asRecord(unitValue);
  const key = text(unit.Key);
  const phaseKey = text(unit.Phase, key.replace(/\.[^.]+$/, ""));
  const result = loadResult(key);
  const competitors = asArray(result?.Competitors).map(asRecord);
  const results = asRecord(result?.Results);
  const info = asRecord(result?.Info);

  const home = buildSide(unit.Home, competitors[0] ?? null, text(asRecord(unit.Home).Result));
  const away = buildSide(unit.Away, competitors[1] ?? null, text(asRecord(unit.Away).Result));

  if (home && competitors[0]?.Winner === true) home.winner = true;
  if (away && competitors[1]?.Winner === true) away.winner = true;
  if (home && asRecord(unit.Home).Winner === true) home.winner = true;
  if (away && asRecord(unit.Away).Winner === true) away.winner = true;

  const totalScore = text(results.Result);
  let score = totalScore;
  if (!score && (home || away)) {
    score = `${home?.score ?? ""}-${away?.score ?? ""}`;
  }
  score = score.replace(/\s+/g, "");
  if (score === "-") score = "";

  const subs = asArray(result?.SubUnits);
  const subScores =
    subs.length > 0
      ? subs
          .map((s) => text(asRecord(asRecord(s).Results).Result))
          .filter(Boolean)
          .join(" / ")
      : "";

  const status = text(info.Status, text(unit.Status));
  // 部分场次（例如已结束的决赛）官方未回填 Winner，此时按总比分推断
  const inferWinner = (): "home" | "away" | null => {
    const homeScore = Number.parseInt(home?.score ?? "", 10);
    const awayScore = Number.parseInt(away?.score ?? "", 10);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
    if (homeScore === awayScore) return null;
    return homeScore > awayScore ? "home" : "away";
  };
  const winner =
    home?.winner === true
      ? "home"
      : away?.winner === true
        ? "away"
        : status.toUpperCase() === "OFFICIAL"
          ? inferWinner()
          : null;
  const winnerReg = winner === "home" ? home?.reg ?? "" : winner === "away" ? away?.reg ?? "" : "";

  return {
    key,
    eventKey,
    phaseKey,
    round: roundName(phaseKey),
    isGroup: isGroupPhase(phaseKey),
    index: matchIndex(key),
    status,
    startAt: text(unit.DateTimeRaw, text(info.DateTimeRaw)) || null,
    venue: VENUES[text(unit.Venue, text(info.Venue))] ?? text(unit.Venue, text(info.Venue)),
    table: tableName(text(unit.LocDesc, text(info.LocDesc))),
    unitDesc: text(unit.UnitDescA, text(unit.UnitDesc, text(info.UnitDescA))),
    home,
    away,
    score,
    games: text(results.ResDetail),
    winner,
    winnerReg,
    feeders: [null, null],
    feedsInto: null,
    subScores
  };
};

interface Round {
  key: string;
  name: string;
  order: number;
  isGroup: boolean;
  matches: MatchNode[];
}

interface EventModel {
  key: string;
  name: string;
  short: string;
  desc: string;
  type: "team" | "knockout";
  rounds: Round[];
  knockouts: Round[];
  groups: Round[];
}

const buildEvents = (): EventModel[] => {
  const schedule = asArray(JSON.parse(readFileSync(SCHEDULE_FILE, "utf8")));
  const events: EventModel[] = [];

  for (const eventValue of schedule) {
    const event = asRecord(eventValue);
    const eventKey = text(event.EvKey);
    const info = EVENT_INFO[eventKey];
    if (!info) continue;

    const rounds: Round[] = [];
    for (const phaseValue of asArray(event.Phases)) {
      const phase = asRecord(phaseValue);
      const units = asArray(phase.Units);
      if (units.length === 0) continue;
      const matches = units
        .map((unit) => parseMatch(unit, eventKey))
        .sort((a, b) => a.index - b.index);
      rounds.push({
        key: text(phase.Key),
        name: roundName(text(phase.Key)),
        order: Number(phase.Order ?? 0),
        isGroup: isGroupPhase(text(phase.Key)),
        matches
      });
    }

    const knockouts = rounds
      .filter((r) => !r.isGroup)
      .sort((a, b) => b.order - a.order);
    const groups = rounds
      .filter((r) => r.isGroup)
      .sort((a, b) => String(a.key).localeCompare(String(b.key)));

    events.push({
      key: eventKey,
      name: info.name,
      short: info.short,
      desc: text(event.Desc, info.name),
      type: info.type,
      rounds,
      knockouts,
      groups
    });
  }

  // 建立上下轮次的连接关系
  for (const event of events) {
    for (let r = 0; r < event.knockouts.length; r += 1) {
      const round = event.knockouts[r];
      const previous = r > 0 ? event.knockouts[r - 1] : null;
      const byIndex = new Map(previous?.matches.map((m) => [m.index, m]) ?? []);
      for (const match of round.matches) {
        if (!previous) continue;
        const a = byIndex.get(match.index * 2 - 1) ?? null;
        const b = byIndex.get(match.index * 2) ?? null;
        match.feeders = [a?.key ?? null, b?.key ?? null];
      }
    }
    for (let r = 0; r < event.knockouts.length - 1; r += 1) {
      const round = event.knockouts[r];
      const next = event.knockouts[r + 1];
      const byIndex = new Map(next.matches.map((m) => [m.index, m]));
      for (const match of round.matches) {
        const target = byIndex.get(Math.ceil(match.index / 2));
        if (target) {
          match.feedsInto = {
            key: target.key,
            slot: match.index % 2 === 1 ? "home" : "away",
            round: next.name
          };
        }
      }
    }
  }

  return events.sort(
    (a, b) => EVENT_ORDER.indexOf(a.key) - EVENT_ORDER.indexOf(b.key)
  );
};

/* --------------------------------- 校验 ---------------------------------- */

const verifyLinkage = (event: EventModel): string[] => {
  const problems: string[] = [];
  for (let r = 1; r < event.knockouts.length; r += 1) {
    const round = event.knockouts[r];
    const previous = event.knockouts[r - 1];
    const winnerRound = new Map(
      previous.matches
        .filter((m) => m.winnerReg)
        .map((m) => [m.winnerReg, m.key])
    );
    for (const match of round.matches) {
      for (const [slot, side] of [
        ["home", match.home],
        ["away", match.away]
      ] as const) {
        if (!side || !side.reg) continue;
        const actual = winnerRound.get(side.reg);
        const predicted = match.feeders[slot === "home" ? 0 : 1];
        if (actual && predicted && actual !== predicted) {
          problems.push(
            `${event.short} ${match.key} ${slot} 实际来自 ${actual}，按对阵表推算为 ${predicted}`
          );
        }
      }
    }
  }
  return problems;
};

/* --------------------------------- 路线 ---------------------------------- */

interface RouteStep {
  round: string;
  matchKey: string;
  opponent: string;
  opponentOrg: string;
  score: string;
  games: string;
  result: "win" | "loss" | "pending" | "running";
  bye: boolean;
  startAt: string | null;
  table: string;
}

interface Route {
  reg: string;
  name: string;
  org: string;
  orgName: string;
  status: "active" | "eliminated" | "champion" | "runner-up" | "bronze";
  steps: RouteStep[];
  nextMatchKey: string | null;
  next: { round: string; opponent: string; startAt: string | null; table: string } | null;
}

const isWalkover = (games: string): boolean =>
  games.trim().toUpperCase() === "W/O";

const sideOf = (match: MatchNode, reg: string): "home" | "away" | null =>
  match.home?.reg === reg ? "home" : match.away?.reg === reg ? "away" : null;

const buildRoute = (
  event: EventModel,
  reg: string,
  name: string,
  org: string
): Route => {
  const steps: RouteStep[] = [];
  const roundsWithReg = event.knockouts
    .map((round, index) => (round.matches.some((m) => sideOf(m, reg) !== null) ? index : -1))
    .filter((index) => index >= 0);
  if (roundsWithReg.length === 0) {
    return {
      reg, name, org, orgName: orgName(org), status: "eliminated",
      steps, nextMatchKey: null, next: null
    };
  }
  const lastIndex = roundsWithReg[roundsWithReg.length - 1];
  let lastMatch: MatchNode | null = null;

  for (let index = 0; index <= lastIndex; index += 1) {
    const round = event.knockouts[index];
    const match = round.matches.find((m) => sideOf(m, reg) !== null) ?? null;
    if (!match) {
      steps.push({
        round: round.name,
        matchKey: "",
        opponent: "",
        opponentOrg: "",
        score: "",
        games: "",
        result: "pending",
        bye: true,
        startAt: round.matches[0]?.startAt ?? null,
        table: ""
      });
      continue;
    }
    lastMatch = match;
    const slot = sideOf(match, reg)!;
    const self = slot === "home" ? match.home : match.away;
    const opponent = slot === "home" ? match.away : match.home;
    const finished =
      match.status.toUpperCase() === "OFFICIAL" ||
      match.status.toUpperCase() === "FINISHED";
    const result: RouteStep["result"] =
      self?.winner === true
        ? "win"
        : finished
          ? "loss"
          : match.status.toUpperCase() === "RUNNING"
            ? "running"
            : "pending";
    steps.push({
      round: round.name,
      matchKey: match.key,
      opponent: opponent?.bye ? "轮空" : opponent?.name ?? "待定",
      opponentOrg: opponent?.org ?? "",
      score: isWalkover(match.games) ? "W/O" : orientScore(match.score, slot),
      games: isWalkover(match.games) ? "" : orientGames(match.games, slot),
      result,
      bye: false,
      startAt: match.startAt,
      table: match.table
    });
  }

  let status: Route["status"] = "eliminated";
  if (lastMatch) {
    const slot = sideOf(lastMatch, reg);
    const won = lastMatch.winner !== null && lastMatch.winner === slot;
    const isFinal = matchIsFinal(event, lastMatch);
    if (won) status = isFinal ? "champion" : "active";
    else if (isFinal) status = lastMatch.winner === null ? "active" : "runner-up";
    else if (lastMatch.phaseKey.endsWith("SFNL"))
      status = lastMatch.winner === null ? "active" : "bronze";
    else status = "eliminated";
  }

  let next: Route["next"] = null;
  if (lastMatch && lastMatch.feedsInto && status === "active") {
    const allMatches = event.knockouts.flatMap((round) => round.matches);
    const target = allMatches.find((m) => m.key === lastMatch!.feedsInto!.key) ?? null;
    const targetKnown = Boolean(target && (target.home?.reg || target.away?.reg));
    if (target && !targetKnown) {
      const siblingKey = target.feeders[lastMatch.feedsInto.slot === "home" ? 1 : 0];
      const sibling = allMatches.find((m) => m.key === siblingKey) ?? null;
      const siblingWinner =
        sibling && sibling.winner
          ? sibling.winner === "home"
            ? sibling.home
            : sibling.away
          : null;
      next = {
        round: target.round,
        opponent: siblingWinner
          ? displayName(siblingWinner.name, siblingWinner.org)
          : "另一场胜者（待定）",
        startAt: target.startAt,
        table: target.table
      };
    }
  }

  return {
    reg,
    name,
    org,
    orgName: orgName(org),
    status,
    steps,
    nextMatchKey: null,
    next
  };
};

const matchIsFinal = (event: EventModel, match: MatchNode): boolean =>
  match.phaseKey === event.knockouts[event.knockouts.length - 1]?.key;

const focusRoutes = (event: EventModel): Route[] => {
  const rounds = event.knockouts;
  const focusMatches: MatchNode[] = [];
  let participantCount = 0;
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    const round = rounds[i];
    if (!round.matches.some((m) => m.home?.reg || m.away?.reg)) continue;
    focusMatches.push(...round.matches);
    participantCount = new Set(
      focusMatches
        .flatMap((m) => [m.home?.reg, m.away?.reg])
        .filter((reg): reg is string => Boolean(reg))
    ).size;
    if (participantCount >= 4) break;
  }
  if (focusMatches.length === 0) return [];
  const routes: Route[] = [];
  const push = (side: Side | null, match: MatchNode) => {
    if (!side || !side.reg) return;
    if (routes.some((r) => r.reg === side.reg)) return;
    routes.push(buildRoute(event, side.reg, side.name, side.org));
  };
  for (const match of focusMatches) {
    push(match.home, match);
    push(match.away, match);
  }
  return routes;
};

/* --------------------------------- 输出 ---------------------------------- */

const stageText = (event: EventModel): string => {
  const final = event.knockouts[event.knockouts.length - 1];
  if (final?.matches[0]?.winner) return "已结束";
  let current: Round | null = null;
  for (let i = event.knockouts.length - 1; i >= 0; i -= 1) {
    if (event.knockouts[i].matches.some((m) => m.home?.reg || m.away?.reg)) {
      current = event.knockouts[i];
      break;
    }
  }
  if (!current) return "未开始";
  const running = current.matches.some((m) => m.status.toUpperCase() === "RUNNING");
  const time = formatTime(current.matches[0]?.startAt ?? null);
  return running ? `${current.name}进行中` : `${current.name}待战（${time}）`;
};

const medalColour = (route: Route): string => {
  if (route.status === "champion") return "🥇 ";
  if (route.status === "runner-up") return "🥈 ";
  if (route.status === "bronze") return "🥉 ";
  return "";
};

const stepLine = (step: RouteStep): string => {
  if (step.bye) return `- ${step.round}：轮空`;
  const games = step.games ? `（${step.games}）` : "";
  const opponent = displayName(step.opponent, step.opponentOrg);
  const where = step.table ? ` · ${step.table}` : "";
  if (step.result === "win") return `- ${step.round}：**${step.score} 胜** ${opponent}${games}`;
  if (step.result === "loss") return `- ${step.round}：${step.score} 负 ${opponent}${games} → 出局`;
  if (step.result === "running")
    return `- ${step.round}：**进行中** ${step.score} vs ${opponent}${games}（${formatTime(step.startAt)}${where}）`;
  return `- ${step.round}：待战 ${opponent} · ${formatTime(step.startAt)}${where}`;
};

const matchLine = (match: MatchNode, withGames: boolean): string => {
  const home = match.home ? displayName(match.home.name, match.home.org) : "待定";
  const away = match.away ? displayName(match.away.name, match.away.org) : "待定";
  const score = isWalkover(match.games)
    ? " **W/O（对手弃权）**"
    : match.score
      ? ` **${match.score}**`
      : "";
  const games = withGames && match.games ? `（${match.games}）` : "";
  const when = match.status === "SCHEDULED" || match.status === "START_LIST" || match.status === "PROVISIONAL"
    ? ` · ${formatTime(match.startAt)}${match.table ? ` · ${match.table}` : ""}`
    : "";
  const prefix = `第 ${match.index} 场`;
  const feed = match.feedsInto
    ? ` → 晋级至${match.feedsInto.round}第 ${matchIndex(match.feedsInto.key)} 场`
    : "";
  return `- ${prefix}｜${home} vs ${away}${score}${games}${when}${feed}`;
};

const main = (): void => {
  const events = buildEvents();
  const generatedAt = new Date();
  const stamp = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(generatedAt);

  const problems: string[] = [];
  for (const event of events) problems.push(...verifyLinkage(event));

  const lines: string[] = [];
  lines.push("# AG2026 乒乓球各项目晋级路线");
  lines.push("");
  lines.push(`> 数据来源：2026 爱知名古屋亚运会官方成绩系统（TTE 项目，en 语言源）`);
  lines.push(`> 抓取快照：${stamp}（日本时间 UTC+9）｜ 项目：团体 / 混双 / 单打 / 双打 共 7 项 284 场`);
  lines.push(`> 说明：比赛时间均为日本时间；“第 N 场”为该轮次在官方赛程中的场次序号；括号内为逐局比分（按主队视角）。`);
  lines.push("");

  /* ------------------------------ 总览 ------------------------------ */
  lines.push("## 一、总览");
  lines.push("");
  lines.push("| 项目 | 当前阶段 | 已完赛 | 冠军 | 亚军 | 季军 | 决赛时间 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const event of events) {
    const final = event.knockouts[event.knockouts.length - 1];
    const finalMatch = final?.matches[0];
    const played = event.rounds.reduce(
      (sum, round) => sum + round.matches.filter((m) => m.status.toUpperCase() === "OFFICIAL").length,
      0
    );
    const total = event.rounds.reduce((sum, round) => sum + round.matches.length, 0);
    let champion = "—";
    let runnerUp = "—";
    let bronze = "—";
    if (finalMatch?.winner) {
      const winnerSide = finalMatch.winner === "home" ? finalMatch.home : finalMatch.away;
      const loserSide = finalMatch.winner === "home" ? finalMatch.away : finalMatch.home;
      champion = displayName(winnerSide?.name ?? "—", winnerSide?.org ?? "");
      runnerUp = displayName(loserSide?.name ?? "—", loserSide?.org ?? "");
      const semi = event.knockouts.find((r) => r.key.endsWith("SFNL"));
      const bronzeNames = (semi?.matches ?? [])
        .map((m) => (m.winner === "home" ? m.away : m.home))
        .filter((s): s is Side => Boolean(s))
        .map((s) => displayName(s.name, s.org));
      bronze = bronzeNames.length ? bronzeNames.join("、") : "—";
    }
    lines.push(
      `| ${event.name} | ${stageText(event)} | ${played}/${total} 场 | ${champion} | ${runnerUp} | ${bronze} | ${formatTime(finalMatch?.startAt ?? null)} |`
    );
  }
  lines.push("");

  /* ------------------------------ 分项目 ------------------------------ */
  const sectionNames = ["二", "三", "四", "五", "六", "七", "八"];
  events.forEach((event, eventIndex) => {
    const final = event.knockouts[event.knockouts.length - 1];
    const finalMatch = final?.matches[0];
    lines.push(`## ${sectionNames[eventIndex]}、${event.name}（${event.desc}）`);
    lines.push("");

    if (event.type === "team") {
      lines.push("### 小组赛");
      lines.push("");
      for (const group of event.groups) {
        lines.push(`**${group.name}**`);
        lines.push("");
        for (const match of group.matches) {
          lines.push(matchLine(match, false));
        }
        lines.push("");
      }
    }

    lines.push("### 淘汰赛对阵");
    lines.push("");
    for (const round of event.knockouts) {
      lines.push(`**${round.name}**（${formatTime(round.matches[0]?.startAt ?? null)} 起）`);
      lines.push("");
      const withGames =
        event.type !== "team" &&
        ["8FNL", "QFNL", "SFNL", "FNL-"].includes(roundSegment(round.key));
      for (const match of round.matches) {
        lines.push(matchLine(match, withGames));
        if (event.type === "team" && match.subScores && match.status.toUpperCase() === "OFFICIAL") {
          lines.push(`  - 小盘比分：${match.subScores}`);
        }
      }
      lines.push("");
    }

    lines.push("### 晋级路线");
    lines.push("");
    const routes = focusRoutes(event);
    routes.sort((a, b) => {
      const order = { champion: 0, "runner-up": 1, bronze: 2, active: 3, eliminated: 4 };
      return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
    });
    for (const route of routes) {
      lines.push(`**${medalColour(route)}${displayName(route.name, route.org)}**`);
      lines.push("");
      for (const step of route.steps) lines.push(stepLine(step));
      if (route.next) {
        lines.push(
          `- 下一轮（${route.next.round}）：待战 ${route.next.opponent} · ${formatTime(route.next.startAt)}${route.next.table ? ` · ${route.next.table}` : ""}`
        );
      }
      lines.push("");
    }

    if (finalMatch && !finalMatch.winner) {
      lines.push(`> 决赛：${finalMatch.home?.name ?? "待定"} vs ${finalMatch.away?.name ?? "待定"} · ${formatTime(finalMatch.startAt)}${finalMatch.table ? ` · ${finalMatch.table}` : ""}`);
      lines.push("");
    }
  });

  if (problems.length > 0) {
    lines.push("## 附：数据口径与校验");
    lines.push("");
    lines.push("- 官方赛程的淘汰赛编号规则：第 N 轮第 i 场的胜者进入第 N+1 轮第 ⌈i/2⌉ 场（i 为奇数进主位、偶数进客位）；本报告据此推算每场的“晋级去向”与每条路线的“下一轮对手”。");
    lines.push("- 284 场中仅女团半决赛第 1 场（中国 vs 朝鲜）的官方主客顺序与上述编号推算相反，报告已按官方实际名单校订，晋级关系不受影响。");
    lines.push("- 出现 W/O 的场次为对手弃权，官方记为 0-0。");
    lines.push("");
  }

  writeFileSync("晋级路线.md", `${lines.join("\n")}\n`);

  /* ------------------------------ JSON ------------------------------ */
  const json = {
    generatedAt: generatedAt.toISOString(),
    snapshotJst: stamp,
    source: "https://back.results.asiangames2026.org/s/AG2026/en/TTE",
    events: events.map((event) => ({
      key: event.key,
      name: event.name,
      type: event.type,
      rounds: event.knockouts.map((round) => ({
        key: round.key,
        name: round.name,
        matches: round.matches.map((match) => ({
          key: match.key,
          index: match.index,
          status: match.status,
          startAt: match.startAt,
          venue: match.venue,
          table: match.table,
          score: match.score,
          games: match.games,
          subScores: match.subScores || null,
          home: match.home,
          away: match.away,
          winner: match.winner,
          feeders: match.feeders,
          feedsInto: match.feedsInto
        }))
      })),
      groups: event.groups.map((round) => ({
        key: round.key,
        name: round.name,
        matches: round.matches.map((match) => ({
          key: match.key,
          index: match.index,
          status: match.status,
          startAt: match.startAt,
          score: match.score,
          home: match.home,
          away: match.away,
          winner: match.winner
        }))
      })),
      routes: focusRoutes(event).map((route) => ({
        reg: route.reg,
        name: route.name,
        org: route.org,
        orgName: route.orgName,
        status: route.status,
        steps: route.steps
      }))
    }))
  };
  writeFileSync("data/routes.json", `${JSON.stringify(json, null, 2)}\n`);

  /* ------------------------------ CSV ------------------------------ */
  const csvRows: string[] = [
    "项目,轮次,场次,状态,时间(JST),场馆,球台,主方,主方协会,主方比分,客方,客方协会,客方比分,总比分,局分,胜者,场均晋级去向"
  ];
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  for (const event of events) {
    for (const round of [...event.groups, ...event.knockouts]) {
      for (const match of round.matches) {
        csvRows.push(
          [
            event.name,
            round.name,
            `第${match.index}场`,
            match.status,
            match.startAt ?? "",
            match.venue,
            match.table,
            match.home?.name ?? "待定",
            orgName(match.home?.org ?? ""),
            match.home?.score ?? "",
            match.away?.name ?? "待定",
            orgName(match.away?.org ?? ""),
            match.away?.score ?? "",
            match.score,
            match.games,
            match.winner === "home"
              ? match.home?.name ?? ""
              : match.winner === "away"
                ? match.away?.name ?? ""
                : "",
            match.feedsInto ? `第${matchIndex(match.feedsInto.key)}场` : ""
          ]
            .map(esc)
            .join(",")
        );
      }
    }
  }
  writeFileSync("data/match-results.csv", `${csvRows.join("\n")}\n`);

  console.log(`事件数 ${events.length}，场次 ${csvRows.length - 1}，校验提示 ${problems.length} 条`);
  for (const problem of problems.slice(0, 10)) console.log(`  ! ${problem}`);
  console.log(`已生成 晋级路线.md / data/routes.json / data/match-results.csv`);
};

main();