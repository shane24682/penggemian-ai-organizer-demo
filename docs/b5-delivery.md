# B5 H5 真实业务状态接入交付

日期：2026-09-17。分支：`feature/b-workflow`。依据：`contract-v0.1` 与双人分工清单 B5，沿用 A 的身份/需求/匹配和 B1—B4 的统一数据库及业务接口；不修改契约、Schema 或 migration。

集成更新：B6 合并 A 的 a707b8b 后，业务页面读取全局 AuthProvider，不再维护内嵌登录/退出；原本的独立工作台登录描述与四项旧 lint 问题属于 B5 初次交付历史，当前版本和验证结果见 b6-delivery.md。

## 六项任务映射

| 交付项 | 实现与数据来源 |
|---|---|
| 真实邀请列表与响应 | “我的邀请”读取 `/me/invitations`，仅 PENDING 显示接受/拒绝；POST `/invitations/:id/respond`，当前用户由 JWT 决定 |
| 候补状态 | “候补进度”展示 BACKUP 的 QUEUED、递补后的 PENDING、EXPIRED 和 CANCELLED 等终态，不在前端模拟递补 |
| 成局成员与一致状态 | `/me/sessions` 列表及 `/sessions/:id` 详情，成员、人数和状态全部由服务端提供 |
| 签到、评价、复组 | 接入 checkins、reviews、regroup-intents、regroup 的真实 GET/POST；读取本人评价和选择；双方互选后创建带 source_session_id 的新需求，不自动接受 |
| 刷新恢复 | 启动和重新登录先读取 `/me`，再恢复列表和 URL 中选中的活动；历史读 `/me/sessions`，只展示 COMPLETED/CANCELLED |
| 加载、空态、失败 | 加载提示、各列表空态、业务错误码/requestId、网络超时与重新读取；失败不伪造成功，旧快照明确标记并禁用写入 |

## 实现位置与契约覆盖

- `components/P0WorkflowPanel.tsx` 和对应 CSS：移动端真实工作台，独立账号登录、邀请、候补、成局、履约、需求回读和通知已读。
- `lib/p0-workflow.ts`：API 快照、状态标签、幂等重试键及轮询。前台 5 秒、后台 60 秒、激活立即回读；不重叠轮询，卸载取消请求。手动回读与自动回读通过序号避免旧响应覆盖。
- `lib/p0-api.ts`：JSON/Bearer/Idempotency-Key、禁用 fetch 缓存、10 秒超时与明确网络/上游格式错误；默认本地端口对齐业务服务 8787。
- Workspace 导航新增“数模活动”，通知铃进入真实工作台，数模匹配结果提供真实活动入口；历史入口优先展示 PostgreSQL 历史。非 P0 历史保留在明确标记的折叠演示区域，排除数模，不写入真实接口。
- 浏览器仅保存登录 JWT 和未确认请求的幂等重试键；不保存邀请/成局/签到结果或私人评价正文。URL 仅含页面/活动 ID，服务端仍校验访问权限。切换账号清空快照，旧账号响应不得覆盖新身份。
- 时间展示及复组启动会输入使用北京时间（Asia/Shanghai）；提交 UTC ISO 时间。资格、最终状态及所有并发限制由服务端决定。
- 继承 B4 暂定的签到分钟窗口与完成后已到场成员可评价/复组规则；这些未冻结细节见 `b4-delivery.md`，B5 未另行改动业务口径。

## 已执行验证

- B5 前端单元测试 8/8：真实请求头、失败提示、快照来源、重试键隔离、候补展示和轮询取消/频率。
- 服务端测试 41/41（包含 PostgreSQL 集成、并发、通知和 B4 履约），B1 Schema 10/10、B3 Schema 2/2。
- H5 独立类型检查、服务端编译、EdgeOne 构建通过；SSR 构建及现有渲染测试 7/7。
- 本次新增/修改的 B5 TypeScript/TSX 与测试文件定向 lint 通过；`git diff --check` 通过。
- 全仓 lint 仍有四项与 B5 无关的既有错误：`capture.cjs` 两处 require、`components/ActivityRoom.tsx:96` 非原生交互、`lib/calendar.ts:46` 转义。未修改这些文件，不宣称全仓 lint 已通过。

浏览器冒烟在独立 PostgreSQL 测试库、真实业务 API 和生产等价 H5 上使用三个独立浏览器会话执行，B/D 为 390px 移动视口、C 为桌面视口：

1. B 拒绝 → D 自动从排队递补 → C/D 接受。
2. 第二条需求 B/C 接受 → D 排队结束 → B 刷新恢复同一 sessionId。
3. B/C 签到、服务端结算、B 私人评价、B/C 双向意愿、B 创建复组，数据库核对 source_session_id。
4. 历史和评价刷新恢复；断网显示读取失败，重新读取恢复；移动视口无横向溢出、无浏览器运行时异常。
5. B 退出后登录 C，重新读取身份及详情，不显示 B 的私人评价。

测试中仅为缩短等待，在隔离库调整测试活动时间并调用真实结算任务；正式页面没有这些强制转换能力。发现并修复了原生浏览器 clearTimeout 调用绑定导致轮询停止的问题。

## 浏览器脚本复跑

先准备独立 TEST 数据库、迁移和 seed，启动业务服务（默认 8787、CORS_ORIGIN=http://localhost:4173），构建并启动 H5：

```bash
npm run build:edgeone
node node_modules/vite/bin/vite.js preview --config vite.edgeone.config.ts --host 127.0.0.1 --port 4173
```

另一个 PowerShell 终端设置测试环境后执行：

```powershell
$env:APP_ENV='test'
$env:DATABASE_URL='<独立测试库连接串>'
$env:B5_TEST_DB_ALLOW_WRITES='1'
$env:P0_PLAYWRIGHT_PATH='<已安装 Playwright 的 index.mjs 绝对路径>'
npm run test:b5-browser
```

脚本默认使用已安装的 Microsoft Edge；可通过 B5_BROWSER_CHANNEL、B5_API_URL、B5_H5_URL 调整浏览器与地址，B5_SCREENSHOT_DIR 可指定截图目录。Playwright 是可选外部测试工具，本次安装于临时目录，未增加仓库依赖。脚本会创建测试事实并清理自身测试请求相关记录、恢复种子用户信用，仅用于独占隔离库，不得对生产库或多人共享数据库运行。

## 部署与验收边界

已完成 B5 六项代码交付及本地真实 API/数据库浏览器验证；尚未执行实体双手机与线上部署验收。手机必须连接同一可访问业务服务，构建时配置 HTTPS 的 VITE_API_BASE_URL 与正确 CORS_ORIGIN，不能沿用 localhost。部署仍需每分钟运行邀请超时、通知投递和活动推进三个任务。

B6 运营列表及 A5 聚合指标不属于 B5，本次未宣称完成。提交和推送按负责人单独指令执行，B5 的完整链路依赖此前 B4 履约后端。
