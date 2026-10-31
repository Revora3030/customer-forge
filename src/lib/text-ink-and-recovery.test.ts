import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { siteThemeStyle } from "@/lib/site-theme";
import { classifyClientError, isStaleDeployError, reloadOnceForNewBuild } from "@/lib/client-error-classify";

describe("client site wrapper paints its own ink", () => {
  it("sets dark text on a light surface so nothing inherits Revora's white body text", () => {
    const style = siteThemeStyle({ secondaryColor: "#ffffff" }) as Record<string, string>;
    expect(style["color"]).toBe("#101114");
    expect(style["backgroundColor"]).toBe("#ffffff");
    expect(style["colorScheme"]).toBe("light");
  });
  it("sets light text on a dark surface", () => {
    const style = siteThemeStyle({ secondaryColor: "#0b1020" }) as Record<string, string>;
    expect(style["color"]).toBe("#f7f7f8");
    expect(style["colorScheme"]).toBe("dark");
  });
  it("defaults to dark-on-white when no colour is chosen yet", () => {
    const style = siteThemeStyle({}) as Record<string, string>;
    expect(style["color"]).toBe("#101114");
  });
});

describe("old code after a deploy", () => {
  it("recognises stale chunk errors", () => {
    expect(isStaleDeployError("Unexpected token '<'")).toBe(true);
    expect(isStaleDeployError("Failed to fetch dynamically imported module: https://x/assets/a.js")).toBe(true);
    expect(isStaleDeployError("Cannot read properties of undefined (reading 'page')")).toBe(false);
    expect(classifyClientError(new Error("Importing a module script failed."))).toBe("warn");
    expect(classifyClientError(new Error("Invalid server function ID"))).toBe("warn");
  });
  it("recognises a missing server function and a lazy route that resolved to nothing", () => {
    expect(isStaleDeployError("Server function info not found for abc123")).toBe(true);
    expect(isStaleDeployError("undefined is not an object (evaluating 'e[t ?? `default`]')")).toBe(true);
    expect(isStaleDeployError("undefined is not an object (evaluating 'e[t??\"default\"]')")).toBe(true);
    expect(isStaleDeployError("undefined is not an object (evaluating 'a.b')")).toBe(false);
    expect(classifyClientError(new Error("Server function info not found for abc123"))).toBe("warn");
  });
  it("reloads only once per minute, never in a loop", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const reload = vi.fn();
    expect(reloadOnceForNewBuild(storage, reload, 1_000_000)).toBe(true);
    expect(reloadOnceForNewBuild(storage, reload, 1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("a code chunk that fails to load", () => {
  const root = readFileSync("src/routes/__root.tsx", "utf8");
  const handler = /const onPreloadError = \(event: Event\) => \{([\s\S]*?)\n {4}\};/.exec(root)?.[1] ?? "";

  it("is swallowed only while the page reloads for the new build", () => {
    // Swallowed without a reload, the route got an empty module and crashed with
    // "undefined is not an object (evaluating 'e[t ?? \"default\"]')" (Sentry K and G).
    expect(handler).toContain("if (reloadOnceForNewBuild(storage, () => window.location.reload())) {\n        event.preventDefault();\n        return;\n      }");
    expect(handler.match(/preventDefault/g)?.length).toBe(1);
    expect(handler).toContain("reportRouteError(");
  });
});
