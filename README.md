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
npm run build:edgeone
```

`test:server` 包含 PostgreSQL 集成测试，运行前需先完成迁移和种子数据。

部署环境每分钟调用以下任务，分别处理到期邀请/同角色候补递补，以及站内通知投递/失败重试：

```bash
npm run job:expire-invitations
npm run job:deliver-notifications
npm run job:advance-sessions
```

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
