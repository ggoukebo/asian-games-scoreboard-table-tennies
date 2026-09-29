# 数据管道：AG2026 乒乓球晋级路线

数据来源：2026 爱知名古屋亚运会官方成绩系统

- 赛程（项目 → 阶段 → 场次，含比分与胜者）：`/s/AG2026/en/TTE/events/phases/units`
- 单场结果（含逐局比分、选手成员、历史战绩）：`/s/AG2026/en/TTE/results/{场次Key}`
- 官方响应体是「UTF-8 包装过的 zlib 流」：需先按 latin1 还原字节再 `inflate`，见 [ag.mjs](ag.mjs)。

## 一键刷新

```powershell
node data/fetch-raw.mjs data/schedule.decoded.json   # 刷新赛程快照
$env:AG_FORCE='1'; node data/fetch-results.mjs       # 刷新全部单场结果（去掉 AG_FORCE 则只补抓缺失场次）
node data/fetch-flags.mjs                             # 刷新协会代码到官方旗帜资源的映射
node_modules\.bin\tsx.cmd data/build-routes.ts        # 生成报告（会复用项目的中文名对照表）
```

`build-routes.ts` 依赖 `server/chineseNames.ts` 的中文对照（选手 10 位注册号、协会/组合名），因此用 `tsx` 运行。

## 与应用内实现的关系

应用（`http://localhost:3000` 的「晋级路线」视图）内置了同一套口径的在线实现，
由后端实时维护快照，无需运行本目录脚本。默认 `AG_MODE=auto`，优先读取本目录的归档；
设置 `AG_MODE=offline` 时可完全断网运行：

| 位置 | 说明 |
| --- | --- |
| [server/routeModel.ts](../server/routeModel.ts) | 纯函数模型：赛程 + 单场结果 → 签表与晋级路线（口径与 `build-routes.ts` 一致） |
| [server/routeService.ts](../server/routeService.ts) | 抓取、缓存、后台刷新、按轮转配额补全单场细节，并通过 SSE 推送变更 |
| `GET /api/tt/routes` | 应用接口（另有 `/refresh` 与 `/stream`，详见根目录 README） |

本目录脚本适合离线导出、批量校验与生成评审用的 Markdown/CSV。

## 产物

| 文件 | 说明 |
| --- | --- |
| [晋级路线.md](../晋级路线.md) | 主交付物：7 个项目的总览 + 全部 284 场对阵 + 各条晋级路线 |
| [routes.json](routes.json) | 结构化对阵树与晋级路线，含 `feeders`/`feedsInto`（上下轮连接）、比分、胜者、下一轮对手 |
| [match-results.csv](match-results.csv) | 全部场次明细（项目/轮次/场次/时间/球台/双方/比分/局分/胜者/晋级去向），便于二次处理 |
| [schedule.decoded.json](schedule.decoded.json) | 官方赛程快照（解码后原文） |
| [raw-units.bin](raw-units.bin) | 官方赛程响应的原始字节，用于排查编码问题 |
| [results/](results/) | 每场单场结果缓存（284 个文件，已纳入版本库，用于离线回放） |
| [flags.json](flags.json) | 255 个协会代码到官方旗帜资源的映射；断网时前端自动降级显示协会代码 |

在仓库根目录执行以下命令即可离线打开完整页面：

```powershell
npm run build
npm run start:offline
```

## 口径

- 淘汰赛编号规则：第 N 轮第 i 场的胜者进入第 N+1 轮第 ⌈i/2⌉ 场（奇数进主位、偶数进客位）；轮空即该编号场次不存在。
- 全部 284 场中，仅女团半决赛第 1 场的主客顺序与该规则相反，脚本已按官方名单校订。
- 官方对弃权场次记为 `0-0` 且局分为 `W/O`，脚本按“对手弃权”展示。
- 官方未回填 `Winner` 的已结束场次（例如 9/26 已打完的混双决赛）按总比分推断胜者。
- 双打对阵有时只有成员、没有组合注册号；有单场结果时以官方组合注册号为准，
  否则以成员中文名作为身份标识。
