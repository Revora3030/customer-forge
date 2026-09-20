// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Load unprefixed env vars into process.env for server routes (never into the client bundle).
const serverEnv = loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

// Public backend identifiers. The local .env is gitignored, so a build that runs
// outside the sandbox (hosting/CI) has no VITE_SUPABASE_* values and every page
// then fails client-side with "Missing Supabase environment variable(s)". These
// two values are publishable by design (project URL + publishable anon key, both
// protected by RLS), so committing them as a last-resort fallback keeps the
// deployed site working everywhere. Real env values always win.
const PUBLIC_SUPABASE_URL = "https://smqngrtayopyirrqcbhq.supabase.co";
const PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4g9xDdoVG7smhhZDGvNWAQ_GfmuWgO6";

process.env["VITE_SUPABASE_URL"] ||= process.env["SUPABASE_URL"] || PUBLIC_SUPABASE_URL;
process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||=
  process.env["SUPABASE_PUBLISHABLE_KEY"] || PUBLIC_SUPABASE_PUBLISHABLE_KEY;
process.env["SUPABASE_URL"] ||= process.env["VITE_SUPABASE_URL"];
process.env["SUPABASE_PUBLISHABLE_KEY"] ||= process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // The Lovable TanStack config owns preview/sandbox host detection. Do not
    // override its allowed-host list: Lovable editor/mobile previews can arrive
    // through sandbox/proxy hosts that are not customer domains.
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(
          import.meta.dirname,
          "node_modules/entities/lib/decode.js",
        ),
        "entities/lib/encode.js": path.resolve(
          import.meta.dirname,
          "node_modules/entities/lib/encode.js",
        ),
        entities: path.resolve(import.meta.dirname, "node_modules/entities"),
      },
    },
  },
});
