# Agnes Frontend

Agnes Agent Debug 前端，用于与 AI Agent 实时对话、调试和可视化工具调用过程。

基于 React 19 + TypeScript + Vite + Tailwind CSS 构建，通过 gRPC-Web (Connect) 与后端通信。

## 快速启动

### 环境要求

- Node.js >= 18
- Docker（用于运行 Envoy gRPC 代理）
- 后端 HTTP 服务运行在 `127.0.0.1:8201`
- 后端 gRPC 服务运行在 `127.0.0.1:9200`

### 安装与运行

```bash
# 安装依赖
npm install

# 创建环境变量（按需修改）
cp .env.example .env

# 一键启动（Envoy 代理 + Vite 开发服务器）
npm start
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_BASE_URL` | Envoy gRPC-Web 代理地址 | `http://localhost:8080` |
| `VITE_DEV_USER_ID` | 开发用 user-id，注入 `x-user-id` 请求头 | - |
| `VITE_DEV_LANE` | 开发泳道标识，注入 `x-dev-lane` 请求头 | - |

启动后访问 `http://localhost:5173`。

### 分步启动

```bash
# 终端 1：启动 Envoy gRPC-Web 代理
npm run proxy

# 终端 2：启动 Vite 开发服务器
npm run dev
```

## 功能特性

- **实时流式对话** — 基于 gRPC 服务端流，逐字渲染 AI 回复
- **工具调用可视化** — Web 搜索、图片搜索、网页读取、文件操作等工具的专属渲染器
- **推理过程展示** — 可折叠的 AI 思维链/推理步骤
- **多 Worker 并行** — Agent Swarm 面板展示多个并行 Worker 的实时状态
- **对话管理** — 创建、切换、删除对话，支持历史记录加载与流恢复
- **消息编辑与重发** — 编辑已发送消息并重新生成回复
- **Markdown 渲染** — 支持 GFM（表格、删除线）、代码高亮（Shiki）、CJK 友好排版

## 技术栈

| 分类 | 技术 |
|------|------|
| 框架 | React 19, TypeScript, Vite |
| 样式 | Tailwind CSS 4 |
| 状态管理 | Zustand |
| 通信协议 | gRPC-Web (Connect-ES) |
| Proto 生成 | Buf + protoc-gen-es |
| Markdown | react-markdown + remark-gfm + Shiki |
| 本地存储 | sql.js (SQLite in WASM) |
| 路由 | React Router 7 |

## 通信架构

```
浏览器 (gRPC-Web) → Envoy 代理 (:8080) → 后端 gRPC 服务 (:9200)
```

Envoy 将 gRPC-Web 请求转换为标准 gRPC/HTTP2 协议，配置见 `envoy.yaml`。当前本地开发环境中，前端经 `localhost:8080` 转发到 `127.0.0.1:9200`。

## 项目结构

```
src/
├── components/        # UI 组件
│   ├── MessageBubble  #   消息气泡（Markdown 渲染、编辑、复制）
│   ├── Sidebar        #   侧边栏（对话列表、新建/删除）
│   ├── ToolRenderer/  #   工具调用渲染器（WebSearch, ImageSearch, WebRead, ...）
│   ├── AgentSwarmPanel#   多 Worker 并行面板
│   ├── CodeBlock      #   代码块（Shiki 高亮）
│   ├── NodeSteps      #   Agent 节点步骤展示
│   └── EventStream    #   原始事件流查看器
├── panels/            # 页面面板
│   ├── ChatPanel      #   主聊天界面
│   └── PixaPanel      #   Pixa 面板
├── stores/            # Zustand 状态管理
├── hooks/             # React Hooks（useChat 等）
├── grpc/              # gRPC 客户端配置
├── gen/               # protobuf 自动生成的 TS 类型
├── db/                # sql.js 本地数据库
└── types/             # TypeScript 类型定义
```

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm start` | 启动 Envoy（后台）+ Vite 开发服务器 |
| `npm run dev` | 仅启动 Vite 开发服务器 |
| `npm run proxy` | 仅启动 Envoy gRPC 代理 |
| `npm run build` | TypeScript 编译 + Vite 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | ESLint 检查 |
| `npm run proto:gen` | 从 proto 文件生成 TS 类型（需要 `../Kiwi/agnes_core/proto`） |
