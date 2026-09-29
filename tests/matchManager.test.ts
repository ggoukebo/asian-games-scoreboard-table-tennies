import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";
import type { MatchSnapshot } from "../shared/types";
import { resultRoom } from "../server/config";
import { MatchManager } from "../server/matchManager";

const MATCH_KEY = "W.TEAM--------------.GPA-.00020000";

const makeRaw = (
  homePoints: number,
  awayPoints: number,
  activeKey = "SUB-1",
  order = 1,
  currentGame = 1,
  server: "home" | "away" | null = null,
  timeouts: { home: number; away: number } = { home: 0, away: 0 },
  status: "RUNNING" | "OFFICIAL" = "RUNNING"
) => ({
  Info: {
    Key: MATCH_KEY,
    EventDesc: "Women's Team",
    Status: status,
    IsLive: status === "RUNNING"
  },
  Results: {
    ResDetail: "0-0",
    CurrentPeriod: currentGame
  },
  Competitors: [
    {
      Reg: "A",
      Name: "Team A",
      NameS: "A",
      Org: "A",
      Result: "0",
      Members: []
    },
    {
      Reg: "B",
      Name: "Team B",
      NameS: "B",
      Org: "B",
      Result: "0",
      Members: []
    }
  ],
  SubUnits: [
    {
      Info: {
        Key: activeKey,
        Status: status,
        StatusDesc: status === "RUNNING" ? "Running" : "Official",
        IsLive: status === "RUNNING",
        UnitDescA: `Match ${order}`
      },
      Results: {
        CurrentPeriod: currentGame,
        Extensions: [
          { Code: "SubMatchNum", Value: String(order) },
          ...(server
            ? [
                {
                  Code: "ServerHomeAway",
                  Value: server === "home" ? "1" : "2"
                }
              ]
            : [])
        ],
        Periods: [
          {
            Order: currentGame,
            ResHome: String(homePoints),
            ResAway: String(awayPoints),
            DescS: String(currentGame)
          }
        ]
      },
      Competitors: [
        {
          Reg: "P1",
          Name: "Player A",
          NameS: "A",
          Org: "A",
          Result: "0",
          Extensions: [{ Code: "Timeout", Value: String(timeouts.home) }]
        },
        {
          Reg: "P2",
          Name: "Player B",
          NameS: "B",
          Org: "B",
          Result: "0",
          Extensions: [{ Code: "Timeout", Value: String(timeouts.away) }]
        }
      ]
    }
  ]
});

class ControlledClient {
  calls = 0;
  private readonly pending: Array<(value: unknown) => void> = [];

  getMatch(_matchKey: string): Promise<unknown> {
    this.calls += 1;
    return new Promise((resolve) => {
      this.pending.push(resolve);
    });
  }

  resolveNext(value: unknown): void {
    const resolve = this.pending.shift();
    if (!resolve) {
      throw new Error("No pending match request");
    }
    resolve(value);
  }
}

class FakeSocket {
  private readonly listeners = new Map<
    string,
    Set<(...args: unknown[]) => void>
  >();

  on(event: string, listener: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  emit(_event: string, ..._args: unknown[]): this {
    return this;
  }

  disconnect(): this {
    return this;
  }

  fire(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe("MatchManager refresh arbitration", () => {
  it("does not let a slower poll overwrite a newer socket score", async () => {
    const client = new ControlledClient();
    const socket = new FakeSocket();
    const manager = new MatchManager(
      client,
      () => socket as unknown as Socket
    );
    const emitted: MatchSnapshot[] = [];
    manager.on("snapshot", (_key: string, snapshot: MatchSnapshot) => {
      emitted.push(snapshot);
    });

    const unsubscribe = manager.subscribe(MATCH_KEY);
    try {
      socket.fire("connect");
      socket.fire("data", {
        room: resultRoom(MATCH_KEY),
        info: makeRaw(0, 5)
      });

      client.resolveNext(makeRaw(0, 3));
      await flush();

      expect(manager.getSnapshot(MATCH_KEY)?.activeMatch?.points).toEqual({
        home: 0,
        away: 5
      });
      expect(emitted.at(-1)?.activeMatch?.points).toEqual({
        home: 0,
        away: 5
      });
    } finally {
      unsubscribe();
    }
  });

  it("uses a poll result when the socket is disconnected", async () => {
    const client = new ControlledClient();
    const socket = new FakeSocket();
    const manager = new MatchManager(
      client,
      () => socket as unknown as Socket
    );

    const unsubscribe = manager.subscribe(MATCH_KEY);
    try {
      client.resolveNext(makeRaw(0, 1));
      await flush();

      socket.fire("connect");
      socket.fire("disconnect");

      const refresh = manager.refresh(MATCH_KEY);
      client.resolveNext(makeRaw(0, 4));
      await refresh;

      expect(manager.getSnapshot(MATCH_KEY)?.activeMatch?.points).toEqual({
        home: 0,
        away: 4
      });
    } finally {
      unsubscribe();
    }
  });

  it("rejects a stale poll result after the socket disconnects", async () => {
    const client = new ControlledClient();
    const socket = new FakeSocket();
    const manager = new MatchManager(
      client,
      () => socket as unknown as Socket
    );

    const unsubscribe = manager.subscribe(MATCH_KEY);
    try {
      client.resolveNext(makeRaw(0, 1));
      await flush();

      socket.fire("connect");
      socket.fire("data", {
        room: resultRoom(MATCH_KEY),
        info: makeRaw(0, 5)
      });
      socket.fire("disconnect");

      const refresh = manager.refresh(MATCH_KEY);
      client.resolveNext(makeRaw(0, 3));
      await refresh;

      expect(manager.getSnapshot(MATCH_KEY)?.activeMatch?.points).toEqual({
        home: 0,
        away: 5
      });
    } finally {
      unsubscribe();
    }
  });

  it("accepts a poll result when a new game starts", async () => {
    const client = new ControlledClient();
    const socket = new FakeSocket();
    const manager = new MatchManager(
      client,
      () => socket as unknown as Socket
    );

    const unsubscribe = manager.subscribe(MATCH_KEY);
    try {
      client.resolveNext(makeRaw(0, 1));
      await flush();

      socket.fire("connect");
      socket.fire("data", {
        room: resultRoom(MATCH_KEY),
        info: makeRaw(10, 6)
      });
      socket.fire("disconnect");

      const refresh = manager.refresh(MATCH_KEY);
      client.resolveNext(makeRaw(0, 0, "SUB-1", 1, 2));
      await refresh;

      expect(manager.getSnapshot(MATCH_KEY)?.activeMatch).toMatchObject({
        currentGame: 2,
        points: { home: 0, away: 0 }
      });
    } finally {
      unsubscribe();
    }
  });

  it("rejects a stale poll that only changes the server", async () => {
    const client = new ControlledClient();
    const socket = new FakeSocket();
    const manager = new MatchManager(
      client,
      () => socket as unknown as Socket
    );

    const unsubscribe = manager.subscribe(MATCH_KEY);
    try {
      client.resolveNext(makeRaw(0, 1));
      await flush();

      socket.fire("connect");
      socket.fire("data", {
        room: resultRoom(MATCH_KEY),
        info: makeRaw(0, 0, "SUB-1", 1, 1, "away")
      });
      socket.fire("disconnect");

      const refresh = manager.refresh(MATCH_KEY);
      client.resolveNext(makeRaw(0, 0, "SUB-1", 1, 1, "home"));
      await refresh;

      expect(manager.getSnapshot(MATCH_KEY)?.activeMatch?.server).toBe("away");
    } finally {
      unsubscribe();
    }
  });

  it("accepts a socket update for a new singles match", async () => {
    const client = new ControlledClient();
    const socket = new FakeSocket();
    const manager = new MatchManager(
      client,
      () => socket as unknown as Socket
    );

    const unsubscribe = manager.subscribe(MATCH_KEY);
    try {
      socket.fire("connect");
      socket.fire("data", {
        room: resultRoom(MATCH_KEY),
        info: makeRaw(0, 5)
      });
      socket.fire("data", {
        room: resultRoom(MATCH_KEY),
        info: makeRaw(0, 1, "SUB-2", 2)
      });

      expect(manager.getSnapshot(MATCH_KEY)?.activeMatch).toMatchObject({
        key: "SUB-2",
        order: 2,
        points: { home: 0, away: 1 }
      });
    } finally {
      unsubscribe();
    }
  });
});

describe("MatchManager local archive", () => {
  it("loads an archived match once without opening a socket or polling", async () => {
    vi.useFakeTimers();
    const getMatch = vi.fn(async () =>
      makeRaw(0, 3, "SUB-1", 1, 1, null, { home: 0, away: 0 }, "OFFICIAL")
    );
    const hasArchivedMatch = vi.fn(() => true);
    const createSocket = vi.fn(() => new FakeSocket() as unknown as Socket);
    const manager = new MatchManager(
      { getMatch, hasArchivedMatch },
      createSocket
    );

    const unsubscribe = manager.subscribe(MATCH_KEY);
    try {
      await vi.advanceTimersByTimeAsync(0);

      expect(getMatch).toHaveBeenCalledTimes(1);
      expect(createSocket).not.toHaveBeenCalled();
      expect(manager.getStatus(MATCH_KEY).state).toBe("archived");

      await vi.advanceTimersByTimeAsync(10000);
      expect(getMatch).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      vi.useRealTimers();
    }
  });
});

describe("MatchManager time-out tracking", () => {
  const START = new Date("2026-09-20T10:00:00+09:00");

  const makeManager = (): { manager: MatchManager; client: ControlledClient } => {
    const client = new ControlledClient();
    const manager = new MatchManager(
      client,
      () => new FakeSocket() as unknown as Socket
    );
    return { manager, client };
  };

  const load = async (
    manager: MatchManager,
    client: ControlledClient,
    raw: unknown
  ): Promise<MatchSnapshot> => {
    const refresh = manager.refresh(MATCH_KEY);
    client.resolveNext(raw);
    await refresh;
    return manager.getSnapshot(MATCH_KEY) as MatchSnapshot;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags the side that called a time-out until play resumes", async () => {
    const { manager, client } = makeManager();

    await load(manager, client, makeRaw(0, 1));
    expect(manager.getSnapshot(MATCH_KEY)?.timeout).toBeNull();

    await load(
      manager,
      client,
      makeRaw(0, 1, "SUB-1", 1, 1, null, { home: 1, away: 0 })
    );
    const timeout = manager.getSnapshot(MATCH_KEY)?.timeout;
    expect(timeout?.side).toBe("home");
    expect(timeout?.seconds).toBe(60);
    expect(Date.parse(timeout?.endsAt ?? "")).toBe(START.getTime() + 60000);

    // 暂停期间比分不变：提示继续保留
    vi.setSystemTime(new Date(START.getTime() + 20000));
    await load(
      manager,
      client,
      makeRaw(0, 1, "SUB-1", 1, 1, null, { home: 1, away: 0 })
    );
    expect(manager.getSnapshot(MATCH_KEY)?.timeout?.side).toBe("home");

    // 重新开始得分：比赛已恢复，提示消失
    vi.setSystemTime(new Date(START.getTime() + 35000));
    await load(
      manager,
      client,
      makeRaw(1, 1, "SUB-1", 1, 1, null, { home: 1, away: 0 })
    );
    expect(manager.getSnapshot(MATCH_KEY)?.timeout).toBeNull();
  });

  it("clears the time-out once the minute is over", async () => {
    const { manager, client } = makeManager();

    await load(manager, client, makeRaw(0, 1));
    await load(
      manager,
      client,
      makeRaw(0, 1, "SUB-1", 1, 1, null, { home: 0, away: 1 })
    );
    expect(manager.getSnapshot(MATCH_KEY)?.timeout?.side).toBe("away");

    vi.setSystemTime(new Date(START.getTime() + 61000));
    await load(
      manager,
      client,
      makeRaw(0, 1, "SUB-1", 1, 1, null, { home: 0, away: 1 })
    );
    expect(manager.getSnapshot(MATCH_KEY)?.timeout).toBeNull();
  });

  it("never keeps a time-out on a finished match", async () => {
    const { manager, client } = makeManager();

    await load(manager, client, makeRaw(0, 1));
    await load(
      manager,
      client,
      makeRaw(11, 9, "SUB-1", 1, 1, null, { home: 1, away: 0 })
    );
    expect(manager.getSnapshot(MATCH_KEY)?.timeout?.side).toBe("home");

    await load(
      manager,
      client,
      makeRaw(11, 9, "SUB-1", 1, 1, null, { home: 1, away: 0 }, "OFFICIAL")
    );
    expect(manager.getSnapshot(MATCH_KEY)?.timeout).toBeNull();
  });
});
