import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(async ({ mode }) => {
  // Загружаем переменные окружения из тестового файла
  const env = loadEnv(mode, process.cwd(), '');
  console.log('Loaded environment variables:', {
    VITE_BACKEND_URL: env.VITE_BACKEND_URL,
    VITE_BACKEND_WS_URL: env.VITE_BACKEND_WS_URL,
    VITE_WEB_APP_URL: env.VITE_WEB_APP_URL
  });
  
  return {
    plugins: [
      react(),
      runtimeErrorOverlay(),
      ...(env.REPL_ID !== undefined && process.env.NODE_ENV !== "production"
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer(),
            ),
          ]
        : []),
    ],
    server: {
      port: 5173,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        '*.trycloudflare.com',
        env.VITE_WEB_APP_URL?.replace(/^https?:\/\//, '') // убираем протокол
      ],
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_URL || 'http://localhost:3001',
          changeOrigin: true
        },
        '/ws': {
          target: env.VITE_BACKEND_URL || 'http://localhost:3001',
          ws: true,
          changeOrigin: true
        }
      }
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
  };
});