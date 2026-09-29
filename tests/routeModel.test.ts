import { describe, expect, it } from "vitest";
import {
  buildRouteEvents,
  matchIndex,
  resolveStatusValue,
  roundName,
  routeSignature,
  selectDetailKeys,
  toMatchDetail,
  type MatchDetail
} from "../server/routeModel";

type SideInit = {
  reg: string;
  org?: string;
  name: string;
  score?: string;
  winner?: boolean;
};

const side = (init: SideInit) => ({
  Org: init.org ?? "CHN",
  Reg: init.reg,
  Name: init.name,
  NameS: init.name,
  Result: init.score ?? "",
  Winner: init.winner ?? false,
  HasData: true
});

const unit = (
  key: string,
  phase: string,
  options: {
    index: number;
    status?: string;
    startAt?: string;
    home?: ReturnType<typeof side> | null;
    away?: ReturnType<typeof side> | null;
  }
) => ({
  Key: key,
  Phase: phase,
  Status: options.status ?? "OFFICIAL",
  StatusDesc: options.status ?? "Official",
  UnitDescA: `Match ${options.index}`,
  UnitDesc: `Match ${options.index}`,
  DateTimeRaw: options.startAt ?? "2026-09-26T17:00:00+09:00",
  Venue: "SHT",
  VenueDesc: "SKY HALL TOYOTA",
  LocDesc: `Table ${options.index}`,
  IsLive: false,
  Home: options.home ?? {},
  Away: options.away ?? {}
});

const PHASE = {
  r16: "M.SINGLES-----------.8FNL",
  qf: "M.SINGLES-----------.QFNL",
  sf: "M.SINGLES-----------.SFNL",
  final: "M.SINGLES-----------.FNL-"
};

const keyOf = (phase: string, index: number) =>
  `${phase}.${String(index).padStart(4, "0")}${String(index).padStart(2, "0")}`;

/** 8 强签表：8FNL 第 1 场轮空，第 8 场为对手弃权 */
const fixture = [
  {
    EvKey: "M.SINGLES-----------",
    Desc: "Men's Singles",
    Phases: [
      {
        Key: PHASE.final,
        Order: 1,
        Units: [unit(keyOf(PHASE.final, 1), PHASE.final, { index: 1, status: "PROVISIONAL" })]
      },
      {
        Key: PHASE.sf,
        Order: 2,
        Units: [
          unit(keyOf(PHASE.sf, 1), PHASE.sf, {
            index: 1,
            status: "START_LIST",
            startAt: "2026-09-28T13:30:00+09:00",
            home: side({ reg: "1001", name: "P1", score: "" }),
            away: side({ reg: "1005", org: "JPN", name: "P5", score: "" })
          }),
          unit(keyOf(PHASE.sf, 2), PHASE.sf, {
            index: 2,
            status: "START_LIST",
            startAt: "2026-09-28T13:30:00+09:00",
            home: side({ reg: "1009", org: "JPN", name: "P9", score: "" }),
            away: side({ reg: "1013", org: "KOR", name: "P13", score: "" })
          })
        ]
      },
      {
        Key: PHASE.qf,
        Order: 3,
        Units: [
          unit(keyOf(PHASE.qf, 1), PHASE.qf, {
            index: 1,
            home: side({ reg: "1003", org: "JPN", name: "P3", score: "0" }),
            away: side({ reg: "1001", name: "P1", score: "4", winner: true })
          }),
          unit(keyOf(PHASE.qf, 2), PHASE.qf, {
            index: 2,
            home: side({ reg: "1005", name: "P5", score: "4", winner: true }),
            away: side({ reg: "1007", org: "JPN", name: "P7", score: "2" })
          }),
          unit(keyOf(PHASE.qf, 3), PHASE.qf, {
            index: 3,
            home: side({ reg: "1009", name: "P9", score: "4", winner: true }),
            away: side({ reg: "1011", org: "JPN", name: "P11", score: "1" })
          }),
          unit(keyOf(PHASE.qf, 4), PHASE.qf, {
            index: 4,
            home: side({ reg: "1013", name: "P13", score: "4", winner: true }),
            away: side({ reg: "1015", org: "JPN", name: "P15", score: "3" })
          })
        ]
      },
      {
        Key: PHASE.r16,
        Order: 4,
        Units: [
          unit(keyOf(PHASE.r16, 2), PHASE.r16, {
            index: 2,
            home: side({ reg: "1003", name: "P3", score: "4", winner: true }),
            away: side({ reg: "1002", org: "JPN", name: "P2", score: "1" })
          }),
          unit(keyOf(PHASE.r16, 3), PHASE.r16, {
            index: 3,
            home: side({ reg: "1005", name: "P5", score: "4", winner: true }),
            away: side({ reg: "1004", org: "JPN", name: "P4", score: "2" })
          }),
          unit(keyOf(PHASE.r16, 4), PHASE.r16, {
            index: 4,
            home: side({ reg: "1007", name: "P7", score: "4", winner: true }),
            away: side({ reg: "1006", org: "JPN", name: "P6", score: "0" })
          }),
          unit(keyOf(PHASE.r16, 5), PHASE.r16, {
            index: 5,
            home: side({ reg: "1009", name: "P9", score: "4", winner: true }),
            away: side({ reg: "1008", org: "JPN", name: "P8", score: "2" })
          }),
          unit(keyOf(PHASE.r16, 6), PHASE.r16, {
            index: 6,
            home: side({ reg: "1011", name: "P11", score: "4", winner: true }),
            away: side({ reg: "1010", org: "JPN", name: "P10", score: "3" })
          }),
          unit(keyOf(PHASE.r16, 7), PHASE.r16, {
            index: 7,
            home: side({ reg: "1013", name: "P13", score: "4", winner: true }),
            away: side({ reg: "1012", org: "JPN", name: "P12", score: "1" })
          }),
          unit(keyOf(PHASE.r16, 8), PHASE.r16, {
            index: 8,
            home: side({ reg: "1015", name: "P15", score: "0" }),
            away: side({ reg: "1016", org: "JPN", name: "P16", score: "3", winner: true })
          })
        ]
      }
    ]
  }
];

describe("routeModel 结构解析", () => {
  it("解析轮次名称与场次序号", () => {
    expect(roundName(PHASE.r16)).toBe("第三轮（16强）");
    expect(roundName("M.TEAM--------------.GPA-")).toBe("小组赛 A 组");
    expect(matchIndex("M.SINGLES-----------.8FNL.000400--")).toBe(4);
    expect(matchIndex("M.TEAM--------------.QFNL.00020000")).toBe(2);
  });
});

describe("routeModel 对阵树", () => {
  const events = buildRouteEvents(fixture);
  const event = events[0];

  it("按时间顺序给出淘汰赛各轮", () => {
    expect(event.rounds.map((round) => round.name)).toEqual([
      "第三轮（16强）",
      "1/4决赛",
      "半决赛",
      "决赛"
    ]);
    expect(event.stage).toBe("半决赛待战");
    expect(event.totalMatches).toBe(14);
    expect(event.finishedMatches).toBe(11);
  });

  it("连接上下轮次（含轮空与弃权）", () => {
    const round16 = event.rounds[0];
    const quarter = event.rounds[1];
    expect(quarter.matches[0].feederKeys).toEqual([
      null,
      round16.matches[0].key
    ]);
    expect(round16.matches[0].feedsIntoKey).toBe(quarter.matches[0].key);
    expect(round16.matches[0].feedsIntoIndex).toBe(1);
    expect(round16.matches[6].winner).toBe("away");
  });

  it("为四强选手生成晋级路线（含轮空与比分视角换算）", () => {
    const routes = event.routes;
    expect(routes.map((route) => route.reg).sort()).toEqual([
      "1001",
      "1005",
      "1009",
      "1013"
    ]);
    const p1 = routes.find((route) => route.reg === "1001")!;
    expect(p1.status).toBe("active");
    expect(p1.steps.map((step) => step.result)).toEqual([
      "bye",
      "win",
      "pending"
    ]);
    expect(p1.steps[0].round).toBe("第三轮（16强）");
    // QF1 官方记为 0-4（主方 P3 视角），P1 为客方，路线中应换算成本方视角 4-0
    expect(p1.steps[1].score).toBe("4-0");
    expect(p1.steps[1].opponent).toBe("P3");
    expect(p1.steps[2].opponent).toBe("P5");
    expect(p1.next?.round).toBe("决赛");
    expect(p1.next?.opponent).toBe("另一场胜者（待定）");
  });

  it("为已出局者标记淘汰状态", () => {
    const withLoser = buildRouteEvents([
      {
        ...fixture[0],
        Phases: fixture[0].Phases.map((phase) =>
          phase.Key === PHASE.sf
            ? {
                ...phase,
                Units: phase.Units.map((item, index) =>
                  index === 0
                    ? unit(keyOf(PHASE.sf, 1), PHASE.sf, {
                        index: 1,
                        home: side({
                          reg: "1001",
                          name: "P1",
                          score: "2"
                        }),
                        away: side({
                          reg: "1005",
                          org: "JPN",
                          name: "P5",
                          score: "4",
                          winner: true
                        })
                      })
                    : item
                )
              }
            : phase
        )
      }
    ]);
    const eventWithLoser = withLoser[0];
    const p1 = eventWithLoser.routes.find((route) => route.reg === "1001")!;
    expect(p1.status).toBe("bronze");
    const p5 = eventWithLoser.routes.find((route) => route.reg === "1005")!;
    expect(p5.status).toBe("active");
    expect(p5.next?.round).toBe("决赛");
  });

  it("用签名识别数据变化", () => {
    expect(routeSignature(events)).toBe(routeSignature(buildRouteEvents(fixture)));
    const changed = buildRouteEvents([
      {
        ...fixture[0],
        Phases: fixture[0].Phases.map((phase) =>
          phase.Key === PHASE.qf
            ? {
                ...phase,
                Units: phase.Units.map((item, index) =>
                  index === 0 ? { ...item, Status: "RUNNING" } : item
                )
              }
            : phase
        )
      }
    ]);
    expect(routeSignature(changed)).not.toBe(routeSignature(events));
  });
});

describe("routeModel 细节补全", () => {
  it("解析单场结果中的局分、团体小盘与双打中文名", () => {
    const detail = toMatchDetail({
      Info: { Status: "OFFICIAL" },
      Results: { Result: "3-0", ResDetail: "11:3, 11:5, 11:6" },
      Competitors: [
        {
          Reg: "TTEXDOUBLES----CHN01",
          Org: "CHN",
          Result: "3",
          Winner: true,
          Members: [{ Reg: "16272951" }, { Reg: "16276904" }]
        },
        {
          Reg: "TTEXDOUBLES----JPN01",
          Org: "JPN",
          Result: "0",
          Winner: false,
          Members: [{ Reg: "999999" }, { Reg: "999998" }]
        }
      ]
    });
    expect(detail.games).toBe("11:3, 11:5, 11:6");
    expect(detail.home.name).toBe("林诗栋 / 蒯曼");
    expect(detail.home.reg).toBe("TTEXDOUBLES----CHN01");
    expect(detail.home.winner).toBe(true);
    expect(detail.home.score).toBe("3");
  });

  it("把细节补充进模型", () => {
    const sfKey = keyOf(PHASE.sf, 1);
    const details = new Map<string, MatchDetail>([
      [
        sfKey,
        {
          status: "START_LIST",
          games: "",
          subScores: "",
          score: null,
          home: {
            reg: "",
            org: "CHN",
            name: "王楚钦",
            shortName: "王楚钦",
            score: null,
            winner: false
          },
          away: {
            reg: "",
            org: "JPN",
            name: "张本智和",
            shortName: "张本智和",
            score: null,
            winner: false
          }
        }
      ]
    ]);
    const event = buildRouteEvents(fixture, details)[0];
    const sf = event.rounds[2].matches[0];
    expect(sf.home?.name).toBe("王楚钦");
    expect(sf.away?.name).toBe("张本智和");
  });

  it("识别对手弃权（W/O）", () => {
    const walkoverKey = keyOf(PHASE.r16, 8);
    const details = new Map<string, MatchDetail>([
      [
        walkoverKey,
        {
          status: "OFFICIAL",
          games: "W/O",
          subScores: "",
          score: "0-3",
          home: {
            reg: "1015",
            org: "CHN",
            name: "P15",
            shortName: "P15",
            score: "0",
            winner: false
          },
          away: {
            reg: "1016",
            org: "JPN",
            name: "P16",
            shortName: "P16",
            score: "3",
            winner: true
          }
        }
      ]
    ]);
    const round16 = buildRouteEvents(fixture, details)[0].rounds[0];
    const walkover = round16.matches[6];
    expect(walkover.key).toBe(walkoverKey);
    expect(walkover.walkover).toBe(true);
    expect(walkover.winner).toBe("away");
  });

  it("官方未回填胜者时用总比分推断（例如决赛）", () => {
    const finalKey = keyOf(PHASE.final, 1);
    const details = new Map<string, MatchDetail>([
      [
        finalKey,
        {
          status: "OFFICIAL",
          games: "11:9, 13:11, 11:9, 11:9",
          subScores: "",
          score: "4-0",
          home: {
            reg: "TTEXDOUBLES----CHN01",
            org: "CHN",
            name: "林诗栋 / 蒯曼",
            shortName: "林诗栋 / 蒯曼",
            score: "4",
            winner: false
          },
          away: {
            reg: "TTEXDOUBLES----CHN02",
            org: "CHN",
            name: "王楚钦 / 孙颖莎",
            shortName: "王楚钦 / 孙颖莎",
            score: "0",
            winner: false
          }
        }
      ]
    ]);
    const final = buildRouteEvents(fixture, details)[0].rounds[3].matches[0];
    expect(final.status).toBe("FINISHED");
    expect(final.winner).toBe("home");
    expect(final.games).toBe("11:9, 13:11, 11:9, 11:9");
  });

  it("挑选需要补抓结果明细的场次", () => {
    const keys = selectDetailKeys(fixture, new Set(), 3);
    expect(keys).toContain(keyOf(PHASE.sf, 1));
    expect(keys.length).toBeLessThanOrEqual(3);
    const cached = selectDetailKeys(fixture, new Set(keys), 10);
    expect(cached.some((key) => keys.includes(key))).toBe(false);
  });

  it("状态优先级：单场结果只在确认为完赛时覆盖赛程", () => {
    // 赛程尚未回填（START_LIST）但单场结果已完赛 → 采用单场结果
    expect(resolveStatusValue("START_LIST", "OFFICIAL")).toBe("OFFICIAL");
    // 赛程显示进行中、单场结果仍未确认 → 保留赛程状态
    expect(resolveStatusValue("RUNNING", "START_LIST")).toBe("RUNNING");
    // 单场结果缺失 → 使用赛程状态
    expect(resolveStatusValue("SCHEDULED", null)).toBe("SCHEDULED");
  });

  it("按项目均衡挑选明细抓取配额", () => {
    const rename = (evKey: string) =>
      JSON.parse(
        JSON.stringify(fixture[0]).replaceAll("M.SINGLES-----------", evKey)
      );
    const twoEvents = [fixture[0], rename("W.SINGLES-----------")];
    const keys = selectDetailKeys(twoEvents, new Set(), 4);
    const men = keys.filter((key) => key.startsWith("M.SINGLES"));
    const women = keys.filter((key) => key.startsWith("W.SINGLES"));
    expect(keys.length).toBe(4);
    expect(men.length).toBe(2);
    expect(women.length).toBe(2);
  });
});