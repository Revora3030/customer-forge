import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Ladle runs on its own Vite 6; keep the @ alias and Tailwind so shadcn stories look right.
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../src"),
    },
  },
});
