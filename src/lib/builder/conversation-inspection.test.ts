import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectRepository, redactInspectionSource, safeInspectionPath } from "./repository-inspection.server";

afterEach(() => vi.unstubAllGlobals());
describe("repository inspection boundaries", () => {
  it("allows source and migration paths but rejects secrets, traversal and generated types", () => {
    expect(safeInspectionPath("src/lib/agent/verify.server.ts")).toBe(true);
    expect(safeInspectionPath("supabase/migrations/example.sql")).toBe(true);
    for (const path of [".env", "src/.env.json", "src/../secrets.json", "src/%2e%2e/private.ts", "src/file.ts?token=x", "src/file\0.ts", "src/integrations/supabase/types.ts", "private/key.pem"]) expect(safeInspectionPath(path)).toBe(false);
  });
  it("does not contact GitHub for an unverified administrator", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await inspectRepository(false, "inspect all source")).toMatchObject({ status: "not_authorized", inspected: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("redacts recognizable credential values without exposing them in excerpts", () => {
    const value = ["sk", "x".repeat(30)].join("-");
    expect(redactInspectionSource(`const credential = '${value}';`)).not.toContain(value);
    expect(redactInspectionSource('password = "private-value"')).not.toContain("private-value");
    expect(redactInspectionSource("const title = 'Services';")).toContain("Services");
  });
});
describe("chat inspection integration contract", () => {
  const conversation = readFileSync(new URL("./conversation.server.ts", import.meta.url), "utf8");
  const inspection = readFileSync(new URL("./conversation-inspection.server.ts", import.meta.url), "utf8");
  it("collects inspection evidence before asking a model", () => {
    expect(conversation.indexOf("await inspectConversation(input)")).toBeLessThan(conversation.indexOf("await gatewayChatText"));
    expect(conversation).not.toContain("Never say you lack access");
    expect(conversation).not.toContain("the change is applied to the live site immediately");
  });
  it("checks identity and workspace access without using a service-role client", () => {
    expect(inspection).toContain("getClaims");
    expect(inspection).toContain("claims?.claims?.sub !== input.userId");
    expect(inspection).toContain("orgRole(client, input.organizationId, input.userId)");
    expect(inspection).not.toContain("supabaseAdmin");
    expect(inspection).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
  it("keeps rendering coverage and missing evidence explicit", () => {
    expect(inspection).toContain("allVisiblePagesInspected");
    expect(inspection).toContain("maxPages: 8");
    expect(inspection).toContain('redirect: "manual"');
    expect(conversation).toContain("Evidence serialization truncated");
    expect(conversation).toContain("Do not promise immediate live publication");
  });
});
