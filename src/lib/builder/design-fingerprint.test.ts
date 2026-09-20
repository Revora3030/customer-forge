import { describe, expect, it } from "vitest";
import {
  createDesignFingerprint,
  fingerprintBrief,
  fingerprintVocabularySize,
  readDesignFingerprint,
  rejectStyle,
  writeDesignFingerprint,
} from "./design-fingerprint";

const base = { businessName: "Harbour Plumbing", industry: "home_services", city: "Bristol" };

describe("design fingerprint", () => {
  it("is deterministic for the same business", () => {
    expect(createDesignFingerprint(base)).toEqual(createDesignFingerprint(base));
  });

  it("gives two businesses in the same industry different designs", () => {
    const a = createDesignFingerprint(base);
    const b = createDesignFingerprint({ ...base, businessName: "Kingsway Plumbing" });
    const differences = [
      a.heroComposition !== b.heroComposition,
      a.backgroundSystem !== b.backgroundSystem,
      a.sectionRhythm !== b.sectionRhythm,
      a.cardSystem !== b.cardSystem,
      a.typeSystem !== b.typeSystem,
      a.colorSystem !== b.colorSystem,
    ].filter(Boolean).length;
    expect(differences).toBeGreaterThanOrEqual(3);
  });

  it("re-rolls when the revision changes", () => {
    expect(createDesignFingerprint({ ...base, revision: 2 }).id).not.toBe(createDesignFingerprint(base).id);
  });

  it("never selects a rejected style", () => {
    const first = createDesignFingerprint(base);
    const second = createDesignFingerprint(base, [first.backgroundSystem]);
    expect(second.backgroundSystem).not.toBe(first.backgroundSystem);
  });

  it("avoids photo-led hero compositions when no photos exist", () => {
    const fingerprint = createDesignFingerprint({ ...base, photoCount: 0 });
    expect(fingerprint.heroComposition).not.toMatch(/media|full-bleed/);
    expect(fingerprint.decorativeSystem).not.toBe("none");
  });

  it("describes artwork honestly when there are no photos", () => {
    expect(createDesignFingerprint({ ...base, photoCount: 0 }).artDirection.subject).toMatch(/depicts nothing/i);
  });

  it("offers a very large design vocabulary", () => {
    expect(fingerprintVocabularySize()).toBeGreaterThan(1_000_000_000);
  });

  it("round-trips through the website settings blob without losing other keys", () => {
    const fingerprint = createDesignFingerprint(base);
    const blob = writeDesignFingerprint({ existing: true }, fingerprint);
    expect(blob["existing"]).toBe(true);
    expect(readDesignFingerprint(blob)?.id).toBe(fingerprint.id);
  });

  it("ignores a malformed stored fingerprint", () => {
    expect(readDesignFingerprint({ designFingerprint: { id: 1 } })).toBeNull();
    expect(readDesignFingerprint(null)).toBeNull();
  });

  it("records rejected styles once", () => {
    const fingerprint = rejectStyle(rejectStyle(createDesignFingerprint(base), "Brutalist"), "brutalist");
    expect(fingerprint.rejected.filter((style) => style === "brutalist")).toHaveLength(1);
  });

  it("writes a brief the planner can follow", () => {
    const brief = fingerprintBrief(createDesignFingerprint(base));
    expect(brief).toMatch(/Design identity already established/);
    expect(brief).toMatch(/Hero composition/);
  });
});
