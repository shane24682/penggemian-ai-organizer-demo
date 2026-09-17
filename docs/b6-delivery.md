# B6 运营列表与 A5 联调交付

日期：2026-09-17。集成分支：feature/b-workflow。A 最新输入：feat/p0-core-data-matching 的 a707b8b；保留 B4/B5 输入 ec309fa。

依据 contract-v0.1 与 A 已确认的 contract-v0.1.1-auth-and-multi-request。没有更改数据库 Schema、枚举、迁移文件或指标计算口径。沿用 A 的 ops/metrics.ts 聚合实现，不在 H5 推算正式指标。

## 清单映射

| B6 任务 | 交付 |
|---|---|
| 需求、邀请、回应、成局、签到、异常列表 | P0OpsPanel 六个入口；调用 /ops/flows，返回当前需求游标页关联的实际记录；异常覆盖匹配失败、邀请超时/到期未处理、通知 FAILED/DEAD、签到缺席 |
| 接入 A 聚合指标 | /ops/metrics 的四项指标、分子分母、筛选维度、直接成本、人工分钟和 CNY 分金额；分母零展示暂无样本，不展示虚假百分比 |
| 学校、场景、状态、时间筛选 | 学校 UUID、固定 MATH_MODELING、需求状态、来源渠道、REAL/TEST/DEMO、北京时间区间；OPS 学校固定，服务端再次校验 |
| 从需求追溯完整流程 | /ops/flows/:requestId：匹配、邀请响应、成员、签到、状态审计、domain_events、通知及 delivery_attempts、人工分钟和成本 |
| 记录人工处理与实际成本 | /ops/actions 的 LOG_WORK / RECORD_COST；必须填写原因，JSON+Idempotency-Key，同校权限、活动/需求归属验证、审计与事实在同一事务中追加 |

## 合并与缺口修复

- 保留 A 全局 AuthProvider/AuthBoundary、注册登录、需求中心、取消及时间冲突筛选，与 B 履约/通知路由并存。
- B5 页面只读取全局 accessToken，不维护第二套登录/退出。API 统一错误类，兼容 ApiRequestError 和 P0ApiError 名称，保留超时、取消、错误 requestId 及全局 401 失效事件。
- 运营流程默认分页 20，最大 100，新增 UUID 游标，以 PostgreSQL 原始时间+UUID 比较，避免 JS 时间精度截断；保留 A offset 调用兼容，不可与非零 offset 混用。
- 状态追溯增加 session_members/checkins/reviews/regroup_intents 及关联业务事件的聚合 ID；通知增加 B3 delivery_attempts。
- 时间/成本读取 requestId 或 sessionId 归属；同时关联两者的单行不会重复返回，A 指标现有去重归属方式不变。
- ops/actions 仅为记录，不包含强制取消、开始、完成或替用户响应；未引入 operator_actions 表，也不绕过状态机。

## A/B 事件交接

A5 成局率依赖 REQUEST_FULFILLED，到场率依赖 SESSION_CONFIRMED 与 session_members/checkins，复组率/单位成本依赖 SESSION_COMPLETED 与 requests.source_session_id、cost_items、ops_work_logs。B 当前流程使用一致名称与关联字段。

B6 新增 OPS_WORK_RECORDED / OPS_COST_RECORDED，携带服务端 actorUserId、schoolId、requestId、可选 sessionId、原需求 dataScope、记录 ID、原因和唯一 dedupeKey。普通 USER 不可读取运营端点；OPS 仅本校，ADMIN 可显式选校。

## 验证与环境

空白隔离 TEST 库重新执行统一 migration 和 seed，避免旧种子需求已超过报名截止时间干扰回归。使用临时 PostgreSQL 端口 55439，不接触本机已有 PostgreSQL 服务的数据目录，不写仓库 .env。

- 服务端测试 46/46，包括 A 指标/流程查询、B3 并发/通知、B4 履约与新增 B6 集成。
- B6 单元测试 2/2，B5 单元 8/8，A 需求中心单元 3/3，Schema 共 12/12。
- H5 类型检查、服务端编译、EdgeOne 构建、SSR 构建及渲染测试 8/8。
- A 带来的既有 lint 修复一并保留；全仓 lint 和差异空白检查通过。

浏览器脚本使用独立会话和 390px 移动视口，经真实业务 API/数据库验证 B5 主链路与账号隔离，再验证独立 OPS 账号全局登录、TEST 流程列表与 REAL 指标分离、人工 7 分钟/实际 125 分入库、刷新后再次读取。脚本仅在 APP_ENV=test 且 B5_TEST_DB_ALLOW_WRITES=1 执行，测试账号/事实自行清理，不对生产或共享数据库运行。

如需复跑，按 b5-delivery.md 的外部 Playwright、API、H5 预览和独立 TEST 数据库配置运行 npm run test:b6-browser。部署仍需手机可访问的 HTTPS API、正确 CORS 和三个定时任务。实体双手机和生产部署未执行。

## 交接边界

指标逻辑仍由 A 主负责；没有擅自修改软删除历史、统计队列成熟度等口径。如双方希望调整，需按契约由 Floyd 确认后修改。运营记录状态查询和字段是 /ops/flows 的向后兼容增量，人工记录请求体应由双方评审确认。

本次没有实现 B7 的完整最终发布验收，也没有发布或自动推送远程仓库。
