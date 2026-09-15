# 碰个面 MVP 开发契约 contract v0.1

> 状态：已确认
> 契约负责人：Floyd
> 技术评审：算法组合作成员
> 适用时间：2026 年 9 月 15 日至 9 月 21 日
> 适用系统：EdgeOne H5 + TypeScript 业务服务 + PostgreSQL + Drizzle

## 1. 契约目的

本契约是两人并行开发的唯一技术口径。目标不是继续完善单浏览器 Demo，而是让两个真实账号通过同一业务服务器和 PostgreSQL 完成真实组队。

验收主链路：

`A 发布需求 → 系统匹配真实用户 → B 收到邀请 → B 接受或拒绝 → 候补递补 → 成局 → 签到 → 评价 → 复组`

以下任一情况均不算完成：

- 候选人来自前端 `demoCandidates`。
- 邀请、成局或签到只保存在 React State、LocalStorage 或当前浏览器。
- 使用按钮模拟另一位用户回应。
- 两个账号读取到不同的活动状态。
- 页面刷新或重新登录后数据消失。

## 2. 冻结范围

### 2.1 P0 业务场景

- 唯一主场景：大学生竞赛组队。
- 首个原子场景：数学建模竞赛组队。
- 首期角色：`MODELING` 建模、`CODING` 编程、`WRITING` 写作、`OPEN` 灵活补位。
- 默认队伍人数：3 人，包含发起人。
- 一个需求可以发布一个或多个角色空位。
- 本轮签到指团队第一次约定的线下或线上启动会签到。

### 2.2 P0 功能

- 手机号和密码注册、登录。
- 学校、个人资料、可用时间和竞赛能力资料。
- 发布竞赛组队需求及角色空位。
- 从数据库读取真实候选人并匹配。
- 保存匹配批次、主选、候补、分数和理由。
- 邀请、接受、拒绝、超时和候补递补。
- 成局、成员状态、签到、评价和复组。
- H5 站内通知和活动状态轮询。
- 运营流程查询、状态审计和四项核心指标。

### 2.3 本轮不做

- 原生 App、小程序、完整好友系统、MBTI 和站内自由聊天。
- 羽毛球、游戏、学习搭子等第二场景的专属字段和页面。
- 复杂机器学习模型、在线训练和个性化大模型推荐。
- 短信、微信服务通知、WebSocket 和推送服务商接入。
- 会员、支付、退款、场地订单和多级结算。

现有 Demo 中与本契约无关的页面可以保留展示，但不得写入 P0 真实业务数据或进入指标。

## 3. 系统边界

### 3.1 技术结构

```text
EdgeOne H5
    ↓ HTTPS REST JSON
独立 TypeScript 业务服务 Node.js 22+
    ↓ Drizzle ORM
PostgreSQL
```

- H5 不得直接连接 PostgreSQL。
- `worker/index.ts` 中的 D1 绑定不作为 P0 业务事实源。
- PostgreSQL 是用户、需求、匹配、邀请、成局和履约状态的唯一事实源。
- 业务规则、权限、并发和幂等均由业务服务执行，前端只负责提交操作和展示结果。

### 3.2 环境变量

业务服务至少使用：

```text
APP_ENV=development|test|production
PORT=
DATABASE_URL=
JWT_SECRET=
CORS_ORIGIN=
```

H5 至少使用：

```text
VITE_API_BASE_URL=
```

- 开发、测试和生产使用不同数据库。
- `.env` 不提交 Git，`.env.example` 只写字段名和说明。
- 服务启动时必须检查必需环境变量，缺少时直接失败。

## 4. 通用数据约定

- 数据库命名使用 `snake_case`，API JSON 使用 `camelCase`。
- 主键统一为 PostgreSQL `uuid`。
- 时间统一使用 `timestamptz`，服务端保存 UTC，H5 按 `Asia/Shanghai` 展示。
- 金额使用整数分 `amount_cents`，不得使用浮点金额。
- 所有业务表至少包含 `created_at`；可修改表同时包含 `updated_at`。
- 状态字段使用受控枚举，不保存自由文本状态。
- 历史事件只追加，不覆盖或物理删除。
- `users` 和 `requests` 采用软删除；邀请、成局、签到和事件记录不物理删除。
- 正式、测试和演示数据通过不同数据库隔离；`requests.data_scope` 额外标记 `REAL`、`TEST` 或 `DEMO`。
- `REAL` 之外的数据不得进入正式指标。

## 5. 数据库契约

### 5.1 身份与资料

#### `schools`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid | 主键 |
| `code` | varchar(64) | 唯一、不可变 |
| `name` | varchar(128) | 唯一、必填 |
| `status` | enum | `ACTIVE`、`DISABLED` |
| `created_at` | timestamptz | 必填 |
| `updated_at` | timestamptz | 必填 |

#### `users`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid | 主键 |
| `school_id` | uuid | 外键 `schools.id`、必填 |
| `phone_e164` | varchar(32) | 全局唯一、仅本人和运营可见 |
| `password_hash` | text | Node `scrypt` 哈希，不保存明文 |
| `role` | enum | `USER`、`OPS`、`ADMIN` |
| `status` | enum | `ACTIVE`、`SUSPENDED`、`DELETED` |
| `created_at` | timestamptz | 必填 |
| `updated_at` | timestamptz | 必填 |
| `deleted_at` | timestamptz | 可空 |

#### `user_profiles`

| 字段 | 类型 | 规则 |
|---|---|---|
| `user_id` | uuid | 主键、外键 `users.id` |
| `display_name` | varchar(64) | 必填 |
| `avatar_url` | text | 可空 |
| `major_category` | varchar(64) | 必填 |
| `grade_year` | smallint | 1 至 8 |
| `bio` | varchar(500) | 可空 |
| `competition_tags` | jsonb | 字符串数组 |
| `weekly_hours` | smallint | 0 至 80 |
| `trust_score` | smallint | 0 至 100，冷启动默认 80 |
| `created_at` | timestamptz | 必填 |
| `updated_at` | timestamptz | 必填 |

#### `user_availability`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid | 主键 |
| `user_id` | uuid | 外键 `users.id` |
| `starts_at` | timestamptz | 必填 |
| `ends_at` | timestamptz | 必须晚于 `starts_at` |
| `created_at` | timestamptz | 必填 |

#### `user_capabilities`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid | 主键 |
| `user_id` | uuid | 外键 `users.id` |
| `role_code` | enum | `MODELING`、`CODING`、`WRITING`、`OPEN` |
| `level` | smallint | 1 至 5 |
| `summary` | varchar(300) | 可空 |
| `verification_status` | enum | `UNVERIFIED`、`PENDING`、`VERIFIED`、`REJECTED` |
| `created_at` | timestamptz | 必填 |
| `updated_at` | timestamptz | 必填 |

同一用户同一 `role_code` 只能存在一条有效能力记录。

#### `verification_records`

保存学校身份或能力证明的审核记录。原始证明地址只允许本人和运营访问，匹配结果只返回审核状态。

核心字段：`id`、`user_id`、`capability_id`、`verification_type`、`evidence_url`、`status`、`reviewer_user_id`、`reviewed_at`、`created_at`。

### 5.2 需求与匹配

#### `requests`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid | 主键 |
| `school_id` | uuid | 外键 `schools.id` |
| `creator_user_id` | uuid | 外键 `users.id` |
| `scene_code` | enum | P0 固定为 `MATH_MODELING` |
| `competition_name` | varchar(128) | 必填 |
| `title` | varchar(100) | 必填 |
| `description` | varchar(1000) | 可空 |
| `starts_at` | timestamptz | 首次启动会开始时间 |
| `ends_at` | timestamptz | 首次启动会结束时间 |
| `weekly_hours_required` | smallint | 0 至 80 |
| `participant_limit` | smallint | 2 至 3，默认 3，包含发起人 |
| `application_deadline` | timestamptz | 不晚于 `starts_at` |
| `status` | enum | 见第 6 节 |
| `source_channel` | varchar(64) | 例如 `DIRECT`、`CAMPUS_WALL` |
| `source_session_id` | uuid | 复组产生时指向原 `sessions.id`，否则为空 |
| `data_scope` | enum | `REAL`、`TEST`、`DEMO` |
| `created_at` | timestamptz | 必填 |
| `updated_at` | timestamptz | 必填 |
| `deleted_at` | timestamptz | 可空 |

#### `request_role_slots`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | uuid | 主键 |
| `request_id` | uuid | 外键 `requests.id` |
| `role_code` | enum | 四种 P0 角色之一 |
| `slot_count` | smallint | 1 至 2 |
| `min_level` | smallint | 1 至 5 |
| `evidence_required` | boolean | 默认 `false` |
| `created_at` | timestamptz | 必填 |

同一需求必须满足 `1 + SUM(slot_count) = participant_limit`，其中 `1` 代表发起人。同一需求同一角色只保留一行。

#### `match_runs`

核心字段：

`id`、`request_id`、`contract_version`、`algorithm_version`、`status`、`parameters_json`、`candidate_count`、`is_current`、`started_at`、`finished_at`、`error_code`、`error_detail`、`created_at`。

- 每次执行均新增记录，不覆盖历史运行。
- 同一需求最多只有一个 `is_current=true` 的成功运行。
- `status`：`RUNNING`、`SUCCEEDED`、`FAILED`。

#### `match_candidates`

核心字段：

`id`、`match_run_id`、`request_id`、`user_id`、`role_slot_id`、`rank`、`candidate_type`、`score`、`breakdown_json`、`reasons_json`、`candidate_status`、`created_at`。

- `candidate_type`：`PRIMARY`、`BACKUP`。
- `candidate_status`：`RANKED`、`INVITED`、`ACCEPTED`、`DECLINED`、`EXPIRED`、`SKIPPED`。
- 同一 `match_run_id + user_id` 唯一。
- `score` 范围为 0 至 100。

### 5.3 邀请与成局

#### `sessions`

核心字段：

`id`、`request_id`、`school_id`、`status`、`starts_at`、`ends_at`、`created_at`、`updated_at`。

- `request_id` 唯一，一条需求最多产生一个局。
- 匹配成功并创建首轮邀请时，创建 `FORMING` 状态的真实局。

#### `session_members`

核心字段：

`id`、`session_id`、`user_id`、`role_slot_id`、`member_type`、`member_status`、`joined_at`、`updated_at`。

- `member_type`：`HOST`、`PARTICIPANT`。
- `member_status`：`CONFIRMED`、`WITHDRAWN`、`COMPLETED`、`NO_SHOW`。
- 同一 `session_id + user_id` 唯一。
- 创建 `FORMING` 局时先写入发起人，状态为 `CONFIRMED`。

#### `invitations`

核心字段：

`id`、`request_id`、`session_id`、`match_candidate_id`、`invitee_user_id`、`role_slot_id`、`status`、`queue_position`、`sent_at`、`expires_at`、`responded_at`、`created_at`、`updated_at`。

- 同一需求、被邀请人和角色空位只允许一条有效邀请。
- 候补也写入邀请表，初始状态为 `QUEUED`，被递补时转为 `PENDING`。

#### `status_events`

核心字段：

`id`、`aggregate_type`、`aggregate_id`、`event_type`、`actor_user_id`、`from_status`、`to_status`、`payload_json`、`idempotency_key`、`created_at`。

- 只追加，不更新和删除。
- 系统超时操作的 `actor_user_id` 为空，`payload_json.actorType=SYSTEM`。

### 5.4 履约、通知与运营

#### `checkins`

核心字段：`id`、`session_id`、`user_id`、`status`、`method`、`checked_in_at`、`created_at`。

- `status`：`PRESENT`、`LATE`、`ABSENT`。
- `method`：P0 固定为 `SELF_CONFIRM`，由服务端校验成员身份和签到时间窗口。
- 同一 `session_id + user_id` 唯一。

#### `reviews`

核心字段：`id`、`session_id`、`reviewer_user_id`、`reviewee_user_id`、`rating`、`tags_json`、`comment`、`created_at`。

- `rating` 为 1 至 5。
- 同一局内，同一评价人对同一成员只能评价一次。
- P0 评价不直接进入匹配分数。

#### `regroup_intents`

核心字段：`id`、`session_id`、`user_id`、`willing_user_ids_json`、`status`、`created_at`、`updated_at`。

- 同一 `session_id + user_id` 唯一。
- `status`：`OPEN`、`MATCHED`、`CLOSED`。
- 双方表达意愿后，可由任一成员创建新 `requests`，并填写 `source_session_id`。

#### `notification_outbox`

核心字段：`id`、`recipient_user_id`、`channel`、`template_code`、`aggregate_type`、`aggregate_id`、`payload_json`、`status`、`attempt_count`、`available_at`、`sent_at`、`read_at`、`idempotency_key`、`last_error`、`created_at`、`updated_at`。

- P0 `channel` 固定为 `IN_APP`。
- `status`：`QUEUED`、`PROCESSING`、`SENT`、`FAILED`、`DEAD`。
- `idempotency_key` 唯一，防止同一事件重复通知。

#### `delivery_attempts`

每次通知尝试都新增一行，核心字段：`id`、`outbox_id`、`attempt_no`、`status`、`started_at`、`finished_at`、`error_code`、`error_detail`。

#### `domain_events`

核心字段：`id`、`school_id`、`actor_user_id`、`event_type`、`aggregate_type`、`aggregate_id`、`request_id`、`session_id`、`data_scope`、`payload_json`、`dedupe_key`、`occurred_at`。

#### `ops_work_logs`

核心字段：`id`、`ops_user_id`、`request_id`、`session_id`、`action_type`、`minutes_spent`、`note`、`created_at`。

#### `cost_items`

核心字段：`id`、`school_id`、`request_id`、`session_id`、`cost_type`、`amount_cents`、`currency`、`note`、`incurred_at`、`created_at`。

`currency` P0 固定为 `CNY`。

#### `operator_actions`

运营人员修改业务状态时必须新增审计记录。核心字段：`id`、`operator_user_id`、`aggregate_type`、`aggregate_id`、`action_type`、`reason`、`before_json`、`after_json`、`created_at`。

#### `idempotency_records`

核心字段：`id`、`user_id`、`route_key`、`idempotency_key`、`request_hash`、`response_status`、`response_json`、`expires_at`、`created_at`。

同一 `user_id + route_key + idempotency_key` 唯一。

### 5.5 必要索引

- `requests(school_id, status, created_at desc)`。
- `user_availability(starts_at, ends_at)` 和 `user_availability(user_id)`。
- `user_capabilities(role_code, level, verification_status)`。
- `match_candidates(match_run_id, rank)`。
- `invitations(invitee_user_id, status, created_at desc)`。
- `invitations(status, expires_at)`。
- `session_members(user_id, member_status)`。
- `notification_outbox(status, available_at)`。
- `domain_events(school_id, event_type, occurred_at)`。

## 6. 状态机契约

### 6.1 需求 `requests.status`

```text
DRAFT → OPEN → MATCHING → INVITING → FULFILLED
           ↑        ↓
           └────────┘  匹配失败或候选不足后返回 OPEN

DRAFT | OPEN | MATCHING | INVITING → CANCELLED
OPEN | INVITING → EXPIRED
```

- `FULFILLED` 表示对应 `sessions` 已达到目标人数并变为 `CONFIRMED`。
- 只有创建者可以取消，运营可以带原因强制取消。
- `FULFILLED` 后不得再次匹配。

### 6.2 邀请 `invitations.status`

```text
QUEUED → PENDING → ACCEPTED
                 → DECLINED
                 → EXPIRED
QUEUED | PENDING → CANCELLED
```

- 只有 `PENDING` 可以由被邀请人接受或拒绝。
- 任何终态不得再次转换。
- `DECLINED` 或 `EXPIRED` 后立即递补同角色下一名 `QUEUED` 候选人。

### 6.3 成局 `sessions.status`

```text
FORMING → CONFIRMED → IN_PROGRESS → COMPLETED
FORMING | CONFIRMED → CANCELLED
```

- 首轮邀请创建时生成 `FORMING` 局。
- 所有角色空位满足后转为 `CONFIRMED`，并将请求转为 `FULFILLED`。
- 到达 `starts_at` 后由定时任务或运营转为 `IN_PROGRESS`。
- 到达 `ends_at` 后允许转为 `COMPLETED`。

### 6.4 成员 `session_members.member_status`

```text
CONFIRMED → COMPLETED
CONFIRMED → WITHDRAWN
CONFIRMED → NO_SHOW
```

- 已接受邀请的成员写入 `CONFIRMED`。
- 有 `PRESENT` 或 `LATE` 签到的成员在活动完成时转为 `COMPLETED`。
- 未签到成员转为 `NO_SHOW`。

## 7. 身份和权限契约

### 7.1 登录

- P0 使用手机号和密码。
- 密码使用 Node `scrypt` 加随机盐哈希。
- 登录成功返回签名 JWT，载荷只包含 `sub`、`schoolId`、`role`、`iat` 和 `exp`。
- JWT 有效期 7 天，H5 使用 `Authorization: Bearer <token>`。
- API 不信任前端传入的 `userId`；当前用户始终从 JWT 读取。

### 7.2 权限

| 操作 | USER | OPS | ADMIN |
|---|---:|---:|---:|
| 查看和修改本人资料 | 是 | 是 | 是 |
| 发布及取消本人需求 | 是 | 是 | 是 |
| 查看本人收到的邀请 | 是 | 是 | 是 |
| 回应他人的邀请 | 仅本人邀请 | 否 | 否 |
| 查看成局详情 | 仅本局成员 | 同校 | 全部 |
| 查看候选证明原件 | 否 | 同校审核需要 | 是 |
| 强制修改业务状态 | 否 | 同校且写审计 | 是且写审计 |
| 查看手机号 | 仅本人 | 同校业务需要 | 是 |

- 发起人在成局前只能看到候选人的公开资料、能力审核状态和推荐理由。
- 未确认成员不得看到其他候选人的联系方式或证明原件。
- 普通用户不得查看他人的私人邀请、评价和复组选择。

## 8. API 契约

### 8.1 通用格式

成功：

```json
{
  "data": {},
  "meta": { "requestId": "uuid" }
}
```

失败：

```json
{
  "error": {
    "code": "INVITATION_NOT_PENDING",
    "message": "该邀请已处理",
    "details": {}
  },
  "meta": { "requestId": "uuid" }
}
```

- 所有写接口要求 `Content-Type: application/json`。
- 接受邀请、拒绝、签到、评价、复组和运营操作必须携带 `Idempotency-Key`。
- 相同幂等键和相同请求体返回第一次结果；相同幂等键但不同请求体返回 `409 IDEMPOTENCY_KEY_REUSED`。
- 列表默认 `limit=20`，最大 100，使用 `cursor` 翻页。

### 8.2 状态码

| HTTP | 使用场景 |
|---:|---|
| 200 | 查询或幂等重复操作成功 |
| 201 | 创建成功 |
| 400 | 字段格式错误 |
| 401 | 未登录或凭证失效 |
| 403 | 无权限 |
| 404 | 资源不存在或当前用户不可见 |
| 409 | 状态冲突、名额已满、重复资源、幂等冲突 |
| 422 | 字段合法但不满足业务规则 |
| 500 | 未预期服务错误，必须记录 `requestId` |

### 8.3 端点清单

#### 身份与资料

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/register` | 手机号、密码、学校、显示名注册 |
| POST | `/api/v1/auth/login` | 登录并返回 JWT |
| GET | `/api/v1/me` | 当前用户 |
| GET | `/api/v1/me/profile` | 当前资料、可用时间和能力 |
| PUT | `/api/v1/me/profile` | 更新基础资料 |
| PUT | `/api/v1/me/availability` | 全量替换可用时间 |
| PUT | `/api/v1/me/capabilities` | 全量替换竞赛能力 |

#### 需求与匹配

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/requests` | 创建并发布需求，状态为 `OPEN` |
| GET | `/api/v1/requests/:requestId` | 创建者或关联成员查看需求 |
| GET | `/api/v1/me/requests` | 当前用户发布的需求 |
| POST | `/api/v1/requests/:requestId/match` | 创建者触发一次同步匹配 |
| GET | `/api/v1/requests/:requestId/matches/current` | 创建者查询当前匹配结果 |
| POST | `/api/v1/requests/:requestId/cancel` | 创建者取消需求 |

`POST /match` 找到至少一名主选时，必须在一个业务事务中完成：

1. 保存 `match_runs` 和 `match_candidates`。
2. 创建或读取唯一 `FORMING` 局。
3. 写入发起人成员。
4. 为主选创建 `PENDING` 邀请，为候补创建 `QUEUED` 邀请。
5. 写入 `notification_outbox` 和 `domain_events`。

没有主选时，只保存匹配运行及空结果，不创建 `sessions` 或 `invitations`，并将请求恢复为 `OPEN`。

#### 邀请与成局

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/me/invitations` | 查询本人邀请，支持状态筛选 |
| GET | `/api/v1/invitations/:invitationId` | 仅被邀请人查看 |
| POST | `/api/v1/invitations/:invitationId/respond` | `action=ACCEPT` 或 `DECLINE` |
| GET | `/api/v1/me/sessions` | 当前用户参与的局 |
| GET | `/api/v1/sessions/:sessionId` | 仅成员或运营查看最新状态 |
| POST | `/api/v1/sessions/:sessionId/cancel` | 发起人或运营取消 |

#### 履约

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/sessions/:sessionId/checkins` | 当前成员签到 |
| GET | `/api/v1/sessions/:sessionId/checkins` | 成员查看签到汇总 |
| POST | `/api/v1/sessions/:sessionId/reviews` | 当前成员提交评价 |
| POST | `/api/v1/sessions/:sessionId/regroup-intents` | 当前成员提交复组意愿 |
| POST | `/api/v1/sessions/:sessionId/regroup` | 根据已匹配意愿创建新需求 |

#### 通知与运营

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/me/notifications` | 当前用户站内通知 |
| POST | `/api/v1/me/notifications/:id/read` | 标记已读 |
| GET | `/api/v1/ops/flows` | 需求至履约全过程列表 |
| GET | `/api/v1/ops/flows/:requestId` | 单条需求完整轨迹 |
| GET | `/api/v1/ops/metrics` | 四项核心指标 |
| POST | `/api/v1/ops/actions` | 人工处理并记录审计 |

## 9. 匹配算法契约 algorithm v0.1

### 9.1 算法定位

- 本轮使用确定性规则排序，不训练模型。
- 算法输入来自数据库，不从页面 Demo 数组读取。
- 算法只决定候选顺序，不替用户接受邀请。
- 正式版本号固定为 `match-rules-v0.1`。

### 9.2 硬筛选

候选人必须同时满足：

1. `users.status=ACTIVE`。
2. 与需求属于同一 `school_id`。
3. 不是需求发起人。
4. 至少一个可用时间段与启动会时间重合 50% 以上。
5. 拥有目标 `role_code`；目标为 `OPEN` 时任一竞赛能力均可。
6. `capability.level >= request_role_slots.min_level`。
7. 当 `evidence_required=true` 时，能力状态必须为 `VERIFIED`。
8. `user_profiles.weekly_hours >= requests.weekly_hours_required`。
9. 没有与启动会时间重叠的 `CONFIRMED` 或 `IN_PROGRESS` 成局。
10. 尚未在该需求中接受其他角色邀请。

不得使用性别、好友关系、MBTI、用户 ID 奇偶、手机号、精确位置或证明原件参与筛选和排序。

### 9.3 评分权重

硬筛选通过后按 100 分排序：

| 评分项 | 权重 | 计算原则 |
|---|---:|---|
| 角色与能力 | 35 | 角色相同；已验证为满拟合，未验证最高按 85% 拟合；等级越高越接近满分 |
| 时间匹配 | 25 | 按启动会时间重合比例计算，完整覆盖为满分 |
| 竞赛目标 | 20 | 同竞赛名称最高；同为数模其次；仅泛竞赛标签最低 |
| 每周投入 | 10 | `min(可投入小时/要求小时, 1)` |
| 履约信用 | 10 | `trust_score / 100`，新用户默认 80 分 |

- 总分四舍五入为整数。
- 主选最低分 60，候补最低分 50。
- 每个空位选择 1 名主选、最多 5 名候补。
- 一个用户在同一次运行中最多分配到一个角色空位。
- 分数相同依次按：履约信用降序、资料完整度降序、`user_id` 升序。

### 9.4 冷启动和无结果

- 没有履约历史的用户使用 `trust_score=80`，不因新用户身份被排除。
- 缺少必填能力、可用时间或每周投入的数据，视为未通过硬筛选。
- 某空位没有 60 分以上主选时，该空位返回 `UNFILLED`，不得用假用户补齐。
- 只有 50 至 59 分候选人时，仅作为候补展示，并提示发起人候选不足。
- 所有空位都无候选人时，匹配运行仍记为 `SUCCEEDED`，候选数为 0，请求返回 `OPEN`。

### 9.5 推荐理由

- 返回得分贡献最高的 3 项理由。
- 每条理由包含 `key`、`label`、`score`、`maxScore` 和自然语言 `detail`。
- 示例：`角色匹配：已验证的 Python 编程能力，4/5 级`。
- 不生成数据库中不存在的事实，不展示手机号、证明地址和其他候选人的私人数据。

### 9.6 履约信用更新

P0 只根据可验证行为更新信用：

- 完成签到：`+2`。
- 接受后退出：`-5`。
- 确认成员无签到且记为 `NO_SHOW`：`-10`。
- 分数限制在 0 至 100。
- 主观评价和点赞不自动改变 `trust_score`。

每次变更必须写入 `domain_events`，不得只覆盖最终分数。

## 10. 邀请、候补和通知规则

### 10.1 首轮邀请

- 每个未填角色空位同时只允许 1 条 `PENDING` 邀请。
- 主选立即转为 `PENDING`，最多 5 名候补按排名保存为 `QUEUED`。
- 邀请默认有效期 24 小时，但不得晚于 `application_deadline`。
- 首轮邀请和候补必须来自当前 `match_runs.is_current=true` 的候选人。

### 10.2 回应与递补

- 接受、检查名额、写入成员和关闭同空位其他邀请必须在一个数据库事务中完成。
- 事务锁定邀请、对应角色空位和成局记录。
- 用户重复接受返回第一次成功结果，不新增第二个成员。
- 拒绝或超时后，同一事务或紧随其后的可靠任务递补下一名候补。
- 候补转为 `PENDING` 时写入新到期时间、站内通知和状态事件。
- 无候补时保留 `FORMING`，需求回到 `OPEN`，允许发起人重新匹配。
- 所有空位满足后，将局转为 `CONFIRMED`、需求转为 `FULFILLED`，并取消剩余排队邀请。

### 10.3 超时任务

- 服务端每分钟扫描一次已过期的 `PENDING` 邀请。
- 过期状态变化和递补必须可重复执行且结果一致。
- 单条邀请超时任务失败不会阻止其他邀请处理。

### 10.4 P0 通知

- P0 通知渠道固定为 H5 站内通知。
- 邀请页和成局页每 5 秒查询一次最新状态；页面进入后台时降低频率，重新激活时立即查询。
- 通知发送失败最多尝试 3 次，间隔为立即、1 分钟、5 分钟。
- 三次失败后转为 `DEAD`，运营列表显示异常。
- 短信、微信和浏览器 Push 不属于 contract v0.1。

## 11. H5 数据来源契约

- 发布需求页调用真实 `/api/v1/requests`，不得只更新组件状态。
- 匹配页调用真实 `/match` 和 `/matches/current`，不得默认传入 `demoCandidates`。
- 邀请页读取 `/me/invitations`，不得调用 `advanceDemoInvitation` 模拟他人回应。
- 成局页读取 `/sessions/:sessionId`，成员和状态均来自服务端。
- 签到、评价和复组必须调用真实写接口。
- 历史页读取 `/me/sessions`，不得以 LocalStorage 作为事实源。
- 当前 H5 的 `study` 场景映射到 API 的 `MATH_MODELING`。
- 页面刷新、换浏览器或重新登录后必须从服务端恢复业务状态。

P0 主动刷新策略：

| 页面 | 查询接口 | 频率 |
|---|---|---:|
| 我的邀请 | `/me/invitations` | 5 秒 |
| 匹配进度 | `/requests/:id/matches/current` | 5 秒 |
| 成局详情 | `/sessions/:id` | 5 秒 |
| 历史和运营列表 | 对应列表接口 | 用户操作时刷新 |

## 12. 核心指标口径

统计只使用 `data_scope=REAL`，并同时输出分子、分母、学校、场景、渠道和时间范围。

### 12.1 成局率

```text
观察期内发布后 72 小时内变为 FULFILLED 的需求数
÷
观察期内进入 OPEN 的真实需求数
```

发起人主动取消的需求仍进入分母，运营测试和演示需求不进入分母。

### 12.2 到场率

```text
PRESENT 或 LATE 的成员人数
÷
已进入 CONFIRMED 的应到成员人数
```

### 12.3 复组率

```text
活动完成后 7 天内产生 source_session_id 新需求的 COMPLETED 局数
÷
观察期内进入 COMPLETED 的真实局数
```

### 12.4 单位成本

```text
可归属 cost_items 金额
+ ops_work_logs 分钟 × 冻结的人工分钟成本
÷
COMPLETED 真实局数
```

人工分钟成本 contract v0.1 暂定为 1 元/分钟，即 `100 amount_cents`。月度复盘可修改下一版本，不回改历史数据。

## 13. 测试与验收契约

### 13.1 固定测试数据

- 一所测试学校。
- A：发起人，角色为建模。
- B：编程主选。
- C：写作主选。
- D：编程候补。
- 所有人使用独立账号、独立浏览器会话和完整可用时间。
- 测试需求人数为 3：A + 编程 1 人 + 写作 1 人。

### 13.2 主流程验收

- [ ] A 登录并发布数模组队需求，`requests` 和角色空位真实入库。
- [ ] 算法从数据库读取 B、C、D，不读取 `demoCandidates`。
- [ ] 匹配结果保存主选、候补、分数、理由和算法版本。
- [ ] 创建唯一 `FORMING` 局，A 成为第一个成员。
- [ ] B、C 在另一设备 5 秒内看到属于自己的真实邀请。
- [ ] B 拒绝后，邀请状态写入数据库，D 自动从候补转为 `PENDING`。
- [ ] C、D 接受后，只创建两个参与者成员记录，不重复成局。
- [ ] A、C、D 查询同一 `sessionId`，看到相同状态和成员。
- [ ] 三个账号关闭页面并重新登录后，局和成员状态仍然存在。
- [ ] 未被邀请的账号不能查看该邀请；非成员不能查看局内详情。
- [ ] 成员完成签到、评价和复组，记录均可重新查询。
- [ ] 复组创建的新需求包含原 `source_session_id`。
- [ ] 运营页可以还原完整状态事件和通知尝试。
- [ ] 四项指标可以从测试数据计算；正式报表排除 `TEST` 数据。

### 13.3 并发与失败验收

- [ ] 两名用户同时抢最后一个空位，只能一人成功。
- [ ] 同一接受请求连续点击十次，只产生一个成员记录。
- [ ] 同一签到、评价和复组请求重复提交不产生重复数据。
- [ ] 已拒绝、已过期或已取消邀请不能再次接受。
- [ ] 通知任务重复执行不产生重复站内通知。
- [ ] 数据库短暂失败时返回明确错误，不在前端伪造成功状态。
- [ ] 匹配失败保存失败原因，允许安全重试并保留历史运行。

### 13.4 工程验收

- [ ] Drizzle Schema、migration 和 seed 可以在空测试数据库执行。
- [ ] 数据库约束、API、算法、状态机和关键并发路径有自动化测试。
- [ ] `npm run lint` 通过。
- [ ] 业务服务测试与构建通过。
- [ ] `npm run build:edgeone` 通过。
- [ ] README 包含环境变量、迁移、seed、启动、测试和部署命令。
- [ ] 仓库中不存在数据库密码、JWT 密钥、真实手机号或证明材料。

## 14. 两人开发边界

### Floyd

- 本契约最终冻结和版本管理。
- 公共数据库约定、Drizzle 配置和 migration 汇总。
- 身份、用户、需求、匹配表及对应 API。
- 匹配算法、结果持久化、指标查询。
- H5 发布需求和匹配结果接入。

### 算法组合作成员

- 成局、邀请、状态事件、履约、通知和运营表。
- 邀请、候补、成局、签到、评价和复组 API。
- 并发、幂等、超时任务和通知任务。
- H5 邀请、成局、履约和运营页面接入。

### 共同

- 每人测试自己主负责模块，另一人评审。
- Floyd 统一生成 migration；两人不得同时修改同一个 migration 文件。
- 每天至少完成一次主分支集成和双账号冒烟测试。
- 端到端验收和发布由两人共同签字。

## 15. 版本和变更规则

- 本文确认后，状态改为“已冻结”，填写冻结时间和双方姓名。
- 不影响数据库、API 和验收的文字修正升级补丁号，例如 `v0.1.1`。
- 修改字段、状态、API 或算法输出升级次版本，例如 `v0.2`。
- 删除字段、改变核心流程或更换主场景升级主版本，例如 `v1.0`。
- 每次修改记录：日期、提出人、原因、影响模块、迁移方式和批准人。
- 冻结后禁止在代码中通过临时字段或隐藏分支绕过本契约。
