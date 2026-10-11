import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadTurns } from "./builder-memory";
import { readCachedTurns, writeCachedTurns } from "./builder-chat-cache";
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
type Response = { data: unknown[] | null; error: { code: string; message: string } | null; status: number };
type Query = { select: (columns: string) => Query; eq: (key: string, value: string) => Query; order: (key: string, options: unknown) => Query; limit: (count: number) => Promise<Response> };
let responses: Response[];
function storage(): Storage {
  const items = new Map<string, string>();
  return { get length() { return items.size; }, clear: () => items.clear(), getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null, removeItem: (key) => { items.delete(key); }, setItem: (key, value) => { items.set(key, value); } };
}
beforeEach(() => {
  vi.clearAllMocks(); responses = [];
  vi.stubGlobal("window", { localStorage: storage(), sessionStorage: storage() });
  from.mockImplementation(() => {
    const query: Query = { select: () => query, eq: () => query, order: () => query,
      limit: async () => { const response = responses.shift(); if (!response) throw new Error("Unexpected database read"); return response; } };
    return query;
  });
  writeCachedTurns("org-a", [{ role: "user", content: "Cached private question", at: "1" }]);
});
afterEach(() => vi.unstubAllGlobals());
describe("authorized chat-cache fallback", () => {
  it.each([401, 403])("does not display cache after HTTP %i", async (status) => {
    responses.push({ data: null, error: { code: "42501", message: "permission denied" }, status });
    await expect(loadTurns("org-a")).rejects.toMatchObject({ code: "42501" });
    expect(readCachedTurns("org-a")).toEqual([]);
  });
  it("also rejects a known authorization code without an HTTP rejection status", async () => {
    responses.push({ data: null, error: { code: "PGRST301", message: "invalid session" }, status: 400 });
    await expect(loadTurns("org-a")).rejects.toMatchObject({ code: "PGRST301" });
    expect(readCachedTurns("org-a")).toEqual([]);
  });
  it("preserves display-only cached history for a network failure", async () => {
    responses.push({ data: null, error: { code: "", message: "Failed to fetch" }, status: 0 });
    expect((await loadTurns("org-a"))[0]?.content).toBe("Cached private question");
  });
  it("keeps missing-column fallback but rejects denied access on that fallback", async () => {
    responses.push({ data: null, error: { code: "42703", message: "column request_id does not exist" }, status: 400 });
    responses.push({ data: null, error: { code: "42501", message: "permission denied" }, status: 403 });
    await expect(loadTurns("org-a")).rejects.toMatchObject({ code: "42501" });
    expect(from).toHaveBeenCalledTimes(2); expect(readCachedTurns("org-a")).toEqual([]);
  });
});
