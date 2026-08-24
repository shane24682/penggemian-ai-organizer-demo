# 碰个面 · AI 校园活动主理人

面向大学生的校园活动匹配与组织 Demo。用户可以从“开始匹配”进入 AI 成局流程，也可以浏览活动广场，并让学生社团、校园墙和场地商家接入活动网络。

## 当前功能

- 单页工作台，导航切换时仅替换右侧内容区域
- AI 匹配四步流程：表达需求、确认偏好、查看匹配、完成成局
- 摄影、电影、桌游、台球、羽毛球、乐器、舞蹈等活动入口
- 社团、校园墙和场地商家接入空间
- 品牌合作与活动商业化演示看板
- 桌面端和移动端响应式布局

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm ci
npm run dev
```

浏览器打开终端显示的本地地址，通常为 `http://localhost:5173`。该命令使用与线上 EdgeOne Makers 相同的 Vite SPA 入口，并支持热更新。

## 验证与预览

```bash
npm run check
npm run preview
```

- `npm run build`：生成 EdgeOne 生产产物到 `dist-edgeone/`
- `npm run lint`：检查 TypeScript、React 与可访问性规则
- `npm test`：先完成生产构建，再运行产品能力测试
- `npm run check`：依次执行 lint、构建与测试

## 兼容的 Vinext / Cloudflare 链路

仓库保留原有 Vinext / Cloudflare Sites 配置，供兼容验证使用，但它不是 `penggemian.com` 当前的生产链路：

```bash
npm run dev:vinext
npm run build:vinext
npm run start:vinext
```

日常前端开发请使用默认的 `npm run dev`，避免同时运行两套开发服务器。

## 协作与部署

1. 从最新 `main` 创建功能分支。
2. 本地执行 `npm run check`。
3. 推送分支并创建 Pull Request，不直接向 `main` 推送。
4. Pull Request 合并到 `main` 后，由 EdgeOne Makers 的 Git 集成触发生产构建与部署。

EdgeOne 项目设置应使用：

- 安装命令：`npm ci`
- 构建命令：`npm run build`
- 输出目录：`dist-edgeone`
- Node.js：22.13 或更高版本

## 交接说明

- 主要页面：`app/page.tsx`
- 全局样式：`app/globals.css`
- 页面元数据：`app/layout.tsx`
- 生产构建配置：`vite.edgeone.config.ts`
- Vinext / Cloudflare 兼容配置：`vite.config.ts`
- `.openai/hosting.json` 未绑定任何线上项目，可由新托管环境重新配置

上传 GitHub 前请继续保持 `.env*`、`node_modules`、构建缓存和任何本地凭证不进入版本库。
