import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const apiTarget = process.env.VITE_API_PROXY ?? "http://127.0.0.1:3000";
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    // Workspace packages have different TypeScript peer paths; runtime providers must stay shared.
    dedupe: [
      "react",
      "react-dom",
      "i18next",
      "react-i18next",
      "@tanstack/react-query",
    ],
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173, proxy: { "/api": apiTarget } },
  preview: { port: 4173, proxy: { "/api": apiTarget } },
  build: {
    // Ant Design is one shared, long-cached chunk (~365 kB gzip); everything else stays well below.
    chunkSizeWarningLimit: 1300,
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks cache across releases; feature pages stay lazy per route.
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: "vendor-antd",
              test: /node_modules[\\/](antd|@ant-design|@rc-component|rc-[^\\/]+|@emotion|dayjs)[\\/]/,
              priority: 20,
            },
            {
              name: "vendor",
              test: /node_modules[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
