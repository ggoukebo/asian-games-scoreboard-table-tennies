// 抓取模块：官方 AG2026 结果服务（TTE）。
import { gunzipSync, inflateSync } from "node:zlib";

const BASE = "https://back.results.asiangames2026.org/s/AG2026/en/TTE";

const tryParse = (buffer) => {
  const text = buffer.toString("utf8").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export const decodePayload = (input) => {
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

export const fetchAg = async (path) => {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json, text/plain, */*" }
  });
  if (!response.ok) {
    throw new Error(`请求失败 ${path}: ${response.status}`);
  }
  return decodePayload(Buffer.from(await response.arrayBuffer()));
};