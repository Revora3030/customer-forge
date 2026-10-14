function legacyRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded));
    return claims && typeof claims.role === "string" ? claims.role : undefined;
  } catch {
    return undefined;
  }
}

// This is a configuration check, not JWT signature verification.
export function assertPublicSupabaseKey(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(
      "Invalid public Supabase configuration: expected a publishable or legacy anonymous key.",
    );
  }
  if (value.startsWith("sb_secret_")) {
    throw new Error(
      "Invalid public Supabase configuration: secret keys are server-only. Use a publishable key.",
    );
  }
  if (value.startsWith("sb_publishable_") && value.length > "sb_publishable_".length) {
    return;
  }
  if (legacyRole(value) === "anon") return;
  throw new Error(
    "Invalid public Supabase configuration: expected a publishable or legacy anonymous key.",
  );
}

export function assertPublicEnvironment(environment) {
  for (const [name, value] of Object.entries(environment)) {
    if (!name.startsWith("VITE_") || !value) continue;
    const privateName =
      /(?:^|_)(?:SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD|ACCESS_TOKEN)(?:_|$)/i.test(name);
    const privateValue = /^(?:sb_secret_|sk_(?:live|test)_|whsec_|sk-(?:proj-|svcacct-))/.test(value);
    const privilegedJwt = legacyRole(value) === "service_role";
    if (privateName || privateValue || privilegedJwt) {
      throw new Error(
        `Unsafe public environment variable: ${name}. Move server credentials to unprefixed server-only configuration.`,
      );
    }
    if (name === "VITE_SUPABASE_PUBLISHABLE_KEY") assertPublicSupabaseKey(value);
  }
}
