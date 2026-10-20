import { describe, expect, it } from "vitest";
import { JARVIS_ACTION_CLASSES, parseActions } from "./jarvis-actions";

const sample: Record<string, Record<string, unknown>> = {
  "demo.build": { businessName: "Acme Detail", industry: "detailing", city: "Raleigh", state: "NC" },
  "code.pr": { title: "t", summary: "s", changes: [{ path: "src/lib/x.ts", content: "export {}" }] },
  "claude.code": { request: "Fix the failing builder test and run the whole suite." },
  "claude.fix": { pr: 12 },
  "builds.recover": {},
  "demo.send": { organizationId: "00000000-0000-4000-8000-000000000001", channel: "email" },
  "autopilot.configure": { enabled: false },
  "autopilot.run": {},
};

describe("Jarvis action effect classes", () => {
  it("never auto-runs write or destructive actions", () => {
    for (const [id, cls] of Object.entries(JARVIS_ACTION_CLASSES)) {
      if (cls.effect !== "read") expect(cls.autoRuns, id).toBe(false);
    }
  });

  it("routes every write/destructive action to a proposal, never a read", () => {
    for (const [id, cls] of Object.entries(JARVIS_ACTION_CLASSES)) {
      if (cls.effect === "read") continue;
      const parsed = parseActions([{ id, args: sample[id] ?? {} }], []);
      expect(parsed.reads.map((r) => r.id), id).not.toContain(id);
      const ids: string[] = parsed.proposals.map((p) => p.id);
      expect(parsed.rejected.length ? [...ids, id] : ids, id).toContain(id);
    }
  });

  it("rejects unclassified actions such as SQL, publish or billing", () => {
    for (const id of ["sql.run", "site.publish", "billing.charge", "roles.grant"]) {
      const parsed = parseActions([{ id, args: {} }], []);
      expect(parsed.reads).toHaveLength(0);
      expect(parsed.proposals).toHaveLength(0);
      expect(JARVIS_ACTION_CLASSES).not.toHaveProperty(id);
    }
  });

  it("classifies email sending and build recovery as consequential", () => {
    expect(JARVIS_ACTION_CLASSES["demo.send"]).toMatchObject({ effect: "write", external: true });
    expect(JARVIS_ACTION_CLASSES["builds.recover"].effect).toBe("destructive");
  });
});
