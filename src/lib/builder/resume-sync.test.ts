import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { installBuilderResumeSync, isBuilderQueryKey } from "./resume-sync";

function setup() {
  const page = Object.assign(new EventTarget(), { navigator: { onLine: true } });
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  const dispose = installBuilderResumeSync(
    { invalidateQueries } as unknown as QueryClient,
    page as unknown as Window, doc as unknown as Document,
  );
  return { page, doc, invalidateQueries, dispose };
}

describe("builder resume sync", () => {
  it("refreshes persisted builder state when the app becomes visible", () => {
    const s = setup();
    s.doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.invalidateQueries).toHaveBeenCalledWith({ predicate: expect.any(Function), refetchType: "active" });
    s.dispose();
  });
  it.each(["focus", "pageshow", "online"])("refreshes on %s", (event) => {
    const s = setup();
    s.page.dispatchEvent(new Event(event));
    expect(s.invalidateQueries).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it("does not fetch while hidden or offline", () => {
    const s = setup();
    s.doc.visibilityState = "hidden";
    s.page.dispatchEvent(new Event("focus"));
    s.doc.visibilityState = "visible";
    s.page.navigator.onLine = false;
    s.page.dispatchEvent(new Event("online"));
    expect(s.invalidateQueries).not.toHaveBeenCalled();
    s.dispose();
  });
  it("coalesces simultaneous resume events", () => {
    const s = setup();
    s.page.dispatchEvent(new Event("pageshow"));
    s.page.dispatchEvent(new Event("focus"));
    s.doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.invalidateQueries).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it("removes listeners when disposed", () => {
    const s = setup();
    s.dispose();
    s.page.dispatchEvent(new Event("focus"));
    s.doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.invalidateQueries).not.toHaveBeenCalled();
  });
  it("only invalidates builder-related query families", () => {
    expect(isBuilderQueryKey(["generation_job", "workspace"])).toBe(true);
    expect(isBuilderQueryKey(["website_content", "workspace"])).toBe(true);
    expect(isBuilderQueryKey(["payments"])).toBe(false);
    expect(isBuilderQueryKey([])).toBe(false);
  });
});
