import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyBuildFailure, describeBuildFailure, tagFailureMessage } from "./build-failure";
import {
  ContentIntegrityError,
  assertContentIntegrity,
  businessFactIntegrityFields,
  inspectContentIntegrity,
  integrityOwnerMessage,
  isContentIntegrityError,
  parseIntegrityViolations,
} from "./content-integrity";
import { canvasStatusLine } from "@/components/app/live-canvas-utils";

/** The exact facts of the Oak City Plumbing Test (DEMO) build that stalled at 18%. */
const oakCity = {
  businessName: "Oak City Plumbing Test (DEMO)",
  description: "Licensed plumbers serving Raleigh homes.",
  city: "Raleigh",
  serviceArea: "Wake County",
  phone: null,
  email: "oak-city-test@example.com",
  services: [{ name: "Drain cleaning", description: "Clogged drains cleared fast." }],
};

function integrityError(): ContentIntegrityError {
  try {
    assertContentIntegrity(businessFactIntegrityFields(oakCity));
  } catch (error) {
    return error as ContentIntegrityError;
  }
  throw new Error("expected the integrity gate to refuse the test email");
}

describe("content integrity refusals are intake problems, never worker interruptions", () => {
  it("throws a typed, coded error for a fixture email", () => {
    const error = integrityError();
    expect(error).toBeInstanceOf(ContentIntegrityError);
    expect(error.code).toBe("content_integrity");
    expect(isContentIntegrityError(error)).toBe(true);
    expect(isContentIntegrityError({ code: "content_integrity", message: "x" })).toBe(true);
    expect(isContentIntegrityError(new Error("fetch failed"))).toBe(false);
  });

  it("classifies the typed error as non-retryable intake validation naming the field", () => {
    const failure = classifyBuildFailure(integrityError());
    expect(failure).toMatchObject({ kind: "intake_validation", retryable: false });
    expect(failure.ownerMessage).toBe(
      "Your business email looks like test data. Update it in Business details, then press Build again.",
    );
    expect(failure.ownerMessage).not.toMatch(/resumes|automatically|interrupted/i);
  });

  it("falls back to the message text when the class is lost (stored or re-thrown)", () => {
    const plain = new Error(integrityError().message);
    const failure = classifyBuildFailure(plain);
    expect(failure).toMatchObject({ kind: "intake_validation", retryable: false });
    expect(failure.ownerMessage).toContain("business email looks like test data");
    // Wording alone, without the field list, still never reads as a worker fault.
    for (const message of [
      "some business details are not real information yet",
      "email: this looks like test or demo data",
      "city: this is placeholder text, not real business information",
      "address: this is a placeholder address",
    ]) {
      const result = classifyBuildFailure(new Error(message));
      expect(result.kind, message).toBe("intake_validation");
      expect(result.retryable, message).toBe(false);
      expect(result.ownerMessage, message).toMatch(/press Build again/);
    }
  });

  it("keeps the other kinds as they were", () => {
    expect(classifyBuildFailure(new Error("fetch failed"))).toMatchObject({ kind: "infrastructure", retryable: true });
    expect(classifyBuildFailure(new Error("Copy contained an unsupported claim")).kind).toBe("content");
    expect(classifyBuildFailure(new Error("Revora still needs: email.")).ownerMessage).toMatch(/press Build again/);
  });

  it("shows the owner the field to fix for a stored failed job, not 'resumes automatically'", () => {
    const stored = tagFailureMessage("intake_validation", integrityError().message);
    const described = describeBuildFailure({ status: "failed", failure_kind: "intake_validation", error_message: stored });
    expect(described?.message).toBe(
      "Your business email looks like test data. Update it in Business details, then press Build again.",
    );
    expect(described?.label).toBe("Business details need fixing");
  });

  it("never promises an automatic resume on a failed (final) row", () => {
    for (const kind of ["infrastructure", "provider", "content"]) {
      const described = describeBuildFailure({ status: "failed", failure_kind: kind });
      expect(described?.message, kind).not.toMatch(/resumes it automatically|retries automatically|Revora retries/i);
      expect(described?.message, kind).toMatch(/Build again/);
    }
    expect(canvasStatusLine({ status: "failed", stalled: false, latestStage: null, latestDetail: null })).not.toMatch(
      /automatically/,
    );
  });

  it("names several fields, stays short enough for a chat line, and round-trips the stored text", () => {
    const violations = inspectContentIntegrity(
      businessFactIntegrityFields({ ...oakCity, city: "Lorem ipsum", serviceArea: "TBD", description: "asdf" }),
    );
    expect(violations.length).toBeGreaterThanOrEqual(3);
    const message = integrityOwnerMessage(violations);
    expect(message.length).toBeLessThanOrEqual(180);
    expect(message).toMatch(/^Your /);
    expect(message).toMatch(/Update them in Business details, then press Build again\.$/);
    const parsed = parseIntegrityViolations(new ContentIntegrityError(violations).message);
    expect(parsed.map((entry) => entry.field)).toEqual(violations.slice(0, 3).map((entry) => entry.field));
    expect(parseIntegrityViolations("fetch failed")).toEqual([]);
  });

  it("accepts real business details", () => {
    expect(inspectContentIntegrity(businessFactIntegrityFields({ ...oakCity, email: "office@oakcityplumbing.com" }))).toEqual([]);
  });
});

describe("the build request and the worker share the gate and never requeue it", () => {
  const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
  const functions = readFileSync("src/lib/site-engine.functions.ts", "utf8");

  it("checks business facts before the job is queued", () => {
    const precheck = functions.indexOf("businessFactsRefusal(supabase, orgId)");
    const insert = functions.indexOf('.from("generation_jobs")\n      .insert(');
    expect(precheck).toBeGreaterThan(0);
    expect(insert).toBeGreaterThan(precheck);
    expect(functions).toContain("precheckBusinessFacts(");
    expect(readFileSync("src/lib/builder/business-facts-precheck.ts", "utf8")).toContain("businessFactIntegrityFields(");
  });

  it("uses the same field list in the worker and skips capacity parking for intake failures", () => {
    expect(worker).toContain("businessFactIntegrityFields({");
    expect(worker).toContain('failure.kind === "intake_validation"');
    expect(worker).toContain("attempts >= MAX_ATTEMPTS || !failure.retryable");
  });
});

describe("plain field validation errors name the field and never retry", () => {
  const cases: [string, string][] = [
    ["Invalid email address", "business email"],
    ['[{"validation":"email","code":"invalid_string","message":"Invalid email","path":["email"]}]', "business email"],
    ['null value in column "city" of relation "organization_profiles" violates not-null constraint', "city"],
    ['new row for relation "organizations" violates check constraint "organizations_email_check"', "business email"],
    ["phone: invalid", "business phone"],
  ];
  for (const [text, field] of cases) {
    it(`"${text.slice(0, 40)}" -> ${field}`, () => {
      const failure = classifyBuildFailure(new Error(text));
      expect(failure.kind).toBe("intake_validation");
      expect(failure.retryable).toBe(false);
      expect(failure.ownerMessage).toContain(`Fix this: ${field}`);
      const shown = describeBuildFailure({ status: "failed", error_message: tagFailureMessage(failure.kind, text) });
      expect(shown?.message).toContain(`Fix this: ${field}`);
      expect(shown?.message).not.toMatch(/interrupted/i);
    });
  }
  it("an unrelated provider error is still transient", () => {
    expect(classifyBuildFailure(new Error("Invalid API key for provider")).kind).not.toBe("intake_validation");
    expect(classifyBuildFailure(new Error("fetch failed")).retryable).toBe(true);
  });
});
