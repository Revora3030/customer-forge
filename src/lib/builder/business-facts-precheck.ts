/**
 * The business-facts pre-check, shared by every path that queues a build: the
 * owner's Build button, prospect demos, autopilot demos and a pitch-first demo
 * that is built after the prospect replies.
 *
 * It applies the same rules as the worker's hard gate (same fields, same
 * sanitising), so a build that would stall at the brand step and fail three
 * attempts later is refused up front, with a message that names the field. A
 * placeholder phone or email is not a refusal: the worker withholds it from the
 * site, so it is left out here too.
 *
 * Pure module: no environment, no network, no secrets.
 */
import { businessFactIntegrityFields, inspectContentIntegrity, integrityOwnerMessage, type IntegrityViolation } from "@/lib/builder/content-integrity";
import { mergeSplitServices, sanitizeServices } from "@/lib/builder/intake-sanitize";

export type PrecheckFacts = {
  businessName: string | null | undefined;
  description?: string | null;
  city?: string | null;
  serviceArea?: string | null;
  services?: { name: string; description?: string | null }[];
};

export type PrecheckResult = { violations: IntegrityViolation[]; message: string | null };

/** Runs the worker's hard gate over the facts the build will read. Phone and email are never part of it. */
export function precheckBusinessFacts(facts: PrecheckFacts): PrecheckResult {
  const services = mergeSplitServices(sanitizeServices(facts.services ?? []));
  const violations = inspectContentIntegrity(
    businessFactIntegrityFields({
      businessName: facts.businessName ?? "",
      description: facts.description ?? null,
      city: facts.city ?? null,
      serviceArea: facts.serviceArea ?? null,
      phone: null,
      email: null,
      services,
    }),
  );
  return { violations, message: violations.length ? integrityOwnerMessage(violations) : null };
}

/** The same check for a prospect demo's input, where services are plain names and the service area is the city. */
export function precheckProspectDemoFacts(input: {
  businessName: string;
  city: string;
  description: string | null;
  services: string[];
}): PrecheckResult {
  return precheckBusinessFacts({
    businessName: input.businessName,
    description: input.description,
    city: input.city,
    serviceArea: input.city,
    services: input.services.map((name) => ({ name })),
  });
}
