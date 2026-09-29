// 抓取官方网页中的国旗资源映射并缓存到 data/flags.json（离线归档用）。
// 用法: node data/fetch-flags.mjs
import { writeFileSync } from "node:fs";

const WEB = process.env.AG_WEB_URL ?? "https://results.asiangames2026.org";
const OUT = "data/flags.json";

const SCRIPT_PATTERN =
  /<script[^>]+src=["']([^"']*\/assets\/[^"']+\.js)["'][^>]*>/i;
const FLAG_PATTERN =
  /([A-Za-z0-9_$]+)="(\/assets\/png\/([A-Z0-9_]{3})\.[A-Za-z0-9_-]+\.png)"/g;

const getText = async (url) => {
  const response = await fetch(url, {
    headers: { Accept: "text/html,application/javascript,text/javascript,*/*" }
  });
  if (!response.ok) {
    throw new Error(`请求失败 ${url}: ${response.status}`);
  }
  return response.text();
};

const page = await getText(WEB);
const scriptPath = SCRIPT_PATTERN.exec(page)?.[1];
if (!scriptPath) {
  throw new Error("未能在官网首页找到结果页脚本");
}

const scriptUrl = new URL(scriptPath, WEB).toString();
const script = await getText(scriptUrl);

const flags = {};
for (const match of script.matchAll(FLAG_PATTERN)) {
  const code = match[3];
  const path = match[2];
  if (code && path) {
    flags[code] = new URL(path, WEB).toString();
  }
}

const count = Object.keys(flags).length;
if (count === 0) {
  throw new Error("未能解析出国旗资源");
}

writeFileSync(OUT, `${JSON.stringify(flags, null, 2)}\n`);
console.log(`OK ${count} 面旗帜 -> ${OUT}`);
