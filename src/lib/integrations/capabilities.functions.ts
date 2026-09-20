/**
 * Capability / Connection Center data, for the platform admin only.
 *
 * Reports what each capability can genuinely do right now: which provider would
 * serve it, what is missing, provider health, whether a real call has ever
 * succeeded in this process, and whether free-only mode is blocking a paid
 * provider. Credential *names* are shown; values never leave the server.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CapabilitySnapshot, ProviderSnapshot } from "@/lib/integrations/capabilities";

export type IntegrationCenterData = {
  freeOnly: boolean;
  capabilities: CapabilitySnapshot[];
  providers: ProviderSnapshot[];
  summary: { ready: number; deterministic: number; needsConnection: number; unavailable: number };
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
    const { freeAiOnly } = await import("@/lib/ai/free");
    const { zeroAiCostMode } = await import("@/lib/ai/config");

    const capabilities = await capabilitySnapshot();
    const summary = {
      ready: capabilities.filter((entry) => entry.status === "ready").length,
      deterministic: capabilities.filter((entry) => entry.status === "deterministic").length,
      needsConnection: capabilities.filter((entry) => entry.status === "needs_connection").length,
      unavailable: capabilities.filter((entry) => entry.status === "unavailable").length,
    };

    return {
      freeOnly: freeAiOnly() || zeroAiCostMode(),
      capabilities,
      providers: providerSnapshots(),
      summary,
    };
  });
