# RedStation

Red 系一体化工作台的 monorepo 仓库。

## 架构

- `apps/app` — SvelteKit 前端（Vite + Svelte 5）
- `apps/server` — Fastify 后端（TypeScript）

使用 pnpm workspace 管理依赖。

## 快速开始

```bash
pnpm install
pnpm dev:app      # 前端 http://localhost:5173
pnpm dev:server   # 后端 http://localhost:3001/api/health
# 或
pnpm dev          # 同时启动前后端
```

## 脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev:app` | 启动前端 Vite dev server |
| `pnpm dev:server` | 启动后端 Fastify dev（tsx watch） |
| `pnpm build` | 构建所有子包 |
| `pnpm -F @redstation/app check` | 前端类型与 lint 检查 |
| `pnpm -F @redstation/server typecheck` | 后端类型检查 |

## 端口约定

- 前端 dev：`5173`
- 后端 API：`3001`（可用 `PORT` 环境变量覆盖）

## 当前状态

- 前端已包含静态 UI：应用外壳（侧边栏 / 顶栏 / 面包屑）、各模块空态占位页与概览仪表盘。
- 后端仅提供 `/api/health` 与 `/api` 健康探针，业务功能待后续实现。
- 静态 UI 为演示用占位数据，尚未接入后端。
