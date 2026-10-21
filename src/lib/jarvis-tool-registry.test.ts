import { describe, expect, it } from "vitest";
import {
  getJarvisDiagnosticTool,
  getJarvisDiagnosticToolCatalog,
  isJarvisDiagnosticToolId,
  JARVIS_DIAGNOSTIC_TOOLS,
} from "./jarvis-tool-registry";

describe("Jarvis diagnostic tool registry", () => {
  it("contains uniquely named, bounded, read-only tools only", () => {
    const ids = JARVIS_DIAGNOSTIC_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tool of JARVIS_DIAGNOSTIC_TOOLS) {
      expect(tool.id).toMatch(/^[a-z][a-z0-9_.-]{2,100}$/);
      expect(tool.access).toBe("read");
      expect(tool.risk).toBe("low");
      expect(tool.requiresApproval).toBe(false);
      expect(tool.timeoutMs).toBeGreaterThan(0);
      expect(tool.timeoutMs).toBeLessThanOrEqual(tool.id === "website.browser.check" ? 45000 : 30000);
      expect(tool.maxOutputBytes).toBeGreaterThan(0);
      expect(tool.maxOutputBytes).toBeLessThanOrEqual(30000);
    }
  });

  it("rejects unknown or model-invented tool identifiers", () => {
    expect(isJarvisDiagnosticToolId("platform.errors.summary")).toBe(true);
    expect(isJarvisDiagnosticToolId("shell.exec")).toBe(false);
    expect(isJarvisDiagnosticToolId("database.run_sql")).toBe(false);
    expect(isJarvisDiagnosticToolId("")).toBe(false);
    expect(isJarvisDiagnosticToolId(null)).toBe(false);
    expect(getJarvisDiagnosticTool("email.send")).toBeNull();
  });

  it("registers an evidence-backed capability scorecard as read-only", () => {
    expect(isJarvisDiagnosticToolId("jarvis.capabilities.scorecard")).toBe(true);
    expect(getJarvisDiagnosticTool("jarvis.capabilities.scorecard")).toMatchObject({
      access: "read",
      risk: "low",
      requiresApproval: false,
      implementation: "implemented",
    });
  });

  it("marks security evidence honestly as partial", () => {
    expect(getJarvisDiagnosticTool("security.posture.summary")).toMatchObject({
      implementation: "partial",
      access: "read",
      evidence: expect.stringContaining("Partial evidence only"),
    });
  });

  it("returns safe catalog metadata without credential fields", () => {
    const catalog = getJarvisDiagnosticToolCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(catalog)).not.toMatch(/api[_-]?key|secret[_-]?value|service[_-]?role/i);
  });
});
