import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Platform-wide settings (super-admin only).
 *
 * Currently the Google Analytics 4 measurement ID for revoragrowthsystems.com.
 * The ID itself is public (it must load in the visitor's browser), so reads go
 * through the public policy; writes are service-role only and gated behind a
 * super-admin check here.
 */

const GA_PATTERN = /^G-[A-Z0-9]{4,20}$/;

export interface PlatformSettings {
  gaMeasurementId: string | null;
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
      updatedAt: data?.updated_at ?? null,
    };
  });

/**
 * The ONLY public read of platform_settings: the GA measurement ID, which is
 * public by nature (it loads in the visitor's browser). The table itself is
 * not readable by visitors; everything else in it stays server-side.
 */
export const getPublicGaMeasurementId = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("platform_settings")
        .select("ga_measurement_id")
        .eq("id", "default")
        .maybeSingle();
      const id = data?.ga_measurement_id;
      return typeof id === "string" && GA_PATTERN.test(id) ? id : null;
    } catch (error) {
      console.warn("[Analytics] Public GA lookup unavailable; continuing without GA4.", error);
      return null;
    }
  },
);

export const setGaMeasurementId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { measurementId: string }) => {
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
