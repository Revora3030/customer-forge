import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ auth: {} })),
  storage: vi.fn(() => undefined),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("./previewAuthStorage", () => ({
  brokeredPreviewStorage: mocks.storage,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public Supabase client configuration", () => {
  it("rejects secret keys before client or storage initialization", async () => {
    const key = "sb_secret_test_do_not_log";
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", key);
    const { supabase } = await import("./client");

    expect(() => supabase.auth).toThrow(
      "Invalid public Supabase configuration: secret keys are server-only. Use a publishable key.",
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it("does not include a rejected secret in the error message", async () => {
    const key = "sb_secret_test_do_not_log";
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", key);
    const { supabase } = await import("./client");
    let message = "";

    try {
      void supabase.auth;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("secret keys are server-only");
    expect(message).not.toContain(key);
  });

  it("preserves lazy initialization for publishable keys", async () => {
    const { supabase } = await import("./client");
    expect(mocks.createClient).not.toHaveBeenCalled();

    expect(supabase.auth).toEqual({});
    expect(supabase.auth).toEqual({});
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.any(Object),
    );
  });

  it("preserves legacy anonymous-key initialization", async () => {
    const payload = btoa(JSON.stringify({ role: "anon" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const key = `eyJhbGciOiJIUzI1NiJ9.${payload}.test-signature`;
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", key);
    const { supabase } = await import("./client");

    expect(supabase.auth).toEqual({});
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      key,
      expect.any(Object),
    );
  });
});

describe("extended public client policy", () => {
  it.each(["service_role", "authenticated", "admin"])(
    "rejects a legacy %s credential before initialization",
    async (role) => {
      const payload = btoa(JSON.stringify({ role }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      vi.stubEnv(
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        `eyJhbGciOiJIUzI1NiJ9.${payload}.test-signature`,
      );
      const { supabase } = await import("./client");

      expect(() => supabase.auth).toThrow("expected a publishable or legacy anonymous key");
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.storage).not.toHaveBeenCalled();
    },
  );

  it("rejects a secret supplied through the server fallback", async () => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_secret_server_fixture");
    const { supabase } = await import("./client");

    expect(() => supabase.auth).toThrow("secret keys are server-only");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it("rejects unsupported public keys before initialization", async () => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "opaque");
    const { supabase } = await import("./client");

    expect(() => supabase.auth).toThrow("expected a publishable or legacy anonymous key");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
});
