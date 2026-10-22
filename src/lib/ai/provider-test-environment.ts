/** Unit-test isolation: configured deployment credentials must never reach a live provider. */
import { vi } from "vitest";

export const PROVIDER_TEST_ENV_KEYS = ["LOVABLE_API_KEY", "AI_PAID_DAILY_CAP_USD", "AI_FREE_ONLY", "FREE_AI_ONLY", "ZERO_COST_ONLY"] as const;

export function isolateProviderEnvironment(): void {
  for (const key of PROVIDER_TEST_ENV_KEYS) vi.stubEnv(key, undefined);
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("Unexpected HTTP request in AI unit test; configure a response stub first.");
  }));
}
