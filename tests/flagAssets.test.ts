import { describe, expect, it } from "vitest";
import { parseOfficialFlagMap } from "../server/flagAssets";

describe("parseOfficialFlagMap", () => {
  it("extracts hashed flag assets from the official web bundle", () => {
    const script = [
      'const a="/assets/png/AFG.0-LEHJi0.png";',
      'const b="/assets/png/CHN.DdpT2hCV.png";',
      'const c="/assets/png/_fallback.0tb8ngv8.png";'
    ].join("");

    expect(parseOfficialFlagMap(script)).toEqual({
      AFG: "https://results.asiangames2026.org/assets/png/AFG.0-LEHJi0.png",
      CHN: "https://results.asiangames2026.org/assets/png/CHN.DdpT2hCV.png"
    });
  });
});
