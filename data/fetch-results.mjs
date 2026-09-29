// 抓取全部单元的单场结果并缓存到 data/results/<key>.json（可重复运行，已存在则跳过）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fetchAg } from "./ag.mjs";

const OUT_DIR = "data/results";
mkdirSync(OUT_DIR, { recursive: true });

const schedule = JSON.parse(readFileSync("data/schedule.decoded.json", "utf8"));
const keys = [];
for (const event of schedule) {
  for (const phase of event.Phases ?? []) {
    for (const unit of phase.Units ?? []) {
      if (unit.Key) keys.push(unit.Key);
    }
  }
}

const fileFor = (key) => `${OUT_DIR}/${key.replace(/[^\w.-]/g, "_")}.json`;
const force = process.env.AG_FORCE === "1";
const pending = force ? [...keys] : keys.filter((key) => !existsSync(fileFor(key)));
let done = 0;
let failed = 0;

const worker = async () => {
  while (pending.length > 0) {
    const key = pending.shift();
    try {
      const payload = await fetchAg(`/results/${encodeURIComponent(key)}`);
      writeFileSync(fileFor(key), JSON.stringify(payload));
      done += 1;
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${key}: ${error.message}`);
    }
    if ((done + failed) % 25 === 0) {
      console.log(`progress ${done + failed}/${keys.length}`);
    }
  }
};

await Promise.all(Array.from({ length: 6 }, worker));
console.log(`DONE cached=${done} failed=${failed} total=${keys.length}`);