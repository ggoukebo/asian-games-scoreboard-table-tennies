import { describe, expect, it } from "vitest";
import { parseMatchInput } from "../server/matchKey";

const MATCH_KEY = "W.TEAM--------------.GPA-.00020000";

describe("parseMatchInput", () => {
  it("accepts a raw match key", () => {
    expect(parseMatchInput(MATCH_KEY)).toBe(MATCH_KEY);
  });

  it("extracts a match key from the official hash URL", () => {
    expect(
      parseMatchInput(
        `https://results.asiangames2026.org/#/discipline/TTE/results/${MATCH_KEY}`
      )
    ).toBe(MATCH_KEY);
  });

  it("rejects non-TTE URLs", () => {
    expect(() =>
      parseMatchInput(
        "https://results.asiangames2026.org/#/discipline/ATH/results/ABC"
      )
    ).toThrow("URL 中没有找到 TTE 比赛 KEY");
  });

  it("rejects malformed keys", () => {
    expect(() => parseMatchInput("not a key!")).toThrow("比赛 KEY 格式无效");
  });
});
