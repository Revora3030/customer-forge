import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reportSignInDevice } from "@/lib/new-device-signin.server";

/**
 * Fire-and-forget after SIGNED_IN. Client sends only a local device id;
 * country comes from Cloudflare's cf-ipcountry on the request.
 */
export const reportNewDeviceSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { deviceId?: string }) => ({
    deviceId: String(input?.deviceId ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data, context }) => {
    let countryHeader: string | null = null;
    try {
      countryHeader = getRequest().headers.get("cf-ipcountry");
    } catch {
      countryHeader = null;
    }
    const claimsEmail =
      typeof context.claims?.email === "string" ? context.claims.email : null;
    let email = claimsEmail;
    if (!email) {
      const { data: userData } = await context.supabase.auth.getUser();
      email = userData.user?.email ?? null;
    }
    return reportSignInDevice({
      db: context.supabase as never,
      userId: context.userId,
      email,
      deviceId: data.deviceId,
      countryHeader,
    });
  });
