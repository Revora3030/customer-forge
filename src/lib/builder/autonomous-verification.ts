import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

export type VerificationCheck = {
  id: string;
  category:
    | "structure"
    | "content"
    | "conversion"
    | "seo"
    | "accessibility"
    | "responsive"
    | "performance"
    | "security"
    | "runtime";
  severity: "block" | "warn" | "observe";
  description: string;
  deterministic: boolean;
};

export type VerificationContract = {
  checks: VerificationCheck[];
  blockers: string[];
  runtimeChecks: string[];
  risk: "low" | "medium" | "high" | "critical";
  rollbackRequired: boolean;
  summary: string;
};

function add(
  checks: VerificationCheck[],
  id: string,
  category: VerificationCheck["category"],
  severity: VerificationCheck["severity"],
  description: string,
  deterministic: boolean,
) {
  if (checks.some((check) => check.id === id)) return;
  checks.push({ id, category, severity, description, deterministic });
}

function actionTypes(actions: AgentAction[]): Set<AgentAction["type"]> {
  return new Set(actions.map((action) => action.type));
}

export function buildVerificationContract(
  context: AgentContext,
  actions: AgentAction[],
  instruction: string,
): VerificationContract {
  const checks: VerificationCheck[] = [];
  const blockers: string[] = [];
  const runtimeChecks: string[] = [];
  const types = actionTypes(actions);
  const value = instruction.toLowerCase();

  add(
    checks,
    "known-targets",
    "structure",
    "block",
    "Every action target must resolve to a known page, section, component, or approved temporary reference.",
    true,
  );

  if (types.has("add_page") || types.has("delete_page")) {
    add(checks, "route-integrity", "structure", "block", "Verify routes and slugs remain unique and reachable.", false);
    runtimeChecks.push("navigate every affected route");
  }

  if (
    types.has("set_section_text") ||
    types.has("add_section") ||
    types.has("delete_section") ||
    types.has("reorder_sections")
  ) {
    add(
      checks,
      "content-integrity",
      "content",
      "block",
      "Verify no affected section is empty, duplicated, or left with placeholder/template copy.",
      true,
    );
  }

  if (types.has("add_component") || /\b(cta|conversion|booking|lead|quote|contact)\b/.test(value)) {
    add(
      checks,
      "cta-path",
      "conversion",
      "block",
      "Verify primary CTAs have a real destination and no empty/placeholder action.",
      true,
    );
    runtimeChecks.push("activate the primary CTA and verify the destination");
  }

  if (types.has("set_page") || /\bseo|search|google|metadata\b/.test(value)) {
    add(
      checks,
      "metadata-contract",
      "seo",
      "block",
      "Verify title, description, canonical and visibility policy are internally consistent.",
      true,
    );
    runtimeChecks.push("inspect rendered metadata and canonical");
  }

  if (types.has("set_section_visual") || types.has("set_section_effect") || types.has("set_theme")) {
    add(
      checks,
      "visual-contract",
      "responsive",
      "warn",
      "Verify visual changes remain readable, non-overlapping and consistent with the design system.",
      false,
    );
    runtimeChecks.push("compare desktop, tablet and mobile screenshots");
    runtimeChecks.push("check reduced-motion behavior");
  }

  add(
    checks,
    "accessibility-contract",
    "accessibility",
    "block",
    "Verify interactive controls have accessible names and focus remains visible.",
    false,
  );
  runtimeChecks.push("keyboard traversal");
  runtimeChecks.push("focus visibility");
  runtimeChecks.push("screen-reader smoke test");
  runtimeChecks.push("contrast measurement");

  if (types.has("set_section_effect") || types.has("set_section_visual") || types.has("set_theme")) {
    add(
      checks,
      "performance-contract",
      "performance",
      "warn",
      "Verify animation density, image weight, layout shift and runtime JavaScript cost.",
      false,
    );
    runtimeChecks.push("Core Web Vitals");
    runtimeChecks.push("network waterfall");
    runtimeChecks.push("console/runtime errors");
  }

  add(
    checks,
    "tenant-boundary",
    "security",
    "block",
    "Verify the changed flow cannot cross workspace ownership boundaries.",
    false,
  );
  runtimeChecks.push("adversarial cross-tenant access probe");

  if (
    types.has("delete_page") ||
    types.has("delete_section") ||
    types.has("delete_component") ||
    actions.length >= 40
  ) {
    blockers.push("High-impact change set requires snapshot and explicit rollback capability.");
  }

  const destructive = actions.filter((action) =>
    ["delete_page", "delete_section", "delete_component"].includes(action.type),
  ).length;
  const risky =
    destructive > 0 ||
    types.has("set_theme") ||
    types.has("set_backdrop") ||
    actions.length >= 35;

  const critical =
    destructive >= 3 ||
    (actions.length >= 50 && (types.has("delete_page") || types.has("delete_section")));

  const risk: VerificationContract["risk"] = critical
    ? "critical"
    : risky
      ? "high"
      : actions.length >= 20
        ? "medium"
        : "low";

  const rollbackRequired = risk === "high" || risk === "critical" || destructive > 0;

  if (rollbackRequired) {
    blockers.push("Snapshot before execution and restore on failed verification.");
  }

  const deterministicCount = checks.filter((check) => check.deterministic).length;
  const summary =
    `Verification contract: ${checks.length} checks, ${deterministicCount} deterministic, ${runtimeChecks.length} runtime checks, risk ${risk}.`;

  return {
    checks,
    blockers: Array.from(new Set(blockers)),
    runtimeChecks: Array.from(new Set(runtimeChecks)),
    risk,
    rollbackRequired,
    summary,
  };
}
