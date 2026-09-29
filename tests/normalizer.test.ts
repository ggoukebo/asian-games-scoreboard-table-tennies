import { describe, expect, it } from "vitest";
import { normalizeMatch } from "../server/normalizer";

const liveMatch = {
  Info: {
    Key: "W.TEAM--------------.GPA-.00020000",
    EventDesc: "Women's Team",
    PhaseDesc: "Women's Team Group A",
    UnitDesc: "Group A Match 2",
    Status: "RUNNING",
    StatusDesc: "Running",
    IsLive: true,
    VenueDesc: "SKY HALL TOYOTA",
    LocDesc: "Table 6",
    DateTimeRaw: "2026-09-20T16:00:00+09:00"
  },
  Results: {
    ResDetail: "1-0",
    CurrentPeriod: 0,
    Extensions: []
  },
  Competitors: [
    {
      Reg: "MAC",
      Name: "Macau, China",
      NameS: "Macau, China",
      Org: "MAC",
      Result: "1",
      Members: []
    },
    {
      Reg: "CHN",
      Name: "People's Republic of China",
      NameS: "China",
      Org: "CHN",
      Result: "0",
      Members: []
    }
  ],
  SubUnits: [
    {
      Info: {
        Key: "SUB-1",
        Status: "RUNNING",
        StatusDesc: "Running",
        IsLive: true,
        UnitDescA: "Match 1"
      },
      Results: {
        CurrentPeriod: 4,
        Extensions: [
          { Code: "SubMatchNum", Value: "1" },
          { Code: "ServerHomeAway", Value: "1" }
        ],
        Periods: [
          { Order: 1, ResHome: "11", ResAway: "9", DescS: "1" },
          { Order: 2, ResHome: "11", ResAway: "9", DescS: "2" },
          { Order: 3, ResHome: "7", ResAway: "11", DescS: "3" },
          { Order: 4, ResHome: "10", ResAway: "6", DescS: "4" },
          { Order: 5, ResHome: "0", ResAway: "0", DescS: "5" }
        ]
      },
      Competitors: [
        {
          Reg: "P1",
          Name: "ZHU Yu Ling",
          NameS: "ZHU Y",
          Org: "MAC",
          Result: "2",
          Extensions: []
        },
        {
          Reg: "P2",
          Name: "WANG Manyu",
          NameS: "WANG M",
          Org: "CHN",
          Result: "1",
          Extensions: []
        }
      ]
    }
  ]
};

describe("normalizeMatch", () => {
  it("normalizes the live team and current singles score", () => {
    const snapshot = normalizeMatch(liveMatch);

    expect(snapshot.teamScore).toEqual({ home: 0, away: 0 });
    expect(snapshot.teams.home.name).toBe("Macau, China");
    expect(snapshot.teams.away.name).toBe("China");
    expect(snapshot.teams.home.countryCode).toBe("MO");
    expect(snapshot.teams.away.countryCode).toBe("CN");
    expect(snapshot.teams.home.flagUrl).toBeNull();
    expect(snapshot.teams.away.flagUrl).toBeNull();
    expect(snapshot.activeMatch?.games).toEqual({ home: 2, away: 1 });
    expect(snapshot.activeMatch?.points).toEqual({ home: 10, away: 6 });
    expect(snapshot.activeMatch?.currentGame).toBe(4);
    expect(snapshot.activeMatch?.server).toBe("home");
    expect(snapshot.completedMatches).toHaveLength(0);
  });

  it("derives the team score when the result detail is absent", () => {
    const raw = structuredClone(liveMatch);
    raw.Results.ResDetail = "";
    raw.Competitors[0].Result = "";
    raw.Competitors[1].Result = "";

    const snapshot = normalizeMatch(raw);

    expect(snapshot.teamScore).toEqual({ home: 0, away: 0 });
  });

  it("counts one team point for each completed singles winner", () => {
    const raw = structuredClone(liveMatch);
    raw.Results.ResDetail = "3-1";
    raw.Competitors[0].Result = "3";
    raw.Competitors[1].Result = "1";
    raw.SubUnits = [
      {
        Info: {
          Key: "SUB-1",
          Status: "FINISHED",
          StatusDesc: "Official",
          IsLive: false,
          UnitDescA: "Match 1"
        },
        Results: {
          CurrentPeriod: 4,
          Extensions: [],
          Periods: [
            { Order: 1, ResHome: "11", ResAway: "9", DescS: "1" },
            { Order: 2, ResHome: "11", ResAway: "9", DescS: "2" },
            { Order: 3, ResHome: "11", ResAway: "9", DescS: "3" }
          ]
        },
        Competitors: [
          {
            Reg: "P1",
            Name: "Player A",
            NameS: "A",
            Org: "A",
            Result: "3",
            Extensions: []
          },
          {
            Reg: "P2",
            Name: "Player B",
            NameS: "B",
            Org: "B",
            Result: "0",
            Extensions: []
          }
        ]
      },
      {
        Info: {
          Key: "SUB-2",
          Status: "FINISHED",
          StatusDesc: "Official",
          IsLive: false,
          UnitDescA: "Match 2"
        },
        Results: {
          CurrentPeriod: 3,
          Extensions: [],
          Periods: [
            { Order: 1, ResHome: "8", ResAway: "11", DescS: "1" },
            { Order: 2, ResHome: "7", ResAway: "11", DescS: "2" },
            { Order: 3, ResHome: "9", ResAway: "11", DescS: "3" }
          ]
        },
        Competitors: [
          {
            Reg: "P1",
            Name: "Player A",
            NameS: "A",
            Org: "A",
            Result: "0",
            Extensions: []
          },
          {
            Reg: "P2",
            Name: "Player B",
            NameS: "B",
            Org: "B",
            Result: "3",
            Extensions: []
          }
        ]
      }
    ];

    const snapshot = normalizeMatch(raw);

    expect(snapshot.teamScore).toEqual({ home: 1, away: 1 });
  });

  it("normalizes every game in a standalone doubles match", () => {
    const doublesMatch = {
      Info: {
        Key: "W.DOUBLES-----------.R64-.000100--",
        Type: "A",
        EventDesc: "Women's Doubles",
        PhaseDesc: "Women's Doubles Round 1",
        UnitDesc: "Women's Doubles Round 1 Match 1",
        Status: "OFFICIAL",
        StatusDesc: "Official",
        IsLive: false
      },
      Results: {
        ResDetail: "11:9, 11:9, 7:11, 13:11",
        CurrentPeriod: 4,
        Extensions: [],
        Periods: [
          { Order: 1, ResHome: "11", ResAway: "9", DescS: "1" },
          { Order: 2, ResHome: "11", ResAway: "9", DescS: "2" },
          { Order: 3, ResHome: "7", ResAway: "11", DescS: "3" },
          { Order: 4, ResHome: "13", ResAway: "11", DescS: "4" },
          { Order: 5, ResHome: "0", ResAway: "0", DescS: "5" }
        ]
      },
      Competitors: [
        {
          Reg: "PAIR-A",
          Name: "Player A / Player B",
          NameS: "A / B",
          Org: "MAC",
          Result: "3",
          Members: [
            { Reg: "P1", Name: "Player A", NameS: "A" },
            { Reg: "P2", Name: "Player B", NameS: "B" }
          ]
        },
        {
          Reg: "PAIR-B",
          Name: "Player C / Player D",
          NameS: "C / D",
          Org: "CHN",
          Result: "1",
          Members: [
            { Reg: "P3", Name: "Player C", NameS: "C" },
            { Reg: "P4", Name: "Player D", NameS: "D" }
          ]
        }
      ]
    };

    const snapshot = normalizeMatch(doublesMatch);

    expect(snapshot.teamScore).toEqual({ home: 3, away: 1 });
    expect(snapshot.activeMatch).toMatchObject({
      key: "W.DOUBLES-----------.R64-.000100--",
      currentGame: 4,
      games: { home: 3, away: 1 },
      points: { home: 13, away: 11 }
    });
    expect(snapshot.activeMatch?.periods.map(({ home, away }) => [home, away]))
      .toEqual([
        [11, 9],
        [11, 9],
        [7, 11],
        [13, 11],
        [0, 0]
      ]);
  });

  it("localizes team and doubles names by official registration id", () => {
    const raw = structuredClone(liveMatch);
    raw.Competitors[0].Reg = "TTEMTEAM-------MAC01";
    raw.Competitors[1].Reg = "TTEMTEAM-------CHN01";

    const snapshot = normalizeMatch(raw);

    expect(snapshot.teams.home.name).toBe("中国澳门");
    expect(snapshot.teams.away.name).toBe("中国");
    expect(snapshot.teams.home.countryCode).toBe("MO");
    expect(snapshot.teams.away.countryCode).toBe("CN");
  });

  it("derives the country code from the registration id when Org is absent", () => {
    const raw = structuredClone(liveMatch);
    raw.Competitors[0].Org = "";
    raw.Competitors[0].Reg = "TTEWTEAM-------JPN01";
    raw.Competitors[1].Org = "";
    raw.Competitors[1].Reg = "TTEMTEAM-------KOR01";

    const snapshot = normalizeMatch(raw);

    expect(snapshot.teams.home.countryCode).toBe("JP");
    expect(snapshot.teams.away.countryCode).toBe("KR");
  });

  it("composes a doubles name from localized members", () => {
    const raw = structuredClone(liveMatch);
    const mutableRaw = raw as unknown as {
      Competitors: unknown[];
      SubUnits: unknown[];
    };
    mutableRaw.Competitors = [
      {
        Reg: "TTEWDOUBLES----BAN01",
        Name: "TUSHI Samanta/MAHI Nowrin",
        NameS: "TUSHI S/MAHI N",
        Org: "BAN",
        Result: "1",
        Members: [
          { Reg: "1123574", Name: "TUSHI Samanta", NameS: "TUSHI S" },
          { Reg: "11973732", Name: "MAHI Nowrin", NameS: "MAHI N" }
        ]
      },
      {
        Reg: "UNKNOWN-PAIR",
        Name: "Player C/Player D",
        NameS: "C/D",
        Org: "TBD",
        Result: "0",
        Members: [
          { Reg: "UNKNOWN-C", Name: "Player C", NameS: "C" },
          { Reg: "UNKNOWN-D", Name: "Player D", NameS: "D" }
        ]
      }
    ];
    mutableRaw.SubUnits = [];

    const snapshot = normalizeMatch(raw);

    expect(snapshot.teams.home.name).toBe("萨曼塔·图希 / 诺琳·马希");
    expect(snapshot.teams.away.name).toBe("C / D");
  });

  it("falls back to the official English name for an unknown id", () => {
    const raw = structuredClone(liveMatch);
    raw.Competitors[0].Reg = "UNKNOWN";
    raw.Competitors[0].Name = "Unknown Player";
    raw.Competitors[0].NameS = "Unknown P";

    const snapshot = normalizeMatch(raw);

    expect(snapshot.teams.home.name).toBe("Unknown P");
  });

  it("defaults cards and time-outs to zero when the feed omits them", () => {
    const snapshot = normalizeMatch(liveMatch);

    expect(snapshot.teamDiscipline.home).toEqual({
      yellowCards: 0,
      redCards: 0,
      coachYellowCards: 0,
      coachRedCards: 0,
      timeoutsUsed: 0
    });    expect(snapshot.activeMatch?.discipline.away).toEqual({
      yellowCards: 0,
      redCards: 0,
      coachYellowCards: 0,
      coachRedCards: 0,
      timeoutsUsed: 0
    });
    expect(snapshot.timeout).toBeNull();
  });

  it("reads yellow, red, coach cards and used time-outs from extensions", () => {
    type MutableCompetitor = {
      Extensions: Array<{ Code: string; Value: string }>;
    };
    const raw = structuredClone(liveMatch) as unknown as {
      Competitors: MutableCompetitor[];
      SubUnits: Array<{ Competitors: MutableCompetitor[] }>;
    };
    raw.SubUnits[0].Competitors[0].Extensions = [
      { Code: "CardY", Value: "1" },
      { Code: "Card1", Value: "1" },
      { Code: "Card2", Value: "0" },
      { Code: "CardT", Value: "1" },
      { Code: "CoachCardYellow", Value: "1" },
      { Code: "CoachCardRed", Value: "0" },
      { Code: "Timeout", Value: "1" }
    ];
    raw.SubUnits[0].Competitors[1].Extensions = [
      { Code: "CardY", Value: "0" },
      { Code: "Card1", Value: "0" },
      { Code: "Card2", Value: "1" },
      { Code: "Timeout", Value: "0" }
    ];
    raw.Competitors[1].Extensions = [{ Code: "Timeout", Value: "1" }];

    const snapshot = normalizeMatch(raw);

    expect(snapshot.activeMatch?.discipline.home).toEqual({
      yellowCards: 1,
      redCards: 1,
      coachYellowCards: 1,
      coachRedCards: 0,
      timeoutsUsed: 1
    });
    expect(snapshot.activeMatch?.discipline.away).toEqual({
      yellowCards: 0,
      redCards: 1,
      coachYellowCards: 0,
      coachRedCards: 0,
      timeoutsUsed: 0
    });
    expect(snapshot.teamDiscipline.away.timeoutsUsed).toBe(1);
  });
});
