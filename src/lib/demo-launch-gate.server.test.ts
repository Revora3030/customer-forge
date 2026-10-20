import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assessDemoFacts,
  assessDemoForOutreach,
  contrastPairProblem,
  contrastProblems,
  gateOverridable,
  gateSummary,
  imageBlockers,
  visibleImageRefs,
  type DemoGateFacts,
} from "./demo-launch-gate.server";

const ORG = "11111111-2222-3333-4444-555555555555";
const STORAGE = "https://proj.supabase.co";
const TOKEN = "abcdefghijklmnop0123";

const legalText = Array.from({ length: 170 }, (_, index) => `word${index}`).join(" ");

/** A finished, clean demo: one home page with a hero picture from our storage and plain copy. */
function cleanFacts(overrides: Partial<DemoGateFacts> = {}): DemoGateFacts {
  return {
    found: true,
    claimed: false,
    buildStatus: "completed",
    colors: { primary: "#1d4ed8", secondary: "#ffffff", accent: null },
    heroImage: null,
    seoCopy: ["Mobile detailing in Raleigh that comes to your driveway"],
    dna: { businessName: "Triangle Detailing", city: "Raleigh", services: ["Interior detail"] },
    pages: [
      { id: "p-home", slug: "home", title: "Home", visible: true },
      { id: "p-privacy", slug: "privacy", title: "Privacy", visible: true },
    ],
    sections: [
      { id: "s-hero", pageId: "p-home", kind: "hero", visible: true, heading: "Clean cars, at your door", subheading: null, body: null, tree: null, sortOrder: 0 },
      {
        id: "s-privacy", pageId: "p-privacy", kind: "content", visible: true, heading: null, subheading: null, body: null, sortOrder: 0,
        tree: { version: 1, root: { type: "stack", children: [{ type: "text", text: legalText }] } },
      },
    ],
    components: [{ id: "c-hero", sectionId: "s-hero", kind: "image", mediaUrl: "org/hero.jpg", visible: true }],
    media: [{ url: "org/hero.jpg", source: "owner", category: "hero" }],
    services: [],
    ...overrides,
  };
}

describe("demo outreach gate: stored-site checks", () => {
  it("passes a clean, finished, unclaimed demo", () => {
    expect(assessDemoFacts(cleanFacts())).toEqual([]);
  });

  it("blocks unfinished, claimed and missing demos as safety blockers", () => {
    const blockers = assessDemoFacts(cleanFacts({ buildStatus: "processing", claimed: true }));
    expect(blockers.map((item) => item.code).sort()).toEqual(["build_not_finished", "demo_claimed"]);
    expect(blockers.every((item) => item.safety)).toBe(true);
    expect(assessDemoFacts(cleanFacts({ found: false }))).toEqual([{ code: "demo_not_found", message: expect.any(String), safety: true }]);
  });

  it("blocks an AI-generated picture shown as proof of work, but not as decoration", () => {
    const gallery = cleanFacts({
      pages: [...cleanFacts().pages, { id: "p-gallery", slug: "gallery", title: "Our work", visible: true }],
      sections: [
        ...cleanFacts().sections,
        { id: "s-gal", pageId: "p-gallery", kind: "gallery", visible: true, heading: "Recent jobs", subheading: null, body: null, tree: null, sortOrder: 0 },
      ],
      components: [...cleanFacts().components, { id: "c-gal", sectionId: "s-gal", kind: "image", mediaUrl: "org/ai.png", visible: true }],
      media: [...cleanFacts().media, { url: "org/ai.png", source: "generated", category: "other" }],
    });
    const blockers = assessDemoFacts(gallery);
    expect(blockers).toContainEqual({ code: "generated_image_as_proof", message: expect.stringContaining("gallery"), safety: true });

    const decorative = cleanFacts({ media: [{ url: "org/hero.jpg", source: "generated", category: "hero" }] });
    expect(assessDemoFacts(decorative).some((item) => item.code === "generated_image_as_proof")).toBe(false);
  });

  it("treats a generated picture in a before/after slider as proof (mediaRef resolved)", () => {
    const facts = cleanFacts({
      sections: [
        ...cleanFacts().sections,
        {
          id: "s-ba", pageId: "p-home", kind: "content", visible: true, heading: null, subheading: null, body: null, sortOrder: 2,
          tree: { version: 1, root: { type: "before_after_slider", beforeImage: { mediaRef: "c-before", alt: "", label: "Before" }, afterImage: { src: "org/after.png", alt: "", label: "After" } } },
        },
      ],
      components: [...cleanFacts().components, { id: "c-before", sectionId: "s-ba", kind: "image", mediaUrl: "org/before.png", visible: false }],
      media: [...cleanFacts().media, { url: "org/before.png", source: "generated", category: "other" }],
    });
    expect(visibleImageRefs(facts).some((item) => item.ref === "org/before.png" && item.proof)).toBe(true);
    expect(assessDemoFacts(facts).some((item) => item.code === "generated_image_as_proof")).toBe(true);
  });

  it("blocks unsupported claims in visible copy, but allows ones the business supplied", () => {
    const facts = cleanFacts({ seoCopy: ["Award-winning, fully licensed detailers with a 100% satisfaction guarantee"] });
    const reasons = assessDemoFacts(facts).filter((item) => item.code === "unsupported_claim");
    expect(reasons.length).toBeGreaterThanOrEqual(3);
    expect(reasons.every((item) => item.safety)).toBe(true);
    const supplied = cleanFacts({
      seoCopy: ["Fully licensed detailers"],
      dna: { ...cleanFacts().dna, certifications: "NC licensed" },
    });
    expect(assessDemoFacts(supplied).some((item) => item.code === "unsupported_claim")).toBe(false);
  });

  it("ignores copy on hidden sections and pages", () => {
    const facts = cleanFacts({
      sections: [
        ...cleanFacts().sections,
        { id: "s-hidden", pageId: "p-home", kind: "content", visible: false, heading: "The #1 detailer in NC", subheading: null, body: null, tree: null, sortOrder: 5 },
      ],
    });
    expect(assessDemoFacts(facts)).toEqual([]);
  });

  it("checks body, supporting and button text contrast from the stored colours", () => {
    expect(contrastProblems({ primary: "#1d4ed8", secondary: "#ffffff", accent: null })).toEqual([]);
    expect(contrastProblems({ primary: null, secondary: null, accent: null })).toEqual([]);
    expect(contrastProblems({ primary: "#f5b301", secondary: "#0b1320", accent: "#22c55e" })).toEqual([]);
    expect(contrastPairProblem("body text", "#777777", "#ffffff")).toBe("The body text contrast is 4.48:1 (needs at least 4.5:1).");
    expect(contrastPairProblem("body text", "#595959", "#ffffff")).toBeNull();
    expect(contrastPairProblem("body text", "color-mix(in oklab, #000 5%, #fff)", "#ffffff")).toMatch(/couldn't be measured/);
  });

  it("carries the launch review's blockers (placeholder legal page, priced service without inclusions)", () => {
    const facts = cleanFacts({
      sections: [
        cleanFacts().sections[0]!,
        {
          id: "s-privacy", pageId: "p-privacy", kind: "content", visible: true, heading: null, subheading: null, body: null, sortOrder: 0,
          tree: { version: 1, root: { type: "text", text: "Our privacy policy is coming soon." } },
        },
      ],
      services: [{ name: "Full detail", description: "Nice", price: 199, startingPrice: null }],
    });
    const blockers = assessDemoFacts(facts);
    expect(blockers.map((item) => item.code)).toEqual(expect.arrayContaining(["legal_placeholder", "service_without_inclusions"]));
    expect(blockers.filter((item) => ["legal_placeholder", "service_without_inclusions"].includes(item.code)).every((item) => !item.safety)).toBe(true);
    expect(gateOverridable({ ok: false, blockers })).toBe(true);
    expect(gateSummary({ ok: false, blockers })).toContain("Privacy page");
  });
});

describe("demo outreach gate: picture resolution", () => {
  const sign = async (paths: string[]) => new Map(paths.filter((path) => !path.includes("missing")).map((path) => [path, `${STORAGE}/storage/v1/object/sign/tenant-media/${path}?token=t`]));

  it("HEAD-checks signed storage URLs with a timeout and flags broken ones", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("HEAD");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(null, { status: String(url).includes("broken") ? 404 : 200, headers: { "content-type": "image/jpeg" } });
    });
    const blockers = await imageBlockers(
      [{ ref: "org/ok.jpg", page: "home" }, { ref: "org/broken.jpg", page: "services" }, { ref: "org/missing.jpg", page: "about" }],
      { fetch: fetchMock as never, storageOrigin: STORAGE, sign },
    );
    expect(blockers.map((item) => `${item.code}:${item.message.match(/the (\w+) page/)?.[1]}`).sort()).toEqual(["image_unresolved:about", "image_unresolved:services"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never fetches a picture hosted outside this project's storage", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const blockers = await imageBlockers(
      [{ ref: "https://evil.example/x.jpg", page: "home" }, { ref: "http://169.254.169.254/latest", page: "about" }, { ref: `${STORAGE}/storage/v1/object/public/a.jpg`, page: "contact" }], // DevSkim: ignore DS137138,DS162092 -- Negative fixtures: only same-origin storage is ever fetched.
      { fetch: fetchMock as never, storageOrigin: STORAGE, sign },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain(STORAGE);
    expect(blockers.filter((item) => item.code === "image_unverifiable")).toHaveLength(2);
    expect(blockers.every((item) => !item.safety)).toBe(true);
  });

  it("falls back to a one-byte GET when HEAD isn't allowed, and treats a timeout as unresolved", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "HEAD" ? new Response(null, { status: 405 }) : new Response("x", { status: 206, headers: { "content-type": "image/png" } }));
    expect(await imageBlockers([{ ref: "org/a.png", page: "home" }], { fetch: fetchMock as never, storageOrigin: STORAGE, sign })).toEqual([]);
    const timeout = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    expect((await imageBlockers([{ ref: "org/a.png", page: "home" }], { fetch: timeout as never, storageOrigin: STORAGE, sign }))[0]?.code).toBe("image_unresolved");
  });
});

type Op = { method: string; args: unknown[] };
function fakeDb(tables: Record<string, { data?: unknown; error?: { message: string } | null; count?: number }>) {
  return {
    from(table: string) {
      const ops: Op[] = [];
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte", "is", "not", "order", "limit", "in"]) builder[method] = (...args: unknown[]) => (ops.push({ method, args }), builder);
      const result = () => ({ data: null, error: null, count: null, ...(tables[table] ?? {}) });
      builder["maybeSingle"] = () => Promise.resolve(result());
      builder["then"] = (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve(result()).then(resolve, reject);
      return builder;
    },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  } as unknown as SupabaseClient;
}

describe("assessDemoForOutreach", () => {
  const marker = { kind: "prospect_demo", createdBy: "u1", createdAt: "2026-10-01T00:00:00Z", previewToken: TOKEN };
  const base = {
    website_settings: { data: { generation: { prospectDemo: marker }, seo: { headline: "Mobile detailing in Raleigh" } } },
    organizations: { data: { name: "Triangle Detailing", industry: "Auto detailing" } },
    business_profiles: { data: { city: "Raleigh", primary_color: "#1d4ed8", secondary_color: "#ffffff" } },
    generation_jobs: { data: { status: "completed" } },
    website_pages: { data: [{ id: "p1", slug: "home", title: "Home", is_visible: true }] },
    website_sections: { data: [{ id: "s1", page_id: "p1", kind: "hero", is_visible: true, settings: {}, sort_order: 0, heading: "Clean cars at your door" }] },
    website_components: { data: [{ id: "c1", section_id: "s1", kind: "image", media_url: "org/hero.jpg", is_visible: true }] },
    services: { data: [] },
    reviews: { count: 0 },
    media: { data: [{ url: "org/hero.jpg", source: "owner", category: "hero" }] },
  };

  it("passes a clean demo whose pictures resolve", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } }));
    const result = await assessDemoForOutreach(fakeDb(base), ORG, {
      fetch: fetchMock as never,
      storageOrigin: STORAGE,
      sign: async (paths) => new Map(paths.map((path) => [path, `${STORAGE}/storage/v1/object/sign/${path}`])),
    });
    expect(result).toEqual({ ok: true, blockers: [] });
  });

  it("fails closed on a storage error and for a non-demo workspace", async () => {
    const broken = await assessDemoForOutreach(fakeDb({ ...base, website_pages: { error: { message: "boom" } } }), ORG);
    expect(broken.ok).toBe(false);
    expect(broken.blockers[0]).toMatchObject({ code: "storage_error", safety: true });
    expect(gateOverridable(broken)).toBe(false);
    const notDemo = await assessDemoForOutreach(fakeDb({ ...base, website_settings: { data: { generation: {} } } }), ORG);
    expect(notDemo.blockers.map((item) => item.code)).toEqual(["demo_not_found"]);
    expect((await assessDemoForOutreach(fakeDb(base), "bad-id")).ok).toBe(false);
  });

  it("reports an unsigned picture as unresolved", async () => {
    const result = await assessDemoForOutreach(fakeDb(base), ORG, { storageOrigin: STORAGE, fetch: vi.fn() as never });
    expect(result.ok).toBe(false);
    expect(result.blockers.map((item) => item.code)).toEqual(["image_unresolved"]);
    expect(gateOverridable(result)).toBe(true);
  });
});
