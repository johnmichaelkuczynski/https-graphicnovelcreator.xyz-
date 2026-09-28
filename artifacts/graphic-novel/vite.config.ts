import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

const developmentOnly = (command: string, mode: string) =>
  command === "serve" && mode === "development" &&
  process.env.REPLIT_DEPLOYMENT !== "1";

const completedNovelPath = path.resolve(import.meta.dirname, "..", "..", "outputs", "group-psychology-noir.json");
const completedNovelRoute = `${basePath.replace(/\/$/, "")}/__dev/completed-novel/group-psychology.json`;

export default defineConfig(async ({ command, mode }) => ({
  base: basePath,
  // Compile this only into the local dev server. Production builds retain
  // the original auth/landing flow even if the build environment is unusual.
  define: {
    __DEVELOPMENT_PREVIEW__: JSON.stringify(
      developmentOnly(command, mode),
    ),
  },
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(developmentOnly(command, mode) ? [{
      name: "completed-novel-development-only",
      configureServer(server: import("vite").ViteDevServer) {
        server.middlewares.use((req, res, next) => {
          if (req.method !== "GET" || req.url?.split("?")[0] !== completedNovelRoute) return next();
          void stat(completedNovelPath).then((file) => {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Content-Length", file.size);
            res.setHeader("Cache-Control", "no-store");
            const stream = createReadStream(completedNovelPath);
            stream.on("error", (error) => {
              if (!res.headersSent) next(error);
              else res.destroy(error);
            });
            stream.pipe(res);
          }).catch(next);
        });
      },
    }] : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
}));
