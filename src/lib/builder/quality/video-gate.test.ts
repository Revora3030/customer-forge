import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MAX_RETRIES, applyRegeneration, planRegeneration, runVideoGate, type GateAttempt, type RegenerateFn } from "@/lib/builder/quality/video-gate";
import { VIDEO_BAR, scoreVideoBar } from "@/lib/builder/quality/video-score";
import { badSite, blueprintFor, goodSite } from "@/lib/builder/quality/video-score.fixtures";

const bp = blueprintFor("golf course");
const good = () => goodSite(bp);

/** A site that is good except the signature tool and the lead section are missing entirely. */
function missingParts() {
  const input = good();
  input.site.sections = input.site.sections.filter((s) => s.id !== "tool" && s.id !== "lead");
  return input;
}

/** A regeneration that returns the blueprint-built sections, standing in for the model. */
const fixer = (): RegenerateFn => vi.fn(async () => ({ sections: good().site.sections, theme: good().site.theme }));

describe("video gate", () => {
  it("passes a good site on the first attempt without regenerating", async () => {
    const regenerate = fixer();
    const r = await runVideoGate({ ...good(), regenerate });
    expect(r.passed).toBe(true);
    expect(r.attempts).toHaveLength(1);
    expect(r.retriesUsed).toBe(0);
    expect(regenerate).not.toHaveBeenCalled();
    expect(r.ownerFixes).toEqual([]);
  });

  it("regenerates only the failing parts and keeps every part that passed", async () => {
    const input = missingParts();
    expect(scoreVideoBar(input).passed).toBe(false);
    const before = input.site.sections.map((s) => s);
    const regenerate = fixer();
    const r = await runVideoGate({ ...input, regenerate });
    expect(r.passed).toBe(true);
    expect(r.retriesUsed).toBe(1);
    expect(r.attempts).toHaveLength(2);
    expect(r.attempts[0]!.failures.map((f) => f.criterion)).toEqual(expect.arrayContaining(["signature_tool", "lead_capture"]));
    expect(r.attempts[0]!.capped).toBe("no_lead_capture");
    // passed sections are the very same objects, not rewritten
    for (const s of before) expect(r.site.sections).toContain(s);
    expect(r.site.sections.map((s) => s.id)).toEqual(expect.arrayContaining(["tool", "lead"]));
  });

  it("routes layout to the design role, copy to the primary role, and checks to the cheap role", async () => {
    const calls: { group: string; role: string }[] = [];
    const spy: RegenerateFn = async (req) => { calls.push({ group: req.group, role: req.role }); return { sections: good().site.sections }; };

    const layout = await runVideoGate({ ...missingParts(), env: {}, regenerate: spy });
    expect(layout.attempts[0]!.roles.check).toBe("fast");
    expect(calls).toEqual([{ group: "layout", role: "design" }]);

    calls.length = 0;
    const input = good();
    input.site.sections[3]!.heading = "4.9 stars from 312 reviews";
    await runVideoGate({ ...input, env: {}, regenerate: spy });
    expect(calls[0]).toEqual({ group: "copy", role: "primary" });
  });

  it("a QP_STEP_ROLE override changes the role without code changes", async () => {
    const seen: string[] = [];
    await runVideoGate({ ...missingParts(), env: { QP_STEP_ROLE_LAYOUT: "coding" }, regenerate: async (r) => { seen.push(r.role); return { sections: [] }; }, maxRetries: 1 });
    expect(seen[0]).toBe("coding");
  });

  it("stops after two retries, records every attempt and says what is still wrong", async () => {
    const regenerate = vi.fn(async () => ({ sections: [] }));
    const recorded: GateAttempt[] = [];
    const r = await runVideoGate({ ...badSite(bp), regenerate, record: (a) => void recorded.push(a) });
    expect(DEFAULT_MAX_RETRIES).toBe(2);
    expect(r.passed).toBe(false);
    expect(r.attempts).toHaveLength(3);
    expect(r.retriesUsed).toBe(2);
    expect(recorded).toHaveLength(3);
    expect(recorded.map((a) => a.attempt)).toEqual([0, 1, 2]);
    expect(recorded[2]!.regenerated).toEqual([]);
    expect(r.needsHuman.map((f) => f.criterion)).toEqual(expect.arrayContaining(["truth_facts", "lead_capture"]));
    expect(r.ownerFixes.length).toBeGreaterThan(0);
    expect(r.bar).toBe(VIDEO_BAR);
  });

  it("never returns a version worse than the best it saw", async () => {
    const input = missingParts();
    const baseScore = scoreVideoBar(input).score;
    const regenerate: RegenerateFn = async (req) => ({
      sections: [{ id: "tool", pageSlug: "home", kind: "composition", heading: "Welcome to our website \u2014 4.9 stars", composition: { type: "text", text: "Call (212) 555-0188" } }],
      theme: { fonts: ["Inter", "Poppins", "Roboto"] },
    });
    const r = await runVideoGate({ ...input, regenerate, maxRetries: 1 });
    expect(r.score).toBeGreaterThanOrEqual(baseScore);
  });

  it("a regeneration that throws is recorded and ends the loop", async () => {
    const recorded: GateAttempt[] = [];
    const r = await runVideoGate({ ...badSite(bp), regenerate: async () => { throw new Error("model unavailable"); }, record: (a) => void recorded.push(a) });
    expect(r.passed).toBe(false);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.error).toBe("model unavailable");
    expect(r.retriesUsed).toBe(0);
  });

  it("honours maxRetries 0 and caps absurd values", async () => {
    const none = vi.fn(async () => ({ sections: [] }));
    expect((await runVideoGate({ ...badSite(bp), regenerate: none, maxRetries: 0 })).attempts).toHaveLength(1);
    expect(none).not.toHaveBeenCalled();
    const many = await runVideoGate({ ...badSite(bp), regenerate: async () => ({ sections: [] }), maxRetries: 999 });
    expect(many.attempts.length).toBeLessThanOrEqual(6);
  });

  it("planRegeneration names sections, missing parts and instructions, and applyRegeneration ignores unrequested sections", () => {
    const input = missingParts();
    const score = scoreVideoBar(input);
    const plan = planRegeneration(score, 0, {});
    const layout = plan.find((p) => p.group === "layout")!;
    expect(layout.missing).toEqual(expect.arrayContaining(["signature-tool", "lead"]));
    expect(layout.instructions.length).toBeGreaterThan(0);
    const hero = good().site.sections[0]!;
    const tampered = { ...hero, heading: "Tampered" };
    const next = applyRegeneration(input.site, layout, { sections: [tampered] });
    expect(next.sections[0]!.heading).toBe(input.site.sections[0]!.heading);
  });
});
