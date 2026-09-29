import { describe, expect, it } from "vitest";
import { normalizeSchedule } from "../server/schedule";

describe("normalizeSchedule", () => {
  it("flattens official event and phase trees", () => {
    const schedule = normalizeSchedule([
      {
        Desc: "Women's Team",
        Phases: [
          {
            Desc: "Women's Team Group A",
            Units: [
              {
                Key: "MATCH-1",
                EventDesc: "Women's Team",
                PhaseDesc: "Women's Team Group A",
                UnitDesc: "Group A Match 2",
                Home: {
                  Reg: "TTEMTEAM-------MAC01",
                  Org: "MAC",
                  Name: "Macau, China",
                  NameS: "Macau, China"
                },
                Away: {
                  Reg: "TTEMTEAM-------CHN01",
                  Org: "CHN",
                  Name: "People's Republic of China",
                  NameS: "China"
                },
                Status: "RUNNING",
                StatusDesc: "Running",
                DateTimeRaw: "2026-09-20T16:00:00+09:00",
                VenueDesc: "SKY HALL TOYOTA"
              }
            ]
          }
        ]
      }
    ]);

    expect(schedule).toEqual([
      {
        key: "MATCH-1",
        eventName: "Women's Team",
        phase: "Women's Team Group A",
        label: "Group A Match 2",
        home: {
          name: "中国澳门",
          abbreviation: "MAC",
          countryCode: "MO",
          flagUrl: null
        },
        away: {
          name: "中国",
          abbreviation: "CHN",
          countryCode: "CN",
          flagUrl: null
        },
        status: "RUNNING",
        statusDescription: "Running",
        startAt: "2026-09-20T16:00:00+09:00",
        venue: "SKY HALL TOYOTA"
      }
    ]);
  });
});
