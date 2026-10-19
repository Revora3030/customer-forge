import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Jarvis demo-site outreach through the owner's own connected Gmail.
 *
 * Every send: one email per business (database-unique), never to an address
 * that opted out, always with sender name, physical mailing address and an
 * opt-out line. Replies asking to stop are read from Gmail and suppressed.
 * Server-only; callers must already be a verified super-admin or the cron job.
 */

const GMAIL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
export const OUTREACH_DAILY_MAX = 40;

function gmailHeaders(): Record<string, string> {
  const lovable = process.env["LOVABLE_API_KEY"];
  const gmail = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovable || !gmail) throw new Error("Gmail is not connected to the app.");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": gmail, "Content-Type": "application/json" };
}

const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const mimeHeader = (v: string) => (/^[\x20-\x7E]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

/** RFC 2822 message, base64url. Header values are stripped of line breaks (no header injection). */
export function rawEmail(to: string, subject: string, body: string, fromName: string): string {
  const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim();
  const message = [
    `To: ${clean(to)}`,
    `From: ${mimeHeader(clean(fromName))} <me>`,
    `Subject: ${mimeHeader(clean(subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");
  return b64(message).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function validEmail(value: unknown): string | null {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/.test(email) && email.length <= 200 ? email : null;
}

async function sentToday(db: SupabaseClient): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("prospect_outreach")
    .select("id", { count: "exact", head: true })
    .neq("status", "failed")
    .gte("created_at", since.toISOString());
  return count ?? 0;
}

export type SendOutcome = { ok: true; email: string } | { ok: false; reason: string };

/** Sends one demo email from the connected Gmail, guarded by suppression, one-per-business and the daily cap. */
export async function sendDemoEmail(
  db: SupabaseClient,
  input: { organizationId: string; to: string; subject: string; body: string; source: "manual" | "autopilot"; dailyCap: number },
): Promise<SendOutcome> {
  const email = validEmail(input.to);
  if (!email) return { ok: false, reason: "That email address doesn't look valid." };
  const { address } = (await import("./jarvis-prospecting.functions")).outreachFooter();
  if (!address) return { ok: false, reason: "Add your physical mailing address (REVORA_MAILING_ADDRESS) first; the law requires it in sales email." };
  if (!input.body.includes("/p/")) return { ok: false, reason: "The email must include the preview link." };

  const { data: blocked } = await db.from("prospect_outreach_suppressions").select("email").eq("email", email).maybeSingle();
  if (blocked) return { ok: false, reason: "This address asked not to be contacted." };
  if ((await sentToday(db)) >= Math.min(input.dailyCap, OUTREACH_DAILY_MAX))
    return { ok: false, reason: `Today's limit of ${Math.min(input.dailyCap, OUTREACH_DAILY_MAX)} emails is reached.` };

  // Claim first: the unique keys stop a second email to the same business or address.
  const { data: claim, error: claimError } = await db
    .from("prospect_outreach")
    .insert({ organization_id: input.organizationId, email, subject: input.subject.slice(0, 200), status: "sending", source: input.source })
    .select("id")
    .single();
  if (claimError || !claim) return { ok: false, reason: "This business (or this address) was already emailed." };

  const sender = process.env["REVORA_SENDER_NAME"]?.trim() || "Revora Growth Systems";
  try {
    const response = await fetch(`${GMAIL}/users/me/messages/send`, {
      method: "POST",
      headers: gmailHeaders(),
      body: JSON.stringify({ raw: rawEmail(email, input.subject, input.body, sender) }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Gmail [${response.status}]: ${text.slice(0, 300)}`);
    const id = (JSON.parse(text) as { id?: string }).id ?? null;
    await db.from("prospect_outreach").update({ status: "sent", gmail_message_id: id }).eq("id", claim.id);
    await db.from("audit_logs").insert({
      organization_id: input.organizationId,
      actor_id: null,
      action: "jarvis.prospect_demo.emailed",
      entity: "organization",
      entity_id: input.organizationId,
      metadata: { source: input.source },
    });
    return { ok: true, email };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Gmail send failed";
    await db.from("prospect_outreach").update({ status: "failed", error: reason.slice(0, 500) }).eq("id", claim.id);
    return { ok: false, reason };
  }
}

const STOP_WORDS = /\b(no thanks|not interested|unsubscribe|stop|remove me|do not contact|don't contact)\b/i;

/** Reads recent Gmail replies; anyone we emailed who asked to stop is suppressed forever. */
export async function syncOptOuts(db: SupabaseClient): Promise<number> {
  const { data: sent } = await db.from("prospect_outreach").select("email").eq("status", "sent").limit(2000);
  const emailed = new Set((sent ?? []).map((row) => String(row.email).toLowerCase()));
  if (!emailed.size) return 0;
  const headers = gmailHeaders();
  const list = await fetch(`${GMAIL}/users/me/messages?maxResults=50&q=${encodeURIComponent("in:inbox newer_than:7d")}`, { headers });
  if (!list.ok) throw new Error(`Gmail [${list.status}]: ${(await list.text()).slice(0, 200)}`);
  const ids = ((await list.json()) as { messages?: { id: string }[] }).messages ?? [];
  let added = 0;
  for (let i = 0; i < ids.length; i += 6) {
    const batch = await Promise.all(
      ids.slice(i, i + 6).map(async ({ id }) => {
        const res = await fetch(`${GMAIL}/users/me/messages/${id}?format=metadata&metadataHeaders=From`, { headers });
        return res.ok ? ((await res.json()) as { snippet?: string; payload?: { headers?: { name: string; value: string }[] } }) : null;
      }),
    );
    for (const message of batch) {
      const from = message?.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
      const address = validEmail(from.match(/<([^>]+)>/)?.[1] ?? from);
      if (!address || !emailed.has(address) || !STOP_WORDS.test(message?.snippet ?? "")) continue;
      const { error } = await db.from("prospect_outreach_suppressions").upsert({ email: address, reason: "replied_stop" });
      if (!error) added += 1;
    }
  }
  return added;
}
