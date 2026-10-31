import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_NOT_LIVE_MESSAGE } from "@/lib/site-submission-gate";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const chain = {
      middleware: () => chain,
      validator: (fn: typeof validate) => {
        validate = fn;
        return chain;
      },
      handler: (...args: unknown[]) => {
        const fn = args.at(-1) as (input: unknown) => Promise<unknown>;
        return async (input: { data: unknown }) => fn({ ...input, data: validate(input.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://example.test/s/fixture", {
      headers: { "user-agent": "Mozilla/5.0 fixture" },
    }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

const ORG = "11111111-1111-4111-8111-111111111111";
const db = vi.hoisted(() => ({
  org: null as Record<string, unknown> | null,
  settings: null as Record<string, unknown> | null,
  rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => {
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({
        data:
          table === "organizations" ? db.org : table === "website_settings" ? db.settings : null,
        error: null,
      }),
    };
    return chain;
  };
  return { supabaseAdmin: { from, rpc: db.rpc } };
});

async function submit(data: Record<string, unknown>) {
  const path = "./public-site.functions.ts?server-fn-module-lookup";
  const module = await import(/* @vite-ignore */ path);
  return (module["submitPublicLead"] as (input: { data: unknown }) => Promise<unknown>)({ data });
}
const LEAD = {
  slug: "fixture",
  kind: "contact",
  name: "Fixture Person",
  email: "fixture@example.test",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.org = { id: ORG, name: "Fixture", is_demo: false };
  db.settings = null;
  db.rpc.mockResolvedValue({ data: null, error: { message: "unexpected rpc in this fixture" } });
});

describe("submitPublicLead on a site that isn't live", () => {
  it("answers a workspace with no website_settings row with the not-live message, before any database write", async () => {
    await expect(submit(LEAD)).rejects.toThrow(SITE_NOT_LIVE_MESSAGE);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("answers a site the owner took offline the same way", async () => {
    db.settings = { published: false, publish_state: "unpublished" };
    await expect(submit(LEAD)).rejects.toThrow(SITE_NOT_LIVE_MESSAGE);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("lets a draft site through to the abuse gate and the database (rate limits still apply)", async () => {
    db.settings = { published: false, publish_state: "draft" };
    await expect(submit(LEAD)).rejects.toThrow("We couldn't save your request");
    expect(db.rpc).toHaveBeenCalledWith("register_public_submission_attempt", expect.anything());
  });
  it("maps the database's own ORG_NOT_PUBLIC refusal to the same message", async () => {
    db.settings = { published: true, publish_state: "published" };
    db.rpc.mockImplementation(async (name: string) =>
      name === "register_public_submission_attempt"
        ? { data: { allowed: true }, error: null }
        : { data: null, error: { message: "ORG_NOT_PUBLIC" } },
    );
    await expect(submit(LEAD)).rejects.toThrow(SITE_NOT_LIVE_MESSAGE);
    expect(db.rpc).toHaveBeenCalledWith("submit_public_conversion", expect.anything());
  });
  it("lets a demo workspace through the pre-check (the database decides)", async () => {
    db.org = { id: ORG, name: "Fixture", is_demo: true };
    await expect(submit(LEAD)).rejects.toThrow("We couldn't save your request");
    expect(db.rpc).toHaveBeenCalledWith("register_public_submission_attempt", expect.anything());
  });
});
