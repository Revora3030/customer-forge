// Standalone Vite config for the premium template harness (local only).
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  build: { outDir: path.resolve(__dirname, "dist"), emptyOutDir: true },
  server: { port: 4517, strictPort: true, host: "127.0.0.1" },
  preview: { port: 4518, strictPort: true, host: "127.0.0.1" },
});
