import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { planVersionRestore } from "@/lib/site-restore.functions";

const full = { format: 1, takenAt: "t", pages: [] };

describe("planVersionRestore", () => {
  it("restores pages and settings from a launch version", () => {
    const plan = planVersionRestore({
      generation: { a: 1 },
      seo: { headline: "h" },
      pages: { ...full, live_format: 1, settings_pages: { home: {} } },
    });
    expect(plan.full?.format).toBe(1);
    expect(plan.settings).toEqual({
      generation: { a: 1 },
      seo: { headline: "h" },
      pages: { home: {} },
    });
  });

  it("reads the nested full snapshot from saved versions and restore points", () => {
    const plan = planVersionRestore({
      generation: {},
      seo: {},
      pages: { settings_pages: null, content: { pages: [] }, full },
    });
    expect(plan.full).not.toBeNull();
    // Empty settings are never written back over the site.
    expect(plan.settings).toEqual({});
  });

  it("restores only settings from an old version without a page tree", () => {
    const plan = planVersionRestore({
      generation: { g: 1 },
      seo: {},
      pages: { settings_pages: { x: 1 }, content: { pages: [] } },
    });
    expect(plan.full).toBeNull();
    expect(plan.settings).toEqual({ generation: { g: 1 }, pages: { x: 1 } });
  });

  it("treats a legacy bare page map as the settings pages", () => {
    const plan = planVersionRestore({
      generation: {},
      seo: {},
      pages: { home: { title: "Home" } },
    });
    expect(plan.settings).toEqual({ pages: { home: { title: "Home" } } });
  });

  it("never treats a content-only summary as settings", () => {
    const plan = planVersionRestore({ generation: {}, seo: {}, pages: { pages: [{ id: "p" }] } });
    expect(plan.full).toBeNull();
    expect(plan.settings).toEqual({});
  });
});
