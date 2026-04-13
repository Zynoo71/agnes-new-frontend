import { readFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const LOCAL_SLIDE_WORKSPACE_ROOT =
  process.env.AGNES_LOCAL_SLIDE_WORKSPACE_ROOT ??
  "/Users/au/Documents/agnes_core/services/kw-agent-service/.super_agent/workspace";
const LOCAL_SLIDE_PREFIX = "/__local_slide_workspace/";

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

export default defineConfig({
  plugins: [react(), tailwindcss(), localSlideWorkspacePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/kw_agent_service": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
