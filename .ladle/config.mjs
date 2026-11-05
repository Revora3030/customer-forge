/** Ladle catalog for UI primitives (BRF-02). Dev-only; not shipped to customers. */
export default {
  stories: "src/components/ui/**/*.stories.{tsx,jsx}",
  addons: {
    a11y: {
      // axe-core ships with Ladle; keep the panel available for local checks.
      enabled: true,
    },
    theme: {
      enabled: true,
      defaultState: "light",
    },
  },
  viteConfig: `${process.cwd()}/.ladle/vite.config.ts`,
  // Keep the static catalog out of the app dist folder.
  outDir: "ladle-build",
  // Port matches package.json script.
  port: 61000,
};
