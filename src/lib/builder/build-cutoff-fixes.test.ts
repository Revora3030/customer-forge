import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { keepAliveJsonResponse } from "@/lib/builder/keep-alive-response";
import { durableWorkerPath } from "@/lib/builder/durable-worker-kick.server";
import { withoutRepeatedReplies } from "@/lib/builder-memory";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const read = (path: string) => readFileSync(path, "utf8");

describe("worker connection stays open during long steps", () => {
  it("streams keep-alive spaces and still ends in parseable JSON", async () => {
    let finish: (value: unknown) => void = () => undefined;
    const work = new Promise((resolve) => (finish = resolve));
    const response = keepAliveJsonResponse(work, () => ({ error: "x" }), 5);
    await new Promise((resolve) => setTimeout(resolve, 20));
    finish({ processed: 1, failed: 0, paused: false });
    const text = await response.text();
    expect(text.startsWith(" ")).toBe(true);
    expect(JSON.parse(text)).toEqual({ processed: 1, failed: 0, paused: false });
  });

  it("reports a failed run as JSON instead of dropping the connection", async () => {
    const response = keepAliveJsonResponse(Promise.reject(new Error("boom")), () => ({ error: "Worker run failed" }), 5);
    expect(JSON.parse(await response.text())).toEqual({ error: "Worker run failed" });
  });
});

describe("the open builder page never runs the build itself", () => {
  it("the pump hands off to the database-held worker call", () => {
    const source = read("src/lib/site-engine.functions.ts");
    const pump = source.slice(source.indexOf("export const pumpSiteEngineQueue"), source.indexOf("/** AI edit assistant"));
    expect(pump).toContain("requestDurableWorkerRun");
    expect(pump).not.toContain("drainSiteEngineQueue");
  });

  it("only a real workspace id can be placed in the worker path", () => {
    expect(durableWorkerPath("1B332C6C-1C8D-4B84-A66D-E0EFD0CA0571")).toBe(
      "site-engine?organizationId=1b332c6c-1c8d-4b84-a66d-e0efd0ca0571&invoker=pg_net",
    );
    expect(() => durableWorkerPath("x&organizationId=evil")).toThrow();
  });
});

describe("one reply per request", () => {
  it("drops a waiting reply already saved for the same request", () => {
    const reply = "Got it — your AI team is finishing the first website now.";
    const kept = withoutRepeatedReplies(
      [
        { role: "assistant", content: reply, requestId: "r1" },
        { role: "assistant", content: reply, requestId: "r1" },
        { role: "assistant", content: reply, requestId: "r2" },
        { role: "user", content: "Finish build", requestId: "r1" },
      ],
      [{ role: "assistant", content: reply, requestId: "r1" }],
    );
    expect(kept).toEqual([
      { role: "assistant", content: reply, requestId: "r2" },
      { role: "user", content: "Finish build", requestId: "r1" },
    ]);
  });
});
