import { readFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const LOCAL_SLIDE_WORKSPACE_ROOT =
  process.env.AGNES_LOCAL_SLIDE_WORKSPACE_ROOT ??
  "/Users/au/Documents/agnes_core/services/kw-agent-service/.super_agent/workspace";
const LOCAL_SLIDE_PREFIX = "/__local_slide_workspace/";
const DEV_PRESIGN_PROXY_PATH = "/__dev_chat_attachment_presign";
const DEV_UPLOAD_PROXY_PATH = "/__dev_upload_proxy";
// Local browser upload debugging should not require agents to mint short-lived JWTs by hand.
// When the page runs on localhost/127.0.0.1, the Vite dev server logs into the remote dev BFF
// on demand and proxies /file/presigned-url plus the subsequent object PUT upload.
// Override the login target/credentials with AGNES_DEV_BFF_* only when debugging a different env.
const DEV_BFF_BASE_URL = process.env.AGNES_DEV_BFF_BASE_URL ?? "https://api-agnes-dev.kiwiar.com";
const DEV_BFF_LOGIN_EMAIL = process.env.AGNES_DEV_BFF_LOGIN_EMAIL ?? "renhua.tian@kiwiar.com";
const DEV_BFF_LOGIN_PASSWORD = process.env.AGNES_DEV_BFF_LOGIN_PASSWORD ?? "kiwiar@2026";
const DEV_BFF_APP_ID = process.env.AGNES_DEV_BFF_APP_ID ?? "agnes";

let cachedDevBffToken: { token: string; expiresAtMs: number } | null = null;

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function localSlideWorkspacePlugin(): Plugin {
  const workspaceRoot = path.resolve(LOCAL_SLIDE_WORKSPACE_ROOT);

  return {
    name: "local-slide-workspace",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ? req.url.split("?")[0] : "";
        if (!rawUrl.startsWith(LOCAL_SLIDE_PREFIX)) {
          next();
          return;
        }

        const relativePath = decodeURIComponent(rawUrl.slice(LOCAL_SLIDE_PREFIX.length));
        const filePath = path.resolve(workspaceRoot, relativePath);
        const allowedPrefix = `${workspaceRoot}${path.sep}`;
        if (filePath !== workspaceRoot && !filePath.startsWith(allowedPrefix)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        try {
          const content = await readFile(filePath);
          res.statusCode = 200;
          res.setHeader("Content-Type", contentTypeFor(filePath));
          res.setHeader("Cache-Control", "no-store");
          res.end(content);
        } catch {
          res.statusCode = 404;
          res.end("Not found");
        }
      });
    },
  };
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
          const upstream = await fetch(`${DEV_BFF_BASE_URL}/api/v1/file/presigned-url`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-App": DEV_BFF_APP_ID,
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

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localSlideWorkspacePlugin(),
    devPresignProxyPlugin(),
    devUploadProxyPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Listen on all interfaces so teammates on the LAN can use http://<your-ip>:5173
    host: true,
    allowedHosts: true,
    proxy: {
      "/api/v1/file": {
        target: "https://api-agnes-dev.kiwiar.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
