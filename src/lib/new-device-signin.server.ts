import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hashDeviceId,
  isNewDeviceEmailEnabled,
  newDeviceEmailCopy,
  normalizeCountry,
  shouldSendNewDeviceAlert,
} from "@/lib/new-device-signin";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

type Db = Pick<SupabaseClient, "from">;

export type ReportSignInResult =
  | { ok: true; skipped: string }
  | { ok: true; emailed: boolean; reason: string }
  | { ok: false; error: string };

/**
 * Record a hashed device + country for the signed-in user. When the feature
 * flag is on and this looks like a new device/country (not the first ever,
 * not within the daily cooldown), email the account using the existing
 * automation-message template.
 */
export async function reportSignInDevice(input: {
  db: Db;
  userId: string;
  email: string | null | undefined;
  deviceId: string;
  countryHeader: string | null | undefined;
  env?: Record<string, string | undefined>;
  now?: Date;
}): Promise<ReportSignInResult> {
  const enabled = isNewDeviceEmailEnabled(input.env ?? process.env);
  const country = normalizeCountry(input.countryHeader);
  const deviceId = String(input.deviceId ?? "").trim();
  if (deviceId.length < 8 || deviceId.length > 80) {
    return { ok: false, error: "bad_device" };
  }

  const deviceHash = await hashDeviceId(input.userId, deviceId);

  const { count: deviceCountBefore, error: countError } = await input.db
    .from("owner_sign_in_devices")
    .select("device_hash", { count: "exact", head: true })
    .eq("user_id", input.userId);
  if (countError) {
    // Migration not applied yet — fail soft so sign-in never breaks.
    return { ok: true, skipped: "pending_migration" };
  }

  const { data: existing } = await input.db
    .from("owner_sign_in_devices")
    .select("device_hash, country")
    .eq("user_id", input.userId)
    .eq("device_hash", deviceHash)
    .maybeSingle();

  const knownDevice = Boolean(existing);
  const countryChanged = knownDevice && (existing as { country: string }).country !== country;

  if (knownDevice) {
    await input.db
      .from("owner_sign_in_devices")
      .update({ last_seen: (input.now ?? new Date()).toISOString(), country })
      .eq("user_id", input.userId)
      .eq("device_hash", deviceHash);
  } else {
    const { error: insertError } = await input.db.from("owner_sign_in_devices").insert({
      user_id: input.userId,
      device_hash: deviceHash,
      country,
      first_seen: (input.now ?? new Date()).toISOString(),
      last_seen: (input.now ?? new Date()).toISOString(),
    });
    if (insertError) return { ok: true, skipped: "insert_failed" };
  }

  const { data: alertState } = await input.db
    .from("owner_sign_in_alert_state")
    .select("last_alert_at")
    .eq("user_id", input.userId)
    .maybeSingle();

  const decision = shouldSendNewDeviceAlert({
    enabled,
    deviceCountBefore: deviceCountBefore ?? 0,
    knownDevice,
    countryChanged,
    lastAlertAt: (alertState as { last_alert_at?: string } | null)?.last_alert_at ?? null,
    now: input.now,
  });

  if (!decision.send) return { ok: true, emailed: false, reason: decision.reason };

  const to = String(input.email ?? "").trim();
  if (!to || !to.includes("@")) return { ok: true, emailed: false, reason: "no_email" };

  try {
    const copy = newDeviceEmailCopy(country);
    await sendTemplateEmail("automation-message", to, copy);
  } catch {
    return { ok: true, emailed: false, reason: "send_failed" };
  }

  const when = (input.now ?? new Date()).toISOString();
  await input.db.from("owner_sign_in_alert_state").upsert({
    user_id: input.userId,
    last_alert_at: when,
  });

  return { ok: true, emailed: true, reason: decision.reason };
}
