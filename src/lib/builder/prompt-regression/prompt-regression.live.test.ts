/**
 * OPTIONAL live mode: runs the builder's real prompts through a real model and
 * applies the same checks as the stubbed suite. Off by default and never in CI.
 *
 *   PROMPT_REGRESSION_LIVE=1 PROMPT_REGRESSION_URL=... PROMPT_REGRESSION_API_KEY=... PROMPT_REGRESSION_MODEL=... \
 *     npm run test:prompts:live
 *
 * Without the flag, or with CI set, every case here is skipped. See
 * docs/prompt-regression.md. A live failure is information about the model's
 * answer, not a merge gate; real models vary from run to run.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/thinker.server", async () => {
  const harness = await import("./thinker-route");
  return { callBestThinker: harness.routeThinker };
});

import {
  architectureText,
  inventedFactProblems,
  leadCaptureProblems,
  patchText,
  phoneFirstProblems,
  structureProblems,
} from "./checks";
import { PROMPT_FIXTURES } from "./fixtures";
import { runFixture } from "./harness";
import { liveModeBlocker, liveModel } from "./live-model";

const blocker = liveModeBlocker(process.env);
const only = process.env["PROMPT_REGRESSION_ONLY"]?.split(",").map((id) => id.trim()).filter(Boolean);

describe.skipIf(blocker !== null)("live builder prompts", () => {
  for (const fixture of PROMPT_FIXTURES.filter((entry) => !only || only.includes(entry.id))) {
    it(`${fixture.id}: real model answers pass the checks`, { timeout: 600_000 }, async () => {
      const result = await runFixture(fixture, liveModel(process.env));
      expect(result.architecture.skipped, "the architect/reviewer did not produce an approved plan").toBeNull();
      const architecture = result.architecture.architecture!;
      const problems = [
        ...structureProblems(fixture, architecture),
        ...phoneFirstProblems(fixture, architecture),
        ...leadCaptureProblems(architecture),
        ...inventedFactProblems(fixture, architectureText(architecture)),
        ...inventedFactProblems(fixture, patchText(result.wording.patches)),
      ];
      expect(problems).toEqual([]);
    });
  }
});

describe("live mode switch", () => {
  it("is off unless explicitly enabled", () => {
    expect(liveModeBlocker({})).not.toBeNull();
    expect(liveModeBlocker({ PROMPT_REGRESSION_LIVE: "1", CI: "true", PROMPT_REGRESSION_URL: "u", PROMPT_REGRESSION_API_KEY: "k", PROMPT_REGRESSION_MODEL: "m" })).toMatch(/never runs in CI/);
    expect(liveModeBlocker({ PROMPT_REGRESSION_LIVE: "1", PROMPT_REGRESSION_URL: "u", PROMPT_REGRESSION_MODEL: "m" })).toMatch(/PROMPT_REGRESSION_API_KEY/);
    expect(liveModeBlocker({ PROMPT_REGRESSION_LIVE: "1", PROMPT_REGRESSION_URL: "u", PROMPT_REGRESSION_API_KEY: "k", PROMPT_REGRESSION_MODEL: "m" })).toBeNull();
    expect(() => liveModel({})).toThrow(/live mode is off/);
  });
});
