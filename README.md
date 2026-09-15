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
