import { gzipSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePayload } from "../server/codec";

const json = { Info: { Key: "TEST" }, values: [1, 2, 3] };

describe("decodePayload", () => {
  it("decodes a gzip payload after UTF-8/Latin-1 transport corruption", () => {
    const compressed = gzipSync(Buffer.from(JSON.stringify(json)));
    const transported = Buffer.from(compressed.toString("latin1"), "utf8");

    expect(decodePayload(transported)).toEqual(json);
  });

  it("decodes repeated zlib layers", () => {
    const inner = deflateSync(Buffer.from(JSON.stringify(json)));
    const outer = deflateSync(inner);

    expect(decodePayload(outer)).toEqual(json);
  });

  it("returns an object unchanged", () => {
    expect(decodePayload(json)).toBe(json);
  });
});
