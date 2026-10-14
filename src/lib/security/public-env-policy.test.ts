import { describe, expect, it } from "vitest";
import { assertPublicEnvironment, assertPublicSupabaseKey } from "./public-env-policy.mjs";

function jwt(role: string) {
  const payload = btoa(JSON.stringify({ role }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.test-signature`;
}

describe("public Supabase key policy", () => {
  it("accepts publishable and legacy anonymous keys", () => {
    expect(() => assertPublicSupabaseKey("sb_publishable_test")).not.toThrow();
    expect(() => assertPublicSupabaseKey(jwt("anon"))).not.toThrow();
  });

  it.each(["service_role", "authenticated", "admin"])(
    "rejects legacy keys with the %s role",
    (role) => {
      expect(() => assertPublicSupabaseKey(jwt(role))).toThrow();
    },
  );

  it.each(["", "sb_publishable_", "opaque", "a.b.c", " sb_publishable_test"])(
    "rejects malformed or unsupported configuration %s",
    (key) => {
      expect(() => assertPublicSupabaseKey(key)).toThrow();
    },
  );

  it("rejects secret keys without echoing their value", () => {
    const key = "sb_secret_test_do_not_log";
    let message = "";
    try {
      assertPublicSupabaseKey(key);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("secret keys are server-only");
    expect(message).not.toContain(key);
  });
});

describe("public build environment policy", () => {
  it("allows public configuration and unprefixed server credentials", () => {
    expect(() =>
      assertPublicEnvironment({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
        VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
        SUPABASE_SERVICE_ROLE_KEY: jwt("service_role"),
        STRIPE_SECRET_KEY: "sk_test_" + "fixture",
        VITE_UNUSED_SECRET: "",
      }),
    ).not.toThrow();
  });

  it.each([
    "VITE_SUPABASE_SERVICE_ROLE_KEY",
    "VITE_STRIPE_SECRET_KEY",
    "VITE_PASSWORD",
    "VITE_ACCESS_TOKEN",
    "VITE_PRIVATE_KEY",
  ])("rejects server-only variable name %s", (name) => {
    expect(() => assertPublicEnvironment({ [name]: "fixture" })).toThrow(name);
  });

  it.each([
    "sb_secret_" + "fixture",
    "sk_live_" + "fixture",
    "sk_test_" + "fixture",
    "whsec_" + "fixture",
    "sk-proj-" + "fixture",
    "sk-svcacct-" + "fixture",
    jwt("service_role"),
  ])("rejects recognizable credentials under an ordinary public name", (key) => {
    let message = "";
    try {
      assertPublicEnvironment({ VITE_EXTERNAL_KEY: key });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("VITE_EXTERNAL_KEY");
    expect(message).not.toContain(key);
  });

  it("validates the designated public Supabase key", () => {
    expect(() =>
      assertPublicEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: "opaque" }),
    ).toThrow();
  });
});
