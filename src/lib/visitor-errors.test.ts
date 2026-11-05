import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  groupVisitorErrors,
  parseVisitorError,
  scrubVisitorMessage,
  visitorErrorHash,
  visitorErrorSpikes,
  type VisitorErrorRow,
} from "@/lib/visitor-errors";
import { handleVisitorErrorRequest, resetVisitorErrorRateLimit } from "@/lib/visitor-errors.server";

const ORG = "11111111-2222-4333-8444-555555555555";
const body = (extra: Record<string, unknown> = {}) => JSON.stringify({ o: ORG, k: "js", m: "x is not a function", p: "/about?utm=1", ...extra });
const req = (text: string) => new Request("https://x.test/api/public/visitor-errors", { method: "POST", body: text, headers: { "cf-connecting-ip": "1.2.3.4" } });

describe("visitor error parsing and privacy", () => {
  it("scrubs emails, phones, query strings", () => {
    const m = scrubVisitorMessage("Failed for jo@x.com call 919-555-0100 at https://a.com/p?token=abc");
    expect(m).not.toMatch(/jo@x\.com|555-0100|token/);
  });
  it("keeps only kind, message and path (no query)", () => {
    const r = parseVisitorError(body());
    expect(r).toEqual({ organizationId: ORG, kind: "js", message: "x is not a function", path: "/about" });
  });
  it("rejects bad org, kind, empty and oversized bodies", () => {
    expect(parseVisitorError(body({ o: "nope" }))).toBeNull();
    expect(parseVisitorError(body({ k: "other" }))).toBeNull();
    expect(parseVisitorError(body({ m: "" }))).toBeNull();
    expect(parseVisitorError("x".repeat(2000))).toBeNull();
  });
  it("hash groups the same message and splits kinds", () => {
    expect(visitorErrorHash("js", "A")).toBe(visitorErrorHash("js", "a"));
    expect(visitorErrorHash("js", "a")).not.toBe(visitorErrorHash("image", "a"));
  });
});

describe("grouping and spikes", () => {
  const row = (day: string, occurrences: number, hash = "h1"): VisitorErrorRow => ({ day, kind: "js", message_hash: hash, message: "boom", page_path: "/", occurrences, last_seen: `${day}T10:00:00Z` });
  it("groups by message and counts today", () => {
    const g = groupVisitorErrors([row("2026-11-03", 2), row("2026-11-04", 3)], "2026-11-04");
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ total: 5, today: 3 });
  });
  it("flags a new message with enough hits and a big jump, not a steady one", () => {
    expect(visitorErrorSpikes([row("2026-11-04", 6)], "2026-11-04")).toHaveLength(1);
    expect(visitorErrorSpikes([row("2026-11-04", 2)], "2026-11-04")).toHaveLength(0);
    expect(visitorErrorSpikes([row("2026-11-03", 10), row("2026-11-04", 10)], "2026-11-04")).toHaveLength(0);
    expect(visitorErrorSpikes([row("2026-11-03", 2), row("2026-11-04", 12)], "2026-11-04")).toHaveLength(1);
  });
});

describe("endpoint", () => {
  it("stores a valid report and answers 204; storage failure still 204", async () => {
    resetVisitorErrorRateLimit();
    const rpc = vi.fn().mockResolvedValue({ data: true });
    expect((await handleVisitorErrorRequest(req(body()), { rpc } as never)).status).toBe(204);
    expect(rpc).toHaveBeenCalledWith("record_visitor_error", expect.objectContaining({ p_organization_id: ORG, p_path: "/about" }));
    const down = vi.fn().mockRejectedValue(new Error("db down"));
    expect((await handleVisitorErrorRequest(req(body({ m: "other" })), { rpc: down } as never)).status).toBe(204);
  });
  it("400 on junk, 429 on flood", async () => {
    resetVisitorErrorRateLimit();
    const rpc = vi.fn().mockResolvedValue({});
    expect((await handleVisitorErrorRequest(req("{"), { rpc } as never)).status).toBe(400);
    let last = 204;
    for (let i = 0; i < 25; i += 1) last = (await handleVisitorErrorRequest(req(body({ m: `m${i}` })), { rpc } as never)).status;
    expect(last).toBe(429);
  });
});

describe("public/ve.js", () => {
  const source = readFileSync("public/ve.js", "utf8");
  it("is under 3 KB", () => expect(Buffer.byteLength(source)).toBeLessThan(3072));
  function run(sendBeacon: unknown, fetchImpl?: unknown) {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const win: Record<string, unknown> = {};
    win["top"] = win;
    win["self"] = win;
    win["fetch"] = fetchImpl;
    const ctx = {
      window: win,
      document: { currentScript: { getAttribute: () => ORG } },
      location: { pathname: "/home", href: "https://s.test/home" },
      navigator: { sendBeacon },
      addEventListener: (t: string, f: (e: unknown) => void) => void (listeners[t] ??= []).push(f),
      URL,
      JSON,
      Date,
      String,
    };
    Object.assign(win, ctx);
    vm.runInNewContext(source, { ...ctx, window: win });
    return listeners;
  }
  it("reports a page error through sendBeacon with only o/k/m/p", () => {
    const beacon = vi.fn().mockReturnValue(true);
    const l = run(beacon);
    l["error"]![0]!({ message: "kaput", target: {} });
    expect(JSON.parse(beacon.mock.calls[0]![1])).toEqual({ o: ORG, k: "js", m: "kaput", p: "/home" });
  });
  it("never throws when the endpoint or beacon is down", () => {
    const l = run(() => {
      throw new Error("down");
    });
    expect(() => l["error"]![0]!({ message: "kaput", target: {} })).not.toThrow();
  });
});
