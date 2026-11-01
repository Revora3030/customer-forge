// Standalone Vite config for the first-paint harness (local only, no network).
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  build: {
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        before: path.resolve(__dirname, "before.html"),
        after: path.resolve(__dirname, "entry-after.tsx"),
        builder: path.resolve(__dirname, "builder.html"),
      },
    },
  },
});
