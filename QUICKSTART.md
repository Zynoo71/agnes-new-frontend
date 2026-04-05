# Agnes Frontend - 快速启动

Agent Debug 前端项目，基于 React + TypeScript + Vite 构建，通过 gRPC-Web 与后端通信。

## 环境要求

- Node.js >= 18
- Docker（用于运行 Envoy gRPC 代理）
- 后端服务运行在 `localhost:9200`

## 安装依赖

```bash
npm install
```

## 启动开发环境

**一键启动**（推荐，同时启动 Envoy 代理和 Vite 开发服务器）：

```bash
npm start
```

这会：
1. 以后台模式启动 Envoy 代理（监听 `localhost:8080`）
2. 启动 Vite 开发服务器（默认 `localhost:5173`）

**分步启动**：

```bash
# 终端 1：启动 Envoy gRPC-Web 代理
npm run proxy

# 终端 2：启动 Vite 开发服务器
npm run dev
```

## 环境变量

在项目根目录创建 `.env` 文件：

```
VITE_API_BASE_URL=http://localhost:8080
```

## 其他命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 构建生产包 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | 运行 ESLint |
| `npm run proto:gen` | 从 proto 定义生成 TypeScript 类型（需要 `../Kiwi/agnes_core/proto` 目录） |

## 架构概览

```
src/
├── components/     # UI 组件（MessageBubble, Sidebar, ToolRenderer 等）
├── db/             # 本地数据库（sql.js）
├── gen/            # protobuf 自动生成的类型
├── grpc/           # gRPC 客户端配置
├── hooks/          # React hooks（useChat 等）
├── panels/         # 页面面板（ChatPanel 等）
├── stores/         # Zustand 状态管理
└── types/          # TypeScript 类型定义
```

## 通信架构

```
浏览器 (gRPC-Web) → Envoy 代理 (:8080) → 后端 gRPC 服务 (:9200)
```

Envoy 负责将 gRPC-Web 请求转换为标准 gRPC 协议，配置见 `envoy.yaml`。
