import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { traceOps } from "./ops-trace.server";
// Loaded up front so the span's lazy import resolves inside each test.
import "@/lib/ai/observability-export.server";

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("BRF-03 traceOps", () => {
  it("logs one line per operation and sends nothing when no collector is configured", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await traceOps("site.deploy", async () => ({ activated: false }), (r) => ({ outcome: r.activated ? "ok" : "blocked", attributes: { "revora.block_reason": "not_ready" } }));
    await flush();
    expect(result).toEqual({ activated: false });
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]![0]);
    expect(line.startsWith("[revora-trace] ")).toBe(true);
    expect(JSON.parse(line.slice("[revora-trace] ".length))).toMatchObject({ trace: "site.deploy", outcome: "blocked", "revora.block_reason": "not_ready" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rethrows the original error after recording a failed span, and exports to a configured collector", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const boom = new TypeError("secret detail owner@acme.com");
    await expect(traceOps("site.deploy", async () => { throw boom; })).rejects.toBe(boom);
    await flush();
    await flush();
    const line = String(warn.mock.calls[0]![0]);
    expect(line).toContain('"outcome":"failed"');
    expect(line).toContain('"errorType":"TypeError"');
    expect(line).not.toContain("acme");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.map((c) => String((c as unknown[])[0]))).toEqual(["http://localhost:4318/v1/traces"]);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:4318/v1/traces");
    expect(String(init.body)).toContain('"name":"site.deploy"');
    expect(String(init.body)).not.toContain("acme");
  });

  it("is wired into the build worker and the publish path", () => {
    const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
    expect(worker.match(/recordOpsSpan\(\{\s*name: "site.generate"/g)).toHaveLength(2);
    expect(readFileSync("src/lib/production.functions.ts", "utf8")).toMatch(/traceOps\(\s*"site.deploy"/);
    expect(readFileSync("src/lib/publish-records.functions.ts", "utf8")).toContain('name: "site.deploy.smoke"');
  });
});
