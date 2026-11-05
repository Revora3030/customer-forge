import { describe, expect, it } from "vitest";
import { helpTools } from "./help";
import type { ToolContextV2 } from "@/lib/ai/tool-registry-v2.server";

const context = {
  supabase: {} as never,
  userId: "u",
  organizationId: "11111111-1111-4111-8111-111111111111",
  isSuperAdmin: false,
  runId: "22222222-2222-4222-8222-222222222222",
  stepId: "33333333-3333-4333-8333-333333333333",
} as unknown as ToolContextV2;

describe("help.lookup", () => {
  const tool = helpTools().find((t) => t.name === "help.lookup")!;

  it("is a read / owner tool with no workspace key", () => {
    expect(tool.risk).toBe("read");
    expect(tool.scope).toBe("owner");
    expect(tool.schema.safeParse({ organizationId: "x" }).success).toBe(false);
    expect(tool.schema.safeParse({ query: "billing" }).success).toBe(true);
  });

  it("returns citeable /help paths for billing", async () => {
    const out = (await tool.run(tool.schema.parse({ query: "billing" }), context)) as {
      count: number;
      articles: Array<{ path: string; slug: string }>;
    };
    expect(out.count).toBeGreaterThan(0);
    expect(out.articles[0]?.path).toBe("/help/billing");
    expect(out.articles[0]?.slug).toBe("billing");
  });

  it("returns empty when nothing matches", async () => {
    const out = (await tool.run(tool.schema.parse({ query: "zzzz-not-a-topic" }), context)) as {
      count: number;
      articles: unknown[];
    };
    expect(out.count).toBe(0);
    expect(out.articles).toEqual([]);
  });
});
