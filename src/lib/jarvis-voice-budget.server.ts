import type { VoiceScope } from "./jarvis-voice-token.server";

/**
 * Daily ElevenLabs character caps and per-link use counts, kept in the
 * database (migration 20261018090300_voice_budget.sql) so they hold across
 * every Worker isolate. Charged where the spend happens: right before each
 * ElevenLabs call.
 *
 * Failure policy, stated explicitly:
 * - No admin database client configured (unit tests, local tools): allowed,
 *   unmetered.
 * - The RPC is not deployed yet (Postgres 42883 or PostgREST PGRST202, i.e.
 *   the migration hasn't been applied): a warning is logged and the call is
 *   allowed, so voice keeps working until the owner applies the migration.
 * - The RPC exists but errors, or answers something unexpected: refused.
 *   The cap fails closed.
 */

export const DEFAULT_VISITOR_DAILY_CHARS = 60_000;
export const DEFAULT_ADMIN_DAILY_CHARS = 200_000;
/** A signed link may be fetched this many times: a Safari range probe plus the buffered retry of the same sentence. */
export const VOICE_LINK_MAX_USES = 3;

export function voiceDailyCap(scope: VoiceScope): number {
  const name = scope === "visitor" ? "ELEVENLABS_VISITOR_DAILY_CHARS" : "ELEVENLABS_ADMIN_DAILY_CHARS";
  const fallback = scope === "visitor" ? DEFAULT_VISITOR_DAILY_CHARS : DEFAULT_ADMIN_DAILY_CHARS;
  const text = process.env[name]?.trim() ?? "";
  const parsed = Number(text);
  // Postgres int: keep the cap inside its range.
  return text && Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, 2_000_000_000) : fallback;
}

type Client = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

/** The service-role client, or null where no database is configured. */
async function ledger(): Promise<{ db: Client } | null> {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] && !process.env["SUPABASE_SECRET_KEY"]) return null;
  try {
    const mod = await import("@/integrations/supabase/client.server");
    return { db: mod.supabaseAdmin as unknown as Client };
  } catch {
    return null;
  }
}

/** True when the error says the function doesn't exist yet (migration not applied). */
export function isMissingFunction(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : null;
  return code === "42883" || code === "PGRST202";
}

export type VoiceGate = { allowed: boolean; metered: boolean };

async function callBoolean(name: string, args: Record<string, unknown>): Promise<VoiceGate> {
  const handle = await ledger();
  if (!handle) return { allowed: true, metered: false };
  try {
    const { data, error } = await handle.db.rpc(name, args);
    if (error) {
      if (isMissingFunction(error)) {
        // Deliberate: before the migration is applied, voice stays usable.
        console.warn(`[jarvis-voice] ${name} is not deployed yet; allowing unmetered until the voice budget migration is applied.`);
        return { allowed: true, metered: false };
      }
      return { allowed: false, metered: true };
    }
    return { allowed: data === true, metered: true };
  } catch {
    return { allowed: false, metered: true };
  }
}

/** Reserves `chars` of today's (UTC) ElevenLabs allowance for `scope`. */
export async function reserveVoiceChars(scope: VoiceScope, chars: number): Promise<VoiceGate> {
  const cap = voiceDailyCap(scope);
  if (cap <= 0) return { allowed: false, metered: true };
  return callBoolean("voice_budget_reserve", { _scope: scope, _chars: Math.max(0, Math.ceil(chars)), _cap: cap });
}

/** Counts one use of a signed link; refused past `maxUses`. */
export async function claimVoiceLink(nonce: string, maxUses: number, expiresAt: Date): Promise<VoiceGate> {
  return callBoolean("voice_link_claim", { _nonce: nonce, _max_uses: maxUses, _expires_at: expiresAt.toISOString() });
}
