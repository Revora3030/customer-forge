/**
 * Capability / Connection Center data, for the platform admin only.
 *
 * Reports what each capability can genuinely do right now: which provider would
 * serve it, what is missing, provider health, and whether a real call has ever
 * succeeded in this process. Credential *names* are shown; values never leave
 * the server.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CapabilitySnapshot, ProviderSnapshot } from "@/lib/integrations/capabilities";

export type IntegrationCenterData = {
  capabilities: CapabilitySnapshot[];
  providers: ProviderSnapshot[];
  summary: { ready: number; needsConnection: number; unavailable: number };
};

export const getIntegrationCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntegrationCenterData> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(
      context.supabase as unknown as Parameters<typeof assertSuperAdmin>[0],
      String(context.userId),
    );

    const { capabilitySnapshot, providerSnapshots } = await import(
      "@/lib/integrations/registry.server"
    );

    const capabilities = await capabilitySnapshot();
    const summary = {
      ready: capabilities.filter((entry) => entry.status === "ready").length,
      needsConnection: capabilities.filter((entry) => entry.status === "needs_connection").length,
      unavailable: capabilities.filter((entry) => entry.status === "unavailable").length,
    };

    return {
      capabilities,
      providers: providerSnapshots(),
      summary,
    };
  });
