# 碰个面 · AI 校园活动主理人

面向大学生的校园活动匹配与组织产品原型。现有展示场景继续保留；数学建模竞赛组队已接入独立 TypeScript 服务和 PostgreSQL，需求、候选人与匹配批次不再由前端硬编码。

## 当前功能

- 单页工作台，导航切换时仅替换右侧内容区域
- AI 匹配四步流程：表达需求、确认偏好、查看匹配、完成成局
- 摄影、电影、桌游、台球、羽毛球、乐器、舞蹈等活动入口
- 社团、校园墙和场地商家接入空间
- 品牌合作与活动商业化演示看板
- 桌面端和移动端响应式布局
- P0 手机号密码注册/登录、个人资料、可用时间和竞赛能力 API
- P0 数学建模需求发布、数据库候选筛选、可解释排序和匹配结果持久化
- P0 真实邀请、接受/拒绝/超时、候补递补、满员成局和成员状态查询
- P0 邀请响应幂等、最后名额并发保护、站内通知 outbox 与三次有限重试
- P0 成员签到、活动开始/完成结算、缺席记录与履约信用、私人评价和双向复组需求
- P0 数模活动工作台：真实邀请、候补进度、成局详情、签到、评价、复组、活动历史和站内通知，支持刷新恢复及跨账号隔离
- P0 需求取消、真实成局时间冲突过滤，以及刷新后的需求和匹配结果恢复
- P0 运营流程追踪和成局率、到场率、复组率、单位成本查询


## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm ci
docker compose up -d postgres
cp .env.example .env
# 填写 POSTGRES_PASSWORD、DATABASE_URL 和至少 32 位的 JWT_SECRET
npm run db:migrate
npm run db:seed
```

分别启动业务服务和 H5：

```bash
npm run server:dev
npm run dev
```

浏览器打开 H5 地址，通常为 `http://localhost:3000`；业务服务默认使用 `http://localhost:8787`。

本地联调账号为 `+8613800000001` 至 `+8613800000004`，统一密码 `PenggemianTest!2026`。A 为发起人，B/C 为编程和写作主选，D 为编程候补；这些账号仅由非生产环境种子脚本创建。

## 构建验证

```bash
npm run server:build
npm run test:server
npm run test:b1-schema
npm run build:edgeone
```

`test:server` 包含 PostgreSQL 集成测试，运行前需先完成迁移和种子数据。

部署环境每分钟调用以下任务，分别处理到期邀请/同角色候补递补，以及站内通知投递/失败重试：

```bash
npm run job:expire-invitations
npm run job:deliver-notifications
npm run job:advance-sessions
```

生产 API 使用 `ENABLE_SCHEDULER=true` 时会在服务进程内串行执行以上任务，默认间隔为 60 秒，不会重叠运行。

## Railway 生产部署

Railway API 服务连接仓库 `main`，并添加同一项目内的 PostgreSQL 服务。仓库根目录的 `railway.json` 会执行：

- 构建：`npm run server:build`
- 上线前迁移：`npm run db:migrate`
- 启动：`npm run server:start`
- 健康检查：`/health`

API 服务变量：

```text
APP_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<至少 32 位随机密钥>
CORS_ORIGIN=https://penggemian.com
ENABLE_SCHEDULER=true
SCHEDULER_INTERVAL_MS=60000
```

迁移 `0003_bootstrap_cuc_school.sql` 只初始化真实学校“中国传媒大学”，注册代码为 `CUC`；生产环境禁止执行 `npm run db:seed`。Railway 生成公网域名后，在 EdgeOne 生产环境设置 `VITE_API_BASE_URL=https://<API 域名>` 并重新部署前端。

B2/B3 API 包括：`GET /api/v1/me/invitations`、
`GET /api/v1/invitations/:invitationId`、
`POST /api/v1/invitations/:invitationId/respond`、
`GET /api/v1/me/sessions`、`GET /api/v1/sessions/:sessionId`、
`GET /api/v1/me/notifications` 和 `POST /api/v1/me/notifications/:notificationId/read`。

邀请接受/拒绝必须携带最长 128 字符的 `Idempotency-Key` 请求头。相同用户、接口、幂等键和请求体会返回第一次结果并设置 `Idempotency-Replayed: true`；相同幂等键用于不同请求体返回 `409 IDEMPOTENCY_KEY_REUSED`。邀请默认 24 小时有效，但不会晚于需求的报名截止时间。

B4 履约 API（全部位于 `/api/v1/sessions/:sessionId`）：

- `GET /checkins`：签到资格、开放/截止/迟到时间和签到汇总。
- `POST /checkins`：请求体 `{}`，服务端确定用户、时间和签到结果。
- `POST /reviews`：`{ revieweeUserId, rating, tags?, comment? }`；`GET /reviews` 只读取本人提交的评价。
- `POST /regroup-intents`：`{ willingUserIds }`；`GET /regroup-intents` 只读取本人的选择、状态及双方互选的成员 ID。
- `POST /regroup`：`{ startsAt, endsAt, applicationDeadline }`，双方有意愿后创建 `source_session_id` 关联的新需求；不会自动确认成员。

以上 POST 接口均要求 JSON 和 `Idempotency-Key`。签到窗口暂定开始前 30 分钟至结束前，开始后超过 15 分钟记为迟到（契约未指定分钟数，集中于 `server/src/fulfillment/rules.ts`）。评价、复组仅允许已完成活动的已到场成员。结算任务将签到成员记为 `COMPLETED`，未签到的确认成员记为 `NO_SHOW`/`ABSENT`；退出和取消不产生缺席扣分。签到信用 +2、缺席 -10，限制在 0～100，并写入审计事件；评价不影响信用或匹配分数。

完成迁移和 seed 后可单独验收 B4：

```bash
npm run test:b4
npm run test:b4-integration
```

完整交付映射与未冻结规则见 `docs/b4-delivery.md`。

## B5 H5 真实业务工作台

点击导航“数模活动”，或打开 `/?p0=1`，登录自己的账号即可回应真实邀请。候补账号在“候补进度”查看排队/递补/终态；已接受成员在“我的成局”进入签到、私人评价和双向复组。历史读取服务端已完成/已取消活动；“我的需求”可回读持久化匹配结果及触发新复组需求的匹配。刷新后重新验证 `/me` 并回读业务状态；URL 只记录选中的页面和活动 ID，浏览器不缓存业务事实。

前台每 5 秒轮询，后台每 60 秒，重新激活立即查询。签到及活动完成仍依赖服务端时间和结算任务，不提供模拟签到时间或替他人响应的页面按钮。

```bash
npm run typecheck:h5
npm run test:b5
npm run test:b1-schema
npm run test:b3-schema
npm run test
```

双手机联调必须在构建前把 `VITE_API_BASE_URL` 设置为两台手机可访问的 HTTPS 业务服务地址，并配置 `CORS_ORIGIN` 为 H5 来源；手机上的 `localhost` 指向手机自己。生产可设置 `VITE_API_BASE_URL=/` 并通过同域网关把 `/api/v1` 转发到业务服务。迁移和 seed 沿用统一流程，B5 不新增 migration。

隔离数据库浏览器冒烟命令、六项交付映射和验证边界见 `docs/b5-delivery.md`。

运营账号使用 `GET /api/v1/ops/flows` 查询流程列表，使用
`GET /api/v1/ops/flows/:requestId` 还原单条需求的匹配、邀请、成局、通知和事件轨迹，
使用 `GET /api/v1/ops/metrics?from=...&to=...` 查询四项冻结指标。普通用户不能访问这些接口。

## B6 运营工作台

登录一次后，OPS/ADMIN 可点击“运营”或访问 `/?view=ops`。接入 A5 的流程列表、详情和四项指标，支持学校、数模场景、渠道、需求状态、数据范围和北京时间区间筛选。邀请、回应、成局、签到和异常记录按当前需求游标页展示，可追溯完整状态事件及通知尝试。指标始终只统计 REAL，不受 TEST/DEMO 列表切换影响。

`GET /api/v1/ops/flows` 默认 20、最大 100，使用 `cursor`/返回的 `pagination.nextCursor` 分页；保留 A 旧客户端的 offset 兼容，但不可与 cursor 混用。详情包含活动级和需求级时间/成本记录。B4/B5 页面已适配 A 的全局认证，不再提供独立登录入口。

`POST /api/v1/ops/actions` 仅允许运营/管理员，要求 JSON 和 Idempotency-Key：

- 人工时间：`{ actionType: "LOG_WORK", requestId, sessionId?, reason, minutesSpent }`，整数分钟 1～1440。
- 实际成本：`{ actionType: "RECORD_COST", requestId, sessionId?, reason, costType, amountCents, incurredAt }`，非负整数分，CNY。

记录只追加，并写业务审计事件；用户和学校由服务端判断。该接口不提供强制修改业务状态的操作。OPS 限本校，ADMIN 可显式选择学校；使用已有、经管理员授权的账号，不开放前端注册运营角色。

```bash
npm run test:b6
npm run test:b6-integration
npm run lint
```

`test:server` 以文件级串行运行，防止共享种子库的角色/学校/信用临时变更干扰其他测试；测试内部的并发抢位和重复点击仍并行执行。仅使用独占隔离 TEST 数据库。`test:b6-browser` 沿用 B5 浏览器脚本的环境配置，同时验证全局认证及运营写入/刷新恢复。完整交接和验收说明见 `docs/b6-delivery.md`。

## 发布与回滚

B7 一键工程/接口/数据库回归：准备独占隔离 TEST 数据库并 migrate/seed，设置 `B7_ISOLATED_DB=1` 后运行 `npm run test:b7`；安装外部 Playwright/Edge 后运行 `npm run test:b7-browser`。浏览器模式自动启动并关闭本机临时 API/H5，覆盖真实接受、拒绝、超时递补、并发、重复操作、履约和运营回读。报告与截图写入已忽略的 `.artifacts/b7`，失败退出非零并停止后续阶段。完整命令、场景矩阵、失败复现及实体手机验收边界见 `docs/b7-delivery.md`。

- 发布前依次执行 migration、seed（仅非生产环境）、服务端测试和 EdgeOne 构建。
- migration 按编号向前执行，不在生产库手工删除表或回写旧 migration。
- 数据库变更前创建备份；需要回滚时先确认旧服务兼容当前 Schema，再回退服务版本。
- 如果 Schema 不向后兼容，使用发布前备份恢复数据库，不使用临时 SQL 猜测性回滚。

## 交接说明

- 主要页面：`app/page.tsx`
- 全局样式：`app/globals.css`
- 页面元数据：`app/layout.tsx`
- 构建配置：`vite.config.ts`
- P0 契约：`docs/contract-v0.1.md`
- 数据库表：`server/src/db/schema/`
- 迁移：`server/drizzle/`
- API 路由：`server/src/routes/`
- 匹配规则：`server/src/matching/`
- `.openai/hosting.json` 未绑定任何线上项目，可由新托管环境重新配置

上传 GitHub 前请继续保持 `.env*`、`node_modules`、构建缓存和任何本地凭证不进入版本库。
