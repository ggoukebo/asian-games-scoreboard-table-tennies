import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  archiveRoot,
  hasArchivedMatch,
  hasArchivedUnits,
  readArchivedFlags,
  readArchivedMatch,
  readArchivedUnits,
  resultFileFor
} from "../server/archive";

const MATCH_KEY = "W.TEAM--------------.GPA-.00020000";

describe("local archive", () => {
  it("ships the schedule, complete match results, and flag mapping", () => {
    expect(hasArchivedUnits()).toBe(true);
    expect(readArchivedUnits()).toBeDefined();

    expect(hasArchivedMatch(MATCH_KEY)).toBe(true);
    expect(readArchivedMatch(MATCH_KEY)).toBeDefined();
    expect(Object.keys(readArchivedFlags() ?? {}).length).toBeGreaterThanOrEqual(
      255
    );

    const resultFiles = readdirSync(path.join(archiveRoot, "results")).filter(
      (name) => name.endsWith(".json")
    );
    expect(resultFiles).toHaveLength(284);
  });

  it("sanitizes match keys before using them as file names", () => {
    expect(path.basename(resultFileFor("A/B:C"))).toBe("A_B_C.json");
  });
});
