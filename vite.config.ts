import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const DEV_CREATE_CONVERSATION_PROXY_PATH = "/__dev_agnes_conversation";
const DEV_PRESIGN_PROXY_PATH = "/__dev_chat_attachment_presign";
const DEV_UPLOAD_PROXY_PATH = "/__dev_upload_proxy";
const DEV_SLIDE_FILE_PROXY_PREFIX = "/api/v1/agnes/conversation/slide-file";
// Local browser upload debugging should not require agents to mint short-lived JWTs by hand.
// When the page runs on localhost/127.0.0.1, the Vite dev server logs into the remote dev BFF
// on demand and proxies /file/presigned-url plus the subsequent object PUT upload.
// Override the login target/credentials with AGNES_DEV_BFF_* only when debugging a different env.
const DEV_BFF_BASE_URL = process.env.AGNES_DEV_BFF_BASE_URL ?? "https://api-agnes-dev.kiwiar.com";
const DEV_BFF_LOGIN_EMAIL = process.env.AGNES_DEV_BFF_LOGIN_EMAIL ?? "renhua.tian@kiwiar.com";
const DEV_BFF_LOGIN_PASSWORD = process.env.AGNES_DEV_BFF_LOGIN_PASSWORD ?? "kiwiar@2026";
const DEV_BFF_APP_ID = process.env.AGNES_DEV_BFF_APP_ID ?? "agnes";
const DEV_LANE = process.env.AGNES_DEV_LANE ?? process.env.VITE_DEV_LANE ?? "";
const DEV_SLIDE_BFF_BASE_URL =
  process.env.AGNES_DEV_SLIDE_BFF_BASE_URL ??
  process.env.VITE_BFF_BASE_URL ??
  "http://127.0.0.1:8201";

let cachedDevBffToken: { token: string; expiresAtMs: number } | null = null;

function getDevLane(req: { headers: Record<string, unknown> }): string {
  const headerLane = req.headers["x-dev-lane"];
  if (typeof headerLane === "string" && headerLane.trim()) {
    return headerLane.trim();
  }
  return DEV_LANE;
}

function parseJwtExpiry(token: string): number {
  const payload = token.split(".")[1] ?? "";
  if (!payload) {
    return 0;
  }
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function getDevBffToken(): Promise<string> {
  if (cachedDevBffToken && cachedDevBffToken.expiresAtMs - Date.now() > 60_000) {
    return cachedDevBffToken.token;
  }

  const loginResp = await fetch(`${DEV_BFF_BASE_URL}/api/v1/user/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-App": DEV_BFF_APP_ID,
    },
    body: JSON.stringify({
      email_password: {
        email: DEV_BFF_LOGIN_EMAIL,
        password: DEV_BFF_LOGIN_PASSWORD,
      },
    }),
  });
  if (!loginResp.ok) {
    throw new Error(`Dev BFF login failed: HTTP ${loginResp.status}`);
  }

  const loginJson = (await loginResp.json()) as {
    code?: string;
    message?: string;
    data?: { access_token?: string };
  };
  const token = String(loginJson.data?.access_token ?? "").trim();
  if (loginJson.code !== "000000" || !token) {
    throw new Error(loginJson.message || "Dev BFF login failed");
  }

  cachedDevBffToken = {
    token,
    expiresAtMs: parseJwtExpiry(token) || Date.now() + 10 * 60 * 1000,
  };
  return token;
}

function devPresignProxyPlugin(): Plugin {
  return {
    name: "dev-presign-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ? req.url.split("?")[0] : "";
        if (rawUrl !== DEV_PRESIGN_PROXY_PATH) {
          next();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        try {
          const token = await getDevBffToken();
          const devLane = getDevLane(req);
          const upstream = await fetch(`${DEV_BFF_BASE_URL}/api/v1/file/presigned-url`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-App": DEV_BFF_APP_ID,
              ...(devLane ? { "x-dev-lane": devLane } : {}),
            },
            body: Buffer.concat(chunks),
          });
          const responseBody = Buffer.from(await upstream.arrayBuffer());
          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() === "content-length") {
              return;
            }
            res.setHeader(key, value);
          });
          res.end(responseBody);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(error instanceof Error ? error.message : "Presign proxy failed");
        }
      });
    },
  };
}

function devCreateConversationProxyPlugin(): Plugin {
  return {
    name: "dev-create-conversation-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ? req.url.split("?")[0] : "";
        if (rawUrl !== DEV_CREATE_CONVERSATION_PROXY_PATH) {
          next();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        try {
          const token = await getDevBffToken();
          const devLane = getDevLane(req);
          const upstream = await fetch(`${DEV_BFF_BASE_URL}/api/v1/agnes/conversation`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-App": DEV_BFF_APP_ID,
              ...(devLane ? { "x-dev-lane": devLane } : {}),
            },
            body: Buffer.concat(chunks),
          });
          const responseBody = Buffer.from(await upstream.arrayBuffer());
          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() === "content-length") {
              return;
            }
            res.setHeader(key, value);
          });
          res.end(responseBody);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(error instanceof Error ? error.message : "Create conversation proxy failed");
        }
      });
    },
  };
}

function devUploadProxyPlugin(): Plugin {
  return {
    name: "dev-upload-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ? req.url.split("?")[0] : "";
        if (rawUrl !== DEV_UPLOAD_PROXY_PATH) {
          next();
          return;
        }
        if (req.method !== "PUT") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        const target = String(req.headers["x-upload-target"] || "").trim();
        if (!target) {
          res.statusCode = 400;
          res.end("Missing X-Upload-Target header");
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);

        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (!value) {
            continue;
          }
          const lower = key.toLowerCase();
          if (
            lower === "host" ||
            lower === "connection" ||
            lower === "content-length" ||
            lower === "origin" ||
            lower === "referer" ||
            lower === "x-upload-target"
          ) {
            continue;
          }
          if (Array.isArray(value)) {
            for (const item of value) {
              headers.append(key, item);
            }
          } else {
            headers.set(key, value);
          }
        }

        try {
          const upstream = await fetch(target, {
            method: "PUT",
            headers,
            body,
          });
          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() === "content-length") {
              return;
            }
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(error instanceof Error ? error.message : "Upload proxy failed");
        }
      });
    },
  };
}

function devSlideFileProxyPlugin(): Plugin {
  return {
    name: "dev-slide-file-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? "";
        const rawPath = rawUrl.split("?")[0] ?? "";
        if (!rawPath.startsWith(`${DEV_SLIDE_FILE_PROXY_PREFIX}/`)) {
          next();
          return;
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        try {
          const token = await getDevBffToken();
          const devLane = getDevLane(req);
          const upstream = await fetch(new URL(rawUrl, DEV_SLIDE_BFF_BASE_URL), {
            method: req.method,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: String(req.headers.accept || "*/*"),
              "X-App": DEV_BFF_APP_ID,
              ...(req.headers.range ? { Range: String(req.headers.range) } : {}),
              ...(devLane ? { "x-dev-lane": devLane } : {}),
            },
          });

          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() === "content-length") {
              return;
            }
            res.setHeader(key, value);
          });
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(error instanceof Error ? error.message : "Slide file proxy failed");
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devCreateConversationProxyPlugin(),
    devPresignProxyPlugin(),
    devUploadProxyPlugin(),
    devSlideFileProxyPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api/v1/file": {
        target: "https://api-agnes-dev.kiwiar.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
