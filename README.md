# AG2026 乒乓球实时记分牌

读取亚洲运动会 2026 官方结果服务中的 TTE（乒乓球）比赛数据，并在本地或局域网网页中展示：

- 团体大比分
- 当前单打场次与双方已赢局数
- 当前局小分与发球方
- 各局比分和已完成单打
- 黄牌 / 红牌徽标（选手与教练）
- 某一方暂停（Time-out）提示与倒计时
- 各项目晋级路线：签表对阵、逐轮比分与每位选手（组合/队伍）的晋级历程
- 官方 Socket.IO 实时更新与 4 秒轮询兜底

## 页面视图

顶栏右上角可切换两个视图：

| 视图 | 内容 |
| --- | --- |
| 实时记分牌 | 单场比赛的实时大比分、局分、发球方、暂停与判罚 |
| 晋级路线 | 7 个项目的签表对阵、逐轮比分、当前签表内选手的晋级历程（可一键跳到该场的记分牌） |

## 本地开发

```powershell
npm install
npm run dev
```

- 前端开发地址：`http://localhost:5173`
- 后端 API 地址：`http://localhost:3000`

页面默认填入示例比赛：

```text
W.TEAM--------------.GPA-.00020000
```

也可以粘贴完整的官方结果 URL，或从 TTE 赛程下拉框选择比赛。

## 生产构建

```powershell
npm run build
npm start
```

生产模式由后端在 `http://0.0.0.0:3000` 同时提供 API 和前端页面。局域网设备可通过运行主机的 IP 和 `3000` 端口访问。

## 配置

复制 `.env.example` 中的变量到运行环境即可覆盖默认值。应用不会自动加载 `.env` 文件，请通过终端或进程管理器注入环境变量。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `3000` | 服务端口 |
| `AG_BASE_URL` | `https://back.results.asiangames2026.org` | 官方 HTTP 数据源 |
| `AG_WEB_URL` | `https://results.asiangames2026.org` | 官方网页与旗帜资源来源 |
| `AG_SOCKET_URL` | `https://results.asiangames2026.org:443` | 官方 Socket.IO 地址 |
| `AG_CHAMP` | `AG2026` | 赛事代码 |
| `AG_LANG` | `en` | 官方数据语言 |
| `AG_POLL_MS` | `4000` | 轮询兜底周期 |
| `AG_SCHEDULE_TTL_MS` | `60000` | 赛程缓存时间 |
| `AG_FLAG_TTL_MS` | `600000` | 官网旗帜资源映射缓存时间 |
| `AG_ROUTES_TTL_MS` | `30000` | 晋级路线快照的后台刷新间隔 |
| `AG_ROUTES_DETAIL_TTL_MS` | `20000` | 进行中场次的逐局比分缓存时长 |
| `AG_ROUTES_IDLE_DETAIL_TTL_MS` | `300000` | 未开赛场次的单场结果缓存时长 |
| `AG_ROUTES_MAX_DETAILS` | `36` | 每轮刷新最多补抓多少场单场结果 |
| `AG_TIMEOUT_SECONDS` | `60` | 一次暂停提示的展示时长（秒） |

## 晋级路线

`GET /api/tt/routes` 返回全部 7 个项目的签表与晋级路线快照（`RoutesSnapshot`）：

- `events[].rounds`：淘汰赛各轮（按时间先后）与每场比赛的主客方、总比分、逐局比分、
  场地/球台、出线去向。
- `events[].groups`：团体赛小组赛各轮。
- `events[].routes`：当前仍在签表中的选手（组合/队伍）的晋级历程，含每一轮的对手、
  本方视角比分、状态（`win` / `loss` / `running` / `pending` / `bye`）与下一轮对手。
- `updatedAt` / `stale`：最近一次成功同步时间与是否处于异常状态。

配套接口：

| 接口 | 说明 |
| --- | --- |
| `GET /api/tt/routes` | 读取当前快照（服务启动后由后台定时刷新维护） |
| `POST /api/tt/routes/refresh` | 立即强制刷新并返回新快照 |
| `GET /api/tt/routes/stream` | SSE 推送（`event: routes`），数据变化时主动下发 |
| `GET /api/health` | 额外返回 `routesUpdatedAt` / `routesStale` |

实现分三层，便于单独测试：

| 文件 | 职责 |
| --- | --- |
| `server/routeModel.ts` | 纯函数：由官方赛程 + 单场结果构建签表与路线（`tests/routeModel.test.ts` 覆盖） |
| `server/routeService.ts` | 抓取、缓存、后台刷新、细节补全与变更推送 |
| `web/src/RoutesView.tsx` | 晋级路线视图（项目页签、路线卡片、对阵手风琴） |

口径说明：

1. 晋级关系按官方签表编号推算：第 N 轮第 i 场的胜者进入第 N+1 轮第 ⌈i/2⌉ 场，
   奇数场为主方、偶数场为客方；缺少的编号表示轮空。女子团体半决赛的主客顺序与
   该规则相反，读取时以官方数据为准。
2. 官方未回填 `Winner` 的已结束场次（例如已打完的决赛）按总比分推断胜者。
3. 双打组合的对阵有时只有成员、没有组合注册号，此时用成员中文名作为路线身份，
   并在有单场结果时以官方组合注册号为准。
4. 对手弃权记为 `W/O`（`0-0`、`IRM: "W/O"`）；团体赛的“小盘比分”取自单场结果的
   `Results.ResDetail`。

同一份数据也可以离线导出为文档：

```powershell
node data/fetch-raw.mjs data/schedule.decoded.json
node data/fetch-results.mjs
node_modules\.bin\tsx.cmd data/build-routes.ts
```

将生成 `晋级路线.md`、`data/routes.json` 与 `data/match-results.csv`（详见 `data/README.md`）。

## 黄牌与暂停

官方数据把判罚与暂停记录在每名选手（团体赛还会记录到队伍）的 `Extensions` 里：

| 官方字段 | 含义 | 展示方式 |
| --- | --- | --- |
| `CardY` | 运动员黄牌 | 该方姓名下方黄牌徽标 |
| `Card1` / `Card2` | 运动员红牌 | 红牌徽标 |
| `CoachCardYellow` / `CoachCardRed` | 教练黄牌 / 红牌 | 同名徽标 |
| `Timeout` | 该场已使用暂停次数 | 暂停提示条与「已用暂停」 |
| `CardT` | 与暂停同步的“暂停牌”，始终等于 `Timeout` | 不单独展示 |

黄牌、红牌只要出现过就会一直显示（新出现的徽标会闪烁提示，约 15 秒）。

暂停字段只是一个“是否已经叫过暂停”的计数，因此 `server/matchManager.ts` 在计数从 0 变 1
的那一瞬间判定暂停开始，并写入快照的 `timeout`（`side` / `startedAt` / `endsAt` / `seconds`）：

1. 前端显示「某一方请求暂停」提示条，并按 `endsAt` 每秒倒计时。
2. `AG_TIMEOUT_SECONDS`（默认 60 秒）走完后提示条自动消失。
3. 暂停开始 3 秒后若重新出现得分，视为比赛已经恢复，提示条同样立即消失。
4. 换场（进入下一场单打）或整场比赛结束时立即清空。

`timeout` 是后端根据相邻两次快照推导出来的状态，因此所有打开页面的设备看到的提示一致。

## 中文名称

官方结果服务目前只提供英文名称，因此应用通过
`server/chineseNames.ts` 在本地按官方 `Reg` 编号补充中文：

1. 团队和特殊对阵优先使用 `sideNames`。
2. 双打组合由两名 `Members` 的中文姓名自动拼接。
3. 单打选手使用 `athleteNames`，可选短名使用 `athleteShortNames`。
4. 未维护的编号回退到官方英文名，不会影响比分和实时更新。

新增或更换选手时，只需在 `athleteNames` 中增加对应的官方 `Reg`
编号，不应使用英文姓名作为映射键。团队成员较多，团队名称不会展开为
成员列表。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

官方结果接口不是稳定的公开 API。若官方压缩格式、字段或 Socket.IO 协议发生变化，需要更新 `server/codec.ts`、`server/normalizer.ts` 或 `server/matchManager.ts`。该应用没有身份验证，只应部署在可信网络中。
