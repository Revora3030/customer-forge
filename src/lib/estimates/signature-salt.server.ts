/**
 * Salt for the hashed signer IP stored with an estimate signature (audit only;
 * signature validity rests on the document SHA-256, never on this salt).
 *
 * Prefers a dedicated ESTIMATE_SIGNATURE_IP_SALT so rotating the Supabase
 * service-role key doesn't change it. Falls back to the service-role key, the
 * value used before this secret existed, so IP hashes already stored stay
 * comparable until the dedicated secret is added.
 */
export function estimateSignatureIpSalt(env: Record<string, string | undefined> = process.env): string {
  const dedicated = env["ESTIMATE_SIGNATURE_IP_SALT"]?.trim();
  if (dedicated && dedicated.length >= 16) return dedicated;
  return env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
}
