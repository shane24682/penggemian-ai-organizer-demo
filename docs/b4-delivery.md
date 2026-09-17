# B4 签到、评价与复组交付

基线：`feature/b-workflow`，遵循 `docs/contract-v0.1.md`。复用 B1 的统一 Schema 和 migration，不新建重复表、不修改已发布 migration。

## 交付清单映射

| B4 项目 | 实现与验证 |
| --- | --- |
| 签到资格、时间、结果 | `GET/POST /sessions/:sessionId/checkins`；JWT 决定当前用户；服务端生成时间和 PRESENT/LATE；窗口及非法状态单元测试 |
| 评价提交、读取 | `POST/GET /sessions/:sessionId/reviews`；只读本人提交的评价；必须是本局已到场成员，不允许自评或评价局外成员 |
| 重复及越权保护 | POST 全部使用 B3 幂等事务；数据库唯一键及成局行锁兜底；重复签到不重复加信用，重复评价/复组不新增数据 |
| 复组意愿、状态 | `POST/GET /sessions/:sessionId/regroup-intents`；互选双方状态变为 MATCHED；修改选择后重新计算 OPEN/MATCHED；不返回他人的私人选择 |
| 状态事件与统计 | 签到、缺席、成员结算、活动开始/完成、评价和复组写入 status_events/domain_events；保留源需求 data_scope |
| 正常、缺席、取消、非法状态测试 | `fulfillment-rules.test.ts` 与 `fulfillment.integration.test.ts`；并发重放、读取恢复、信用一次结算、复组来源关联 |

## 活动结算

每分钟调用 `npm run job:advance-sessions`：

1. 到达 starts_at：CONFIRMED → IN_PROGRESS。
2. 到达 ends_at：IN_PROGRESS → COMPLETED；PRESENT/LATE 成员 → COMPLETED；未签到确认成员 → NO_SHOW，并新增 ABSENT 记录。
3. CONFIRMED 成员签到一次信用 +2，NO_SHOW 结算一次 -10；0～100 封顶/封底，分数变更与领域事件在同一事务。WITHDRAWN 和 CANCELLED 不按缺席扣分。

任务锁定成局，同一局并发执行和反复执行不会重复结算；单局失败不阻断其他局。仍为 FORMING 的局不会自行变为已开始。单批最多处理 100 个待推进的局，未结束的 IN_PROGRESS 局不反复占用批次。

## 契约未冻结的 B4 细化规则

- 签到：暂定开始前 30 分钟开放、ends_at 不再接受新签到；开始后超过 15 分钟为 LATE。阈值集中于 CHECKIN_POLICY，属于待负责人确认的细化规则，不代表修改冻结契约。
- 评价/复组：采用保守权限边界，仅 COMPLETED 局内 member_status=COMPLETED 的成员可提交；缺席/退出成员不作为评价、复组对象。
- 评价读取：只返回当前用户自己提交的记录，不公开他人对自己的评价。
- 复组意愿允许更新或清空，双方互选才返回对方 ID；其他人的原始选择不会返回。
- 复组创建继承原需求的竞赛、描述、投入要求、队伍人数和角色空位，调用人作为新发起人，时间由调用人重新填写。source_session_id 保留原局 ID，data_scope 保留源需求口径。
- 一个成员对同一源局最多创建一个复组需求（成局锁和数据库查询保障跨幂等键去重）；不同成员可分别创建。复组意愿不会自动写入新成员或代替接受邀请。
- 本次不实现退出/取消操作入口（已有 B2 状态，后续运营动作处理），也不接入 B5 H5 页面。

## 验收命令

```bash
npm run db:migrate
npm run db:seed
npm run server:build
npm run test:b4
npm run test:b4-integration
npm run test:server
npm run test:b1-schema
npm run test:b3-schema
npm run build:edgeone
```

集成用例使用种子 A/B/C/D 用户，创建独立 TEST 需求/局并在 finally 清理测试记录及恢复信用；只能在非生产测试数据库运行。

## 本次验证结果（2026-09-16）

- 使用本机 PostgreSQL 18 程序创建独立临时实例/空测试库，未连接或修改现有数据库服务的数据；现有 Docker Compose PostgreSQL 16 配置保持不变。
- 空库统一 migration 和 seed 成功；Drizzle generate 显示 No schema changes。
- 服务端全部测试 41/41（其中 B4 规则 7 个、B4 数据库集成 4 个）；B1 schema 10/10、B3 schema 2/2。
- 服务端编译、B4 集成测试类型检查、EdgeOne 构建、变更文件 ESLint 和 git diff --check 通过。
- 全仓 lint 仍为已有的 4 个错误：capture.cjs 两处、ActivityRoom.tsx 一处、lib/calendar.ts 一处；这些无关文件未修改。
- 全量回归发现 B3 通知用例的数据库微秒/JavaScript 毫秒时间截断边界，已仅修正该测试的执行时间；B3 产品逻辑未改动。
