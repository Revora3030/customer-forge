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
