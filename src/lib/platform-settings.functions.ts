import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_GA_MEASUREMENT_ID,
  GA_MEASUREMENT_ID_PATTERN,
  resolveGaMeasurementIds,
} from "@/lib/ga4-ids";

export { DEFAULT_GA_MEASUREMENT_ID };

/**
 * Platform-wide settings (super-admin only).
 *
 * Currently the Google Analytics 4 measurement ID for revoragrowthsystems.com.
 * The ID itself is public (it must load in the visitor's browser), so reads go
 * through the public policy; writes are service-role only and gated behind a
 * super-admin check here.
 */

const GA_PATTERN = GA_MEASUREMENT_ID_PATTERN;

export interface PlatformSettings {
  /** The extra ID saved in Admin → Analytics (null when none). */
  gaMeasurementId: string | null;
  /** Every GA4 property production actually sends to (default always first). */
  effectiveGaMeasurementIds: string[];
  updatedAt: string | null;
}

export const getPlatformSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformSettings> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("platform_settings")
      .select("ga_measurement_id, updated_at")
      .eq("id", "default")
      .maybeSingle();
    return {
      gaMeasurementId: data?.ga_measurement_id ?? null,
      effectiveGaMeasurementIds: resolveGaMeasurementIds(data?.ga_measurement_id),
      updatedAt: data?.updated_at ?? null,
    };
  });

/**
 * The ONLY public read of platform_settings: the GA measurement IDs, which are
 * public by nature (they load in the visitor's browser). The table itself is
 * not readable by visitors; everything else in it stays server-side.
 *
 * Revora's own property is always first; a different saved ID is added as a
 * second destination, never a replacement.
 */
export const getPublicGaMeasurementIds = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("platform_settings")
        .select("ga_measurement_id")
        .eq("id", "default")
        .maybeSingle();
      return resolveGaMeasurementIds(data?.ga_measurement_id);
    } catch (error) {
      console.warn("[Analytics] Public GA lookup unavailable; using the default GA4 property.", error);
      return resolveGaMeasurementIds(null);
    }
  },
);

export const setGaMeasurementId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { measurementId: string }) => {
    const raw = typeof input?.measurementId === "string" ? input.measurementId.trim() : "";
    if (!raw) return { measurementId: null as string | null };
    const value = raw.toUpperCase();
    if (!GA_PATTERN.test(value)) {
      throw new Error("Enter a Google Analytics measurement ID that looks like G-XXXXXXXXXX.");
    }
    return { measurementId: value };
  })
  .handler(async ({ context, data }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("platform_settings").upsert({
      id: "default",
      ga_measurement_id: data.measurementId,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, measurementId: data.measurementId };
  });
