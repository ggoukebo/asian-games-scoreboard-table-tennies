import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePayload } from "./codec";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "..");

/** 本地归档目录，默认仓库根目录下的 data/ */
export const archiveRoot = process.env.AG_ARCHIVE_DIR
  ? path.resolve(process.env.AG_ARCHIVE_DIR)
  : path.resolve(projectRoot, "data");

const unitsFile = path.join(archiveRoot, "schedule.decoded.json");
const rawUnitsFile = path.join(archiveRoot, "raw-units.bin");
const flagsFile = path.join(archiveRoot, "flags.json");
const resultsDir = path.join(archiveRoot, "results");

/** 与抓取脚本一致：把 key 中的非法字符替换为下划线 */
export const resultFileFor = (key: string): string =>
  path.join(resultsDir, `${key.replace(/[^\w.-]/g, "_")}.json`);

const readJson = (file: string): unknown | undefined => {
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    return undefined;
  }
};

export const hasArchivedMatch = (key: string): boolean =>
  existsSync(resultFileFor(key));

export const readArchivedMatch = (key: string): unknown | undefined =>
  readJson(resultFileFor(key));

export const hasArchivedUnits = (): boolean =>
  existsSync(unitsFile) || existsSync(rawUnitsFile);

/** 赛程原始数据：优先用解码后的 JSON，其次解码 raw-units.bin */
export const readArchivedUnits = (): unknown | undefined => {
  const decoded = readJson(unitsFile);
  if (decoded !== undefined) {
    return decoded;
  }
  if (!existsSync(rawUnitsFile)) {
    return undefined;
  }
  try {
    return decodePayload(readFileSync(rawUnitsFile));
  } catch {
    return undefined;
  }
};

export const readArchivedFlags = ():
  | Readonly<Record<string, string>>
  | undefined => {
  const value = readJson(flagsFile);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );
  return entries.length > 0
    ? Object.freeze(Object.fromEntries(entries))
    : undefined;
};
