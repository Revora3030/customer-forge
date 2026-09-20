/**
 * REGRESSION: a website that has not been launched yet must never be treated as
 * broken.
 *
 * An unpublished site answers 404 on its public address by design. The checker
 * used to read that as a critical fault on every page, which made the apply
 * stage reverse every good change an owner made before launch — the builder
 * appeared to fail at everything. A draft is checked through its own private
 * draft render instead, and the public address is only ever critical once the
 * site is genuinely published.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const revoked: string[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: () => ({
        select: () => ({ maybeSingle: async () => ({ data: { id: "link-1" }, error: null }) }),
      }),
      update: () => ({
        eq: async (_column: string, value: string) => {
          revoked.push(value);
          return { error: null };
        },
      }),
    }),
  },
}));

/** Minimal stand-in for the caller's own authorised client. */
function client(publishState: string) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "organizations"
                ? { slug: "demo-co", name: "Demo Co" }
                : { publish_state: publishState },
          }),
          eq: () => ({
            order: async () => ({
              data: [
                { slug: "", title: "Home", kind: "home", is_visible: true, sort_order: 0 },
                { slug: "services", title: "Services", kind: "page", is_visible: true, sort_order: 1 },
              ],
            }),
          }),
        }),
      }),
    }),
  };
}

const DRAFT_HTML =
  "<html><head><title>Demo Co</title></head><body><h1>Demo Co</h1><main><p>Real content for visitors.</p><a href='/s/demo-co/services'>Services</a></main></body></html>";

afterEach(() => {
  vi.unstubAllGlobals();
  revoked.length = 0;
});

describe("post-change website check", () => {
  it("does not fail a draft because its public address is not live yet", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      requested.push(String(url));
      // The public address of an unpublished site: 404 by design.
      if (String(url).includes("/s/")) return new Response("not found", { status: 404 });
      return new Response(DRAFT_HTML, { status: 200, headers: { "content-type": "text/html" } });
    });

    const { verifyWorkspaceSite } = await import("@/lib/agent/verify.server");
    const report = await verifyWorkspaceSite(client("draft"), "11111111-1111-4111-8111-111111111111");

    expect(report).not.toBeNull();
    // The whole point: nothing critical failed, so the apply stage keeps the
    // owner's work instead of reversing it.
    expect(report?.critical ?? 0).toBe(0);
    // It checked the private draft render, not the public address.
    expect(requested.some((url) => url.includes("/p/"))).toBe(true);
    expect(requested.some((url) => url.includes("/s/"))).toBe(false);
    // The temporary draft window is always closed again.
    expect(revoked).toContain("link-1");
  });

  it("still reports a real fault on a published site", async () => {
    vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));

    const { verifyWorkspaceSite } = await import("@/lib/agent/verify.server");
    const report = await verifyWorkspaceSite(
      client("published"),
      "11111111-1111-4111-8111-111111111111",
    );

    expect(report?.critical ?? 0).toBeGreaterThan(0);
  });
});
