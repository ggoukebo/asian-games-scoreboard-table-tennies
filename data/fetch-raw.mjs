// 抓取官方赛事单元原始数据（AG2026 乒乓球 TTE）并解码为 JSON。
// 用法: node data/fetch-raw.mjs [输出文件]
import { gunzipSync, inflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const URL_PATH = process.env.AG_UNITS_PATH ?? "/events/phases/units";
const url = `https://back.results.asiangames2026.org/s/AG2026/en/TTE${URL_PATH}`;
const out = process.argv[2] ?? "data/schedule.decoded.json";

const tryParse = (buffer) => {
  const text = buffer.toString("utf8").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const decode = (input) => {
  const candidates = [input, Buffer.from(input.toString("utf8"), "latin1")];
  for (const candidate of candidates) {
    let current = candidate;
    for (let pass = 0; pass < 4; pass += 1) {
      const parsed = tryParse(current);
      if (parsed !== undefined) return parsed;
      let next = null;
      try {
        if (current[0] === 0x1f) next = gunzipSync(current);
        else if (current[0] === 0x78) next = inflateSync(current);
      } catch {
        next = null;
      }
      if (!next) break;
      current = next;
    }
  }
  throw new Error("无法解码官方数据");
};

const response = await fetch(url, {
  headers: { Accept: "application/json, text/plain, */*" }
});
if (!response.ok) {
  throw new Error(`请求失败: ${response.status} ${response.statusText}`);
}
const raw = Buffer.from(await response.arrayBuffer());
writeFileSync("data/raw-units.bin", raw);
const decoded = decode(raw);
writeFileSync(out, JSON.stringify(decoded, null, 2));
console.log(`OK ${url} raw=${raw.length}B -> ${out}`);