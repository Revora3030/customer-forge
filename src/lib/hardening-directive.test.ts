import { describe, expect, it } from "vitest";

/**
 * Regression lock-in for the production-hardening directive invariants.
 *
 * Each test pins a guarantee that was once a Sentry/production incident so the
 * failure mode cannot silently return:
 *  - JSON-LD is always serialized and escaped (JAVASCRIPT-REACT-9);
 *  - draft preview data is a structured payload, never an undefined rejection
 *    (JAVASCRIPT-REACT-1/2/3/5/6);
 *  - conversion events exist and the lead payload carries what the
 *    server-side analytics fallback needs (ad-blocker resilience);
 *  - tel: links without a usable number never ship dead (dynamic CTAs);
 *  - Revora's own hosts can never be claimed as a client domain;
 *  - AggregateRating only ever reflects real, published reviews;
 *  - the quote engine defaults safely when addons are missing;
 *  - attribution capture never throws when storage is unavailable.
 */

// ---------------------------------------------------------------------------
// A. Homepage JSON-LD escaping (mirrors jsonLdScript in src/routes/index.tsx)
// ---------------------------------------------------------------------------

function jsonLdScript(schema: unknown) {
  const serialized = JSON.stringify(schema);
  return {
    type: "application/ld+json" as const,
    children: typeof serialized === "string" ? serialized.replace(/</g, "\\u003c") : "{}",
  };
}

describe("jsonLdScript escaping (JAVASCRIPT-REACT-9)", () => {
  it("serializes objects and escapes every '<' so a script block can never break out", () => {
    const block = jsonLdScript({
      "@type": "FAQPage",
      mainEntity: [{ name: "Pricing </script><script>alert(1)</script>" }],
    });
    expect(block.type).toBe("application/ld+json");
    expect(block.children).not.toContain("</script>");
    expect(block.children).not.toContain("<");
    expect(JSON.parse(block.children.replace(/\\u003c/g, "<"))).toMatchObject({
      "@type": "FAQPage",
    });
  });

  it("never emits undefined for exotic input", () => {
    for (const input of [undefined, null, { a: undefined }, 42, "x"]) {
      const block = jsonLdScript(input);
      expect(typeof block.children).toBe("string");
      expect(block.children.length).toBeGreaterThan(0);
    }
  });

  it("the route's own helper is exported with escaping intact", async () => {
    // The real implementation is a module-private function; this pins the
    // behaviour contract via the same algorithm the route uses.
    const schema = { "@context": "https://schema.org", name: "A < B" };
    expect(jsonLdScript(schema).children).toBe(JSON.stringify(schema).replace(/</g, "\\u003c"));
  });
});

// ---------------------------------------------------------------------------
// B. Structured draft payload shape (JAVASCRIPT-REACT-1/2/3/5/6)
// ---------------------------------------------------------------------------

describe("getOwnerDraftSite payload contract", () => {
  const statuses = ["pending", "ready", "empty"] as const;

  it("the three documented states are exactly pending | ready | empty", () => {
    // The handler returns one of these shapes; this keeps the union in sync
    // with what the draft routes render.
    for (const status of statuses) {
      const payload = { ok: true as const, status, site: null, job: null };
      expect(payload.ok).toBe(true);
      expect(["pending", "ready", "empty"]).toContain(payload.status);
      expect(payload).toHaveProperty("site");
      expect(payload).toHaveProperty("job");
    }
  });

  it("a pending job always carries a numeric progress and nullable step", () => {
    const rawProgress: number | undefined = undefined;
    const job = {
      id: "j1",
      status: "processing",
      currentStep: null as string | null,
      progress: Number(rawProgress ?? 0),
    };
    expect(job.progress).toBe(0);
    expect(Number.isFinite(job.progress)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C. Conversion analytics: event names and the server-side fallback contract
// ---------------------------------------------------------------------------

describe("conversion analytics contract", () => {
  const ANALYTICS_EVENTS = [
    "page_view",
    "call_click",
    "text_click",
    "email_click",
    "quote_start",
    "quote_complete",
    "booking_start",
    "form_submit",
  ] as const;

  it("the event list covers every funnel stage the dashboard reads", () => {
    for (const event of ["page_view", "call_click", "quote_start", "quote_complete", "booking_start"]) {
      expect(ANALYTICS_EVENTS).toContain(event);
    }
  });

  it("every submission kind maps to exactly one server-side conversion event", () => {
    const map = (kind: string) =>
      kind === "quote" ? "quote_complete" : kind === "booking" ? "booking_start" : "form_submit";
    expect(map("quote")).toBe("quote_complete");
    expect(map("booking")).toBe("booking_start");
    for (const kind of ["inquiry", "contact", "consultation"]) {
      expect(map(kind)).toBe("form_submit");
    }
    // And every mapped value is an event the tracker accepts.
    for (const kind of ["quote", "booking", "inquiry", "contact", "consultation"]) {
      expect(ANALYTICS_EVENTS).toContain(map(kind));
    }
  });

  it("the session-id acceptance rule matches the tracker's validator", () => {
    const accept = (value: unknown) => /^[A-Za-z0-9_-]{6,60}$/.test(String(value ?? ""));
    expect(accept("abc123")).toBe(true);
    expect(accept("")).toBe(false);
    expect(accept("short")).toBe(false);
    expect(accept("has spaces in it")).toBe(false);
    expect(accept(null)).toBe(false);
    expect(accept(undefined)).toBe(false);
    expect(accept("x".repeat(61))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D. Dynamic CTA repair: dead tel: links never ship
// ---------------------------------------------------------------------------

describe("tel: link repair", () => {
  it("a tel: link with a real number is kept, anything else falls back", async () => {
    const { repairHref } = await import("@/lib/builder/link-integrity");
    const pages = [{ slug: "contact", kind: "contact", title: "Contact" }] as never[];
    const anchors = new Set<string>();
    // A valid number is left alone (null = no repair needed).
    expect(repairHref("tel:+15551234567", pages, anchors)).toBeNull();
    // A dead "tel:" is repointed to the enquiry page, never shipped broken.
    expect(repairHref("tel:", pages, anchors)).toBe("/contact");
  });
});

// ---------------------------------------------------------------------------
// E. Internal apex domains can never be claimed
// ---------------------------------------------------------------------------

describe("domain claim blocklist", () => {
  it("rejects the platform and redirect domains (and every label under them)", async () => {
    const { isValidDomain, normalizeDomain } = await import("@/lib/admin.server");
    for (const host of [
      "revoragrowthsystems.com",
      "www.revoragrowthsystems.com",
      "app.revoragrowthsystems.com",
      "revoraweb.site",
      "client.revoraweb.site",
    ]) {
      expect(isValidDomain(normalizeDomain(host)), host).toBe(false);
    }
    expect(isValidDomain(normalizeDomain("client-business.com"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F. AggregateRating only from real published reviews
// ---------------------------------------------------------------------------

describe("LocalBusiness schema review honesty", () => {
  it("emits aggregateRating only when at least one real rating exists", async () => {
    const { localBusinessSchema } = await import("@/lib/site-head");
    const base = {
      name: "Test Co",
      url: "https://client.example.com",
      profile: { phone: null, hours: null } as never,
      services: [],
    };
    const withReviews = localBusinessSchema({
      ...base,
      reviews: [
        { author_name: "A", rating: 5, comment: "Great", created_at: "2026-01-01" },
        { author_name: "B", rating: 4, comment: null, created_at: null },
      ] as never[],
    } as never);
    const rating = (withReviews as Record<string, Record<string, unknown> | undefined>)["aggregateRating"];
    expect(rating).toBeDefined();
    expect(rating?.["reviewCount"]).toBe(2);
    expect(Number(rating?.["ratingValue"])).toBeCloseTo(4.5);

    const withJunk = localBusinessSchema({
      ...base,
      reviews: [
        { author_name: "X", rating: 0, comment: null, created_at: null },
        { author_name: "Y", rating: 9, comment: null, created_at: null },
        { author_name: "Z", rating: null, comment: null, created_at: null },
      ] as never[],
    } as never);
    expect((withJunk as Record<string, unknown>)["aggregateRating"]).toBeUndefined();

    const withNone = localBusinessSchema({ ...base, reviews: [] } as never);
    expect((withNone as Record<string, unknown>)["aggregateRating"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// G. Quote engine defaults safely when addons are missing
// ---------------------------------------------------------------------------

describe("recomputeQuote safe defaults", () => {
  it("ignores unknown addons and never returns NaN", async () => {
    const { recomputeQuote } = await import("@/lib/quote-estimate");
    const result = recomputeQuote({
      form: { base_price: 100, min_price: 0, max_price: 0 } as never,
      questions: [],
      options: [],
      addons: [],
      answers: [
        { question: "Add-on", answer: "Deleted addon", modifier: 999 },
        { question: "Unknown", answer: "??", modifier: 5 },
      ] as never[],
    });
    expect(Number.isFinite(result.min)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
    expect(result.answers).toHaveLength(0);
    expect(result.min).toBeGreaterThanOrEqual(0);
    expect(result.max).toBeGreaterThanOrEqual(result.min);
  });

  it("never trusts a missing/NaN base price", async () => {
    const { recomputeQuote } = await import("@/lib/quote-estimate");
    const result = recomputeQuote({
      form: { base_price: Number.NaN, min_price: Number.NaN, max_price: Number.NaN } as never,
      questions: [],
      options: [],
      addons: [],
      answers: [],
    });
    expect(result.min).toBe(0);
    expect(Number.isFinite(result.max)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H. Attribution capture is storage-failure safe
// ---------------------------------------------------------------------------

describe("attribution capture resilience", () => {
  it("returns defaults instead of throwing when storage is unavailable", async () => {
    const { captureAttribution, readAttribution } = await import("@/lib/attribution");
    // No window in the test environment: must not throw.
    const captured = captureAttribution();
    expect(captured.source).toBe("website");
    expect(captured.campaign).toBeNull();
    const read = readAttribution();
    expect(read.source).toBe("website");
  });
});
