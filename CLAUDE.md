# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Agnes Agent Debug frontend — React 19 + TypeScript + Vite 8 + Tailwind 4 app for real-time chat, tool-call visualization, and agent-swarm debugging. Talks to a backend gRPC service over gRPC-Web via a local Envoy proxy. README.md is in Chinese; key user-facing docs live there.

## Commands

```bash
npm install                 # install deps (package-lock.json is canonical; bun.lock is also committed)
npm run dev                 # starts Envoy (docker compose) then Vite on 127.0.0.1:5173
npm run build               # tsc -b && vite build — tsc must pass (strict) before vite builds
npm run lint                # ESLint (flat config, eslint.config.js)
npm run preview             # preview the production build
npm run proto:gen           # regenerate src/gen/** from ../agnes_core/proto — requires sibling checkout
npm run deploy              # docker compose -f docker-compose.prod.yaml up --build -d
```

Note: the README references `npm start` and `npm run proxy` — those scripts do not exist; use `npm run dev` (which already starts Envoy in the background). There is no test runner configured.

### Type-check or lint a single file

```bash
npx tsc -b                                 # whole project; incremental
npx eslint src/path/to/File.tsx            # single file
```

## Runtime topology

```
browser (gRPC-Web)  →  Envoy :8080 (docker)  →  backend gRPC :9200
browser (REST/uploads) →  Vite dev proxy plugins  →  remote dev BFF (api-agnes-dev.kiwiar.com)
```

- Envoy config: `envoy.yaml` (dev, targets `host.docker.internal:9200`) and `envoy.prod.yaml`.
- The gRPC client is a single module-level Connect-ES client (`src/grpc/client.ts`) with an interceptor that injects `x-trace-id`, `x-user-id`, `x-dev-lane`, `x-app-id` on every request. `VITE_API_BASE_URL` points at Envoy.
- `vite.config.ts` registers four dev-only middleware plugins that auto-login to the remote dev BFF (caching the JWT) and proxy: `/__dev_agnes_conversation`, `/__dev_chat_attachment_presign`, `/__dev_upload_proxy` (PUT with `X-Upload-Target` header), and `/api/v1/agnes/conversation/slide-file/*`. Login creds default to `AGNES_DEV_BFF_LOGIN_EMAIL`/`..._PASSWORD`; override via env, don't hardcode elsewhere. These plugins exist so browser uploads in localhost don't require hand-minting JWTs.

## Architecture highlights

**Streaming event pipeline.** The hot path is `useChat` (`src/hooks/useChat.ts`) → `agentClient.chatStream/resumeStream/...` → `conversationStore.processEventForConv` (`src/stores/conversationStore.ts`, ~1300 lines). The store is a large reducer over `AgentStreamEvent`s (from `src/gen/common/v1/agent_stream_pb`) that builds up messages, tool calls, reasoning steps, worker state, and task lists. Read both files together — logic is split by concern (stream orchestration vs. event reduction), not by module boundary.

**Abort/stream lifecycle.** `useChat` keeps a module-level `abortMap` keyed by `convId` so multiple `useChat()` call sites (e.g. sidebar + panel) share one controller per conversation — do not move this state into component scope. On `ALREADY_EXISTS` from `chatStream`, the code automatically falls back to `resumeStream({ fromSeq: 0n })`; per-turn seq is tracked in a non-reactive `latestSeqByConv` map (`getLatestSeq` / `resetLatestSeq`) because it's needed outside React updates.

**Worker block normalization.** Live SSE uses aliases (`ToolCallStart`, `ToolCallResult`, `WorkerEnd`, `MessageDelta`) that must be passed through `normalizeWorkerBlockType` before `applyWorkerContentBlock`. History replay uses canonical names directly. If you add a new worker block type, update both `STREAM_ALIAS_TO_WORKER_TYPE` and `applyWorkerContentBlock` together.

**Tool renderers.** `src/components/ToolRenderer/registry.ts` maps tool names → renderer components explicitly. Unknown tool names fall through to a default JSON renderer. To support a new tool, add an entry to `TOOL_RENDERERS` and create a component under `src/components/ToolRenderer/renderers/`.

**State.** Zustand stores in `src/stores/`: `conversationStore` (active conversation: messages, tasks, workers, streaming flags), `conversationListStore` (sidebar list + persistence), plus specialized stores for profile, system prompts, and previews. Prefer `useXxxStore.getState()` inside non-React callbacks (e.g. stream handlers) and selector subscriptions inside components.

**Local persistence.** `src/db/index.ts` embeds sql.js (SQLite compiled to WASM) and snapshots the DB to IndexedDB on a debounced timer. BigInt IDs from protobuf are stored as TEXT to avoid precision loss — keep that invariant when adding columns.

**Generated code.** `src/gen/**` is produced by `buf generate` (config in `buf.gen.yaml`) from `../agnes_core/proto`. It is excluded from `tsconfig.app.json` and must never be hand-edited — regenerate via `npm run proto:gen` after the proto repo changes.

## Conventions that matter

- Path alias `@/*` → `src/*` (see `tsconfig.app.json` and `vite.config.ts`). Use it; don't write long relative imports.
- `verbatimModuleSyntax: true` — type-only imports must use `import type { ... }`.
- Strict TS with `noUnusedLocals` and `noUnusedParameters` — unused symbols fail the build (which gates `vite build`).
- Routes are declared in `src/App.tsx`. `/chat/:convId` is the canonical chat route; `/chat` without an id is a blank state. `App` uses `react-router` v7 (the post-v6 package rename, not `react-router-dom`).
- When touching upload/auth flows, update `vite.config.ts` dev proxy and the matching `src/api/*.ts` module together; don't bypass the dev proxy by hand-wiring tokens in application code (see README for rationale).
