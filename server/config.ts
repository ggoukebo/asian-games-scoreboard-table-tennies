const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: numberFromEnv(process.env.PORT, 3000),
  baseUrl:
    process.env.AG_BASE_URL ?? "https://back.results.asiangames2026.org",
  webUrl:
    process.env.AG_WEB_URL ?? "https://results.asiangames2026.org",
  socketUrl:
    process.env.AG_SOCKET_URL ?? "https://results.asiangames2026.org:443",
  championship: process.env.AG_CHAMP ?? "AG2026",
  language: process.env.AG_LANG ?? "en",
  pollMs: numberFromEnv(process.env.AG_POLL_MS, 4000),
  scheduleTtlMs: numberFromEnv(process.env.AG_SCHEDULE_TTL_MS, 60000),
  flagTtlMs: numberFromEnv(process.env.AG_FLAG_TTL_MS, 600000),
  /** 晋级路线快照的后台刷新间隔 */
  routesTtlMs: numberFromEnv(process.env.AG_ROUTES_TTL_MS, 30000),
  /** 未结束场次的逐局比分缓存时长 */
  routesDetailTtlMs: numberFromEnv(process.env.AG_ROUTES_DETAIL_TTL_MS, 20000),
  /** 未开赛场次（对阵已定但尚未开始）的明细缓存时长 */
  routesIdleDetailTtlMs: numberFromEnv(
    process.env.AG_ROUTES_IDLE_DETAIL_TTL_MS,
    300000
  ),
  /** 每轮刷新最多补抓多少场单场结果 */
  routesMaxDetails: numberFromEnv(process.env.AG_ROUTES_MAX_DETAILS, 36),
  // 一次暂停（Time-out）的展示时长，ITTF 规则为 60 秒
  timeoutSeconds: numberFromEnv(process.env.AG_TIMEOUT_SECONDS, 60)
} as const;

export const resultRoom = (matchKey: string): string =>
  `${config.championship}.${config.language}.res.TTE.${matchKey}`;
