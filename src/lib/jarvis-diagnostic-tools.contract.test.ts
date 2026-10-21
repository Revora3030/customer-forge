import { describe, expect, it } from "vitest";
import { JARVIS_DIAGNOSTIC_TOOLS, getJarvisDiagnosticTool, isJarvisDiagnosticToolId } from "./jarvis-tool-registry";

describe("Jarvis read-only diagnostic coverage contract", () => {
  it("registers the eight requested diagnostic families plus security-gap reporting", () => {
    const ids = new Set(JARVIS_DIAGNOSTIC_TOOLS.map((tool) => tool.id));
    for (const id of [
      "platform.errors.summary",
      "builder.health.summary",
      "database.contracts.probe",
      "website.public.seo-smoke",
      "ai.providers.snapshot",
      "connectors.permissions.snapshot",
      "growth.funnel.summary",
      "release.ci.evidence",
      "security.posture.summary",
    ]) expect(ids.has(id as never)).toBe(true);
  });

  it("keeps every tool strictly read-only and bounded", () => {
    for (const tool of JARVIS_DIAGNOSTIC_TOOLS) {
      expect(tool.access).toBe("read");
      expect(tool.requiresApproval).toBe(false);
      expect(tool.maxOutputBytes).toBeLessThanOrEqual(12000);
      expect(tool.timeoutMs).toBeLessThanOrEqual(tool.id === "website.lighthouse.audit" ? 60000 : tool.id === "website.browser.check" ? 45000 : 15000);
    }
  });

  it("does not register generic execution primitives", () => {
    expect(isJarvisDiagnosticToolId("sql.execute")).toBe(false);
    expect(isJarvisDiagnosticToolId("shell.run")).toBe(false);
    expect(isJarvisDiagnosticToolId("http.fetch")).toBe(false);
    expect(isJarvisDiagnosticToolId("github.commit")).toBe(false);
    expect(getJarvisDiagnosticTool("stripe.refund")).toBeNull();
    expect(getJarvisDiagnosticTool("publishing.publish")).toBeNull();
  });
});
