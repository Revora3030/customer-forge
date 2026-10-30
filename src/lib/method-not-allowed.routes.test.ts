import { describe, expect, it } from "vitest";
import { Route as paymentsWebhook } from "@/routes/api/public/payments/webhook";
import { Route as prospectAutopilot } from "@/routes/api/public/jobs/prospect-autopilot";
import { Route as agentActionRequests } from "@/routes/api/public/agent/action-requests";
import { Route as agentActionComplete } from "@/routes/api/public/agent/action-requests.$id.complete";
import { Route as agentProspects } from "@/routes/api/public/agent/prospects";

const routes = {
  "payments/webhook": paymentsWebhook,
  "jobs/prospect-autopilot": prospectAutopilot,
  "agent/action-requests": agentActionRequests,
  "agent/action-requests/$id/complete": agentActionComplete,
  "agent/prospects": agentProspects,
};

type Handlers = Record<string, unknown>;
const handlersOf = (route: { options: unknown }) =>
  (route.options as { server?: { handlers?: Handlers } }).server?.handlers ?? {};

describe("POST-only public API routes answer GET with 405", () => {
  for (const [name, route] of Object.entries(routes)) {
    it(`${name}: GET is 405 (Allow: POST, no-store) and POST is unchanged`, async () => {
      const handlers = handlersOf(route);
      expect(typeof handlers["POST"]).toBe("function");
      const get = handlers["GET"] as (() => Response) | undefined;
      expect(typeof get).toBe("function");
      const res = get!();
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual({ ok: false, error: "method_not_allowed" });
    });
  }
});
