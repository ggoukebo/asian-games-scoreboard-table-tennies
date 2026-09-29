import path from "node:path";
import { fileURLToPath } from "node:url";
import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import type {
  HealthResponse,
  MatchSnapshot,
  RoutesSnapshot,
  StreamStatus
} from "../shared/types";
import { AgClient } from "./agClient";
import { config } from "./config";
import { MatchManager } from "./matchManager";
import { parseMatchInput } from "./matchKey";
import { RouteService } from "./routeService";

const app = express();
const client = new AgClient();
const manager = new MatchManager(client);
const routes = new RouteService(client);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(currentDirectory, "../dist/web");

app.disable("x-powered-by");
app.use(express.json());

app.get("/api/health", (_request, response) => {
  const routeSnapshot = routes.getSnapshot();
  const payload: HealthResponse = {
    ok: true,
    service: "AG2026 Table Tennis Scoreboard",
    mode: config.mode,
    source: {
      baseUrl: config.baseUrl,
      socketUrl: config.socketUrl,
      championship: config.championship,
      language: config.language
    },
    activeMatches: manager.activeMatches,
    routesUpdatedAt: routeSnapshot?.updatedAt ?? null,
    routesStale: routeSnapshot?.stale ?? true
  };
  response.json(payload);
});

app.get("/api/tt/schedule", async (_request, response, next) => {
  try {
    response.json(await client.getSchedule());
  } catch (error) {
    next(error);
  }
});

app.get("/api/tt/routes", async (_request, response, next) => {
  try {
    response.json(await routes.getRoutes());
  } catch (error) {
    next(error);
  }
});

app.post("/api/tt/routes/refresh", async (_request, response, next) => {
  try {
    response.json(await routes.refresh(true));
  } catch (error) {
    next(error);
  }
});

app.get("/api/tt/routes/stream", async (request, response, next) => {
  let heartbeat: NodeJS.Timeout | undefined;

  try {
    response.status(200);
    response.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.flushHeaders();

    const send = (snapshot: RoutesSnapshot): void => {
      response.write("event: routes\n");
      response.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    };
    const onUpdate = (snapshot: RoutesSnapshot): void => {
      send(snapshot);
    };

    routes.on("update", onUpdate);
    const current = routes.getSnapshot();
    if (current) {
      send(current);
    } else {
      void routes.refresh().catch(() => undefined);
    }

    heartbeat = setInterval(() => {
      response.write(": heartbeat\n\n");
    }, 15000);

    request.on("close", () => {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      routes.off("update", onUpdate);
    });
  } catch (error) {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    next(error);
  }
});

app.get("/api/tt/resolve", (request, response, next) => {
  try {
    const input = String(request.query.input ?? "");
    response.json({ key: parseMatchInput(input) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tt/matches/:key", async (request, response, next) => {
  try {
    const key = parseMatchInput(request.params.key);
    const snapshot = await manager.refresh(key);
    response.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.get("/api/tt/matches/:key/stream", async (request, response, next) => {
  let unsubscribe: (() => void) | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  try {
    const key = parseMatchInput(request.params.key);
    response.status(200);
    response.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.flushHeaders();

    const send = (event: string, data: unknown): void => {
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onSnapshot = (
      changedKey: string,
      snapshot: MatchSnapshot
    ): void => {
      if (changedKey === key) {
        send("snapshot", snapshot);
      }
    };
    const onStatus = (changedKey: string, status: StreamStatus): void => {
      if (changedKey === key) {
        send("status", status);
      }
    };

    manager.on("snapshot", onSnapshot);
    manager.on("status", onStatus);
    unsubscribe = manager.subscribe(key);

    const snapshot = manager.getSnapshot(key);
    if (snapshot) {
      send("snapshot", snapshot);
    }
    send("status", manager.getStatus(key));

    heartbeat = setInterval(() => {
      response.write(": heartbeat\n\n");
    }, 15000);

    request.on("close", () => {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      manager.off("snapshot", onSnapshot);
      manager.off("status", onStatus);
      unsubscribe?.();
    });
  } catch (error) {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    unsubscribe?.();
    next(error);
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(webDist));
  app.get("/{*splat}", (_request, response) => {
    response.sendFile(path.join(webDist, "index.html"));
  });
}

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction
  ) => {
    const message =
      error instanceof Error ? error.message : "服务器处理请求时发生错误";
    response.status(400).json({ error: message });
  }
);

app.listen(config.port, config.host, () => {
  routes.start();
  const archiveHint =
    config.mode === "live"
      ? "live"
      : client.hasArchivedUnits()
        ? `${config.mode} (archived data available)`
        : `${config.mode} (no local archive)`;
  console.log(
    `AG2026 scoreboard listening on http://${config.host}:${config.port} [${archiveHint}]`
  );
});
