import { beforeEach, describe, expect, it, vi } from "vitest";

const eqCalls: [string, unknown][] = [];
let pendingCount = 0;
const send = vi.fn(async () => ({ sent: true }));

vi.mock("@/integrations/supabase/cron-auth", () => ({ authenticateCronRequest: async () => null }));
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: send }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: async (col: string, val: unknown) => {
          eqCalls.push([col, val]);
          return { count: val === "pending" ? pendingCount : 99, error: null };
        },
      }),
    }),
  },
}));

async function run() {
  const { Route } = await import("@/routes/api/public/jobs/growth-digest");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const post = (Route.options as any).server.handlers.POST;
  return (await post({ request: new Request("http://x/api/public/jobs/growth-digest", { method: "POST" }) })).json();
}

describe("growth digest", () => {
  beforeEach(() => {
    eqCalls.length = 0;
    send.mockClear();
  });

  it("counts only items waiting for approval", async () => {
    pendingCount = 1;
    const body = await run();
    expect(eqCalls).toEqual([["status", "pending"]]);
    expect(body).toMatchObject({ sent: true, count: 1 });
    const [, , opts] = send.mock.calls[0] as unknown as [string, string, { templateData: { heading: string } }];
    expect(opts.templateData.heading).toBe("1 item waiting for your approval");
  });

  it("sends nothing when no items are waiting", async () => {
    pendingCount = 0;
    const body = await run();
    expect(body).toMatchObject({ sent: false });
    expect(send).not.toHaveBeenCalled();
  });
});
