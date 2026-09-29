import type { ScheduleMatch } from "../shared/types";
import { config } from "./config";
import { decodeResponse } from "./codec";
import { getCachedFlagMap, warmFlagMap } from "./flagAssets";
import { normalizeSchedule } from "./schedule";

const officialPath = (path: string): string =>
  `${config.baseUrl}/s/${config.championship}/${config.language}/TTE${path}`;

const fetchOfficial = async (path: string): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(officialPath(path), {
      headers: {
        Accept: "application/json, text/plain, */*"
      },
      signal: controller.signal
    });
    return await decodeResponse(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("官方结果服务请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export class AgClient {
  private scheduleCache:
    | { expiresAt: number; value: ScheduleMatch[] }
    | undefined;
  private rawUnitsCache: { expiresAt: number; value: unknown } | undefined;

  async getMatch(matchKey: string): Promise<unknown> {
    return fetchOfficial(`/results/${encodeURIComponent(matchKey)}`);
  }

  /** 官方赛程原始数据（含注册号、比分、胜者、场地等，供晋级路线使用） */
  async getRawUnits(): Promise<unknown> {
    const now = Date.now();
    if (this.rawUnitsCache && this.rawUnitsCache.expiresAt > now) {
      return this.rawUnitsCache.value;
    }

    const value = await fetchOfficial("/events/phases/units");
    this.rawUnitsCache = {
      expiresAt: now + config.scheduleTtlMs,
      value
    };
    return value;
  }

  async getSchedule(): Promise<ScheduleMatch[]> {
    const now = Date.now();
    if (this.scheduleCache && this.scheduleCache.expiresAt > now) {
      return this.scheduleCache.value;
    }

    const raw = await fetchOfficial("/events/phases/units");
    const value = normalizeSchedule(raw, getCachedFlagMap());
    warmFlagMap();
    this.scheduleCache = {
      expiresAt: now + config.scheduleTtlMs,
      value
    };
    return value;
  }
}
