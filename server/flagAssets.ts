import { config } from "./config";
import { readArchivedFlags } from "./archive";

export type FlagMap = Readonly<Record<string, string>>;

interface FlagCache {
  expiresAt: number;
  value: FlagMap;
}

const SCRIPT_PATTERN =
  /<script[^>]+src=["']([^"']*\/assets\/[^"']+\.js)["'][^>]*>/i;
const FLAG_PATTERN =
  /([A-Za-z0-9_$]+)="(\/assets\/png\/([A-Z0-9_]{3})\.[A-Za-z0-9_-]+\.png)"/g;

const absoluteAssetUrl = (value: string): string =>
  new URL(value, config.webUrl).toString();

const parseFlagMap = (script: string): FlagMap => {
  const entries = new Map<string, string>();

  for (const match of script.matchAll(FLAG_PATTERN)) {
    const code = match[3];
    const url = absoluteAssetUrl(match[2]);
    if (code && url) {
      entries.set(code, url);
    }
  }

  return Object.freeze(Object.fromEntries(entries));
};

const fetchText = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/javascript,text/javascript,*/*"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Flag asset request failed with ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

const loadFlagMap = async (): Promise<FlagMap> => {
  const page = await fetchText(config.webUrl);
  const scriptPath = SCRIPT_PATTERN.exec(page)?.[1];
  if (!scriptPath) {
    throw new Error("Unable to find the official web results script");
  }

  const script = await fetchText(absoluteAssetUrl(scriptPath));
  const flags = parseFlagMap(script);
  if (Object.keys(flags).length === 0) {
    throw new Error("Unable to find official flag assets");
  }
  return flags;
};

let cache: FlagCache | undefined;
let inFlight: Promise<FlagMap> | undefined;
let archivedFlags: FlagMap | undefined;
let archivedFlagsLoaded = false;

/** data/flags.json（如存在）作为永不过期的离线旗帜映射 */
const getArchivedFlags = (): FlagMap | undefined => {
  if (!archivedFlagsLoaded) {
    archivedFlagsLoaded = true;
    archivedFlags = readArchivedFlags();
  }
  return archivedFlags;
};

export const getCachedFlagMap = (): FlagMap => {
  const archived = getArchivedFlags();
  if (archived && config.mode !== "live") {
    return archived;
  }
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }
  return {};
};

export const warmFlagMap = (): void => {
  if (config.mode !== "live" && getArchivedFlags()) {
    return;
  }
  void getFlagMap().catch(() => undefined);
};

export const getFlagMap = async (): Promise<FlagMap> => {
  const archived = getArchivedFlags();
  if (archived && config.mode !== "live") {
    return archived;
  }

  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  if (!inFlight) {
    inFlight = loadFlagMap()
      .then((value) => {
        cache = {
          expiresAt: Date.now() + config.flagTtlMs,
          value
        };
        return value;
      })
      .finally(() => {
        inFlight = undefined;
      });
  }

  return inFlight;
};

export const getFlagUrl = async (org: string): Promise<string | null> => {
  const code = org.trim().toUpperCase();
  if (!code || code === "BYE") {
    return null;
  }

  const flags = await getFlagMap();
  return flags[code] ?? null;
};

export const parseOfficialFlagMap = parseFlagMap;
