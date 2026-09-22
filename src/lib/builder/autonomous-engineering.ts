import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

import { ctaTarget, pageSeo, sectionCopy, type CopyFacts } from "./copy";
import { playbookFor } from "./industry";

export type AutonomousPhase =
  | "understand"
  | "architecture"
  | "conversion"
  | "content"
  | "visual"
  | "responsive"
  | "accessibility"
  | "seo"
  | "performance"
  | "security"
  | "verification"
  | "recovery";

export type AutonomousFinding = {
  phase: AutonomousPhase;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  evidence: string;
  repairable: boolean;
};

export type AutonomousEngineeringPlan = {
  phases: AutonomousPhase[];
  findings: AutonomousFinding[];
  actions: AgentAction[];
  blocked: string[];
  runtimeRequired: string[];
  score: number;
  summary: string;
  recoveryStrategy: string[];
};

function factsOf(context: AgentContext): CopyFacts {
  return {
    name: context.business.name,
    industry: context.business.industry,
    tagline: context.business.tagline,
    description: context.business.description,
    city: context.business.city,
    state: context.business.state,
    serviceArea: context.business.serviceArea,
    phone: context.business.phone,
    email: context.business.email,
    services: context.business.services.map((service) => ({ name: service.name })),
  };
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function actionSignature(action: AgentAction): string {
  switch (action.type) {
    case "set_section_text":
      return `${action.type}:${action.sectionId}:${action.field}`;
    case "set_section_visibility":
    case "set_section_variant":
    case "set_section_visual":
    case "set_custom_block":
    case "set_section_effect":
    case "delete_section":
      return `${action.type}:${action.sectionId}`;
    case "set_component":
    case "set_component_visual":
    case "generate_component_image":
    case "delete_component":
      return `${action.type}:${action.componentId}`;
    case "add_section":
      return `${action.type}:${action.pageId}:${action.ref ?? action.kind}`;
    case "add_component":
      return `${action.type}:${action.sectionId}:${action.kind}:${action.label ?? ""}`;
    case "reorder_sections":
      return `${action.type}:${action.pageId}`;
    case "reorder_components":
      return `${action.type}:${action.sectionId}`;
    case "add_page":
      return `${action.type}:${action.ref ?? action.slug}`;
    case "set_page":
    case "delete_page":
      return `${action.type}:${action.pageId}`;
    case "set_theme":
    case "set_backdrop":
      return action.type;
    case "set_business_fact":
      return `${action.type}:${action.field}`;
  }
}

function pushUnique(actions: AgentAction[], action: AgentAction, cap: number): void {
  if (actions.length >= cap) return;
  const signature = actionSignature(action);
  if (actions.some((existing) => actionSignature(existing) === signature)) return;
  actions.push(action);
}

function hasAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function hasCta(section: AgentContext["pages"][number]["sections"][number]): boolean {
  return section.components.some((component) => {
    const kind = text(component.kind).toLowerCase();
    const label = text(component.label).toLowerCase();
    const url = text(component.link_url).toLowerCase();
    return (
      kind === "button" ||
      kind === "form" ||
      /(book|quote|contact|call|start|get started|request|schedule)/.test(label) ||
      /(book|quote|contact|call|schedule|lead)/.test(url)
    );
  });
}

function pageHasContent(page: AgentContext["pages"][number]): boolean {
  return page.sections.some((section) =>
    [section.heading, section.subheading, section.body].some((value) => text(value).length > 0),
  );
}

function containsPlaceholder(value: string): boolean {
  return /\b(lorem ipsum|your company|company name|business name|placeholder|sample text|coming soon|todo|tbd|insert text|click here)\b/i.test(
    value,
  );
}

function scoreFindings(findings: AutonomousFinding[]): number {
  let score = 100;
  for (const finding of findings) {
    score -=
      finding.severity === "critical"
        ? 18
        : finding.severity === "high"
          ? 10
          : finding.severity === "medium"
            ? 5
            : 2;
  }
  return Math.max(0, Math.min(100, score));
}

function requestedPhases(instruction: string, wholeSite: boolean): AutonomousPhase[] {
  const value = instruction.toLowerCase();
  const phases: AutonomousPhase[] = ["understand", "architecture"];

  if (wholeSite || hasAny(value, ["conversion", "sales", "lead", "booking", "cta", "customer"])) {
    phases.push("conversion");
  }
  if (wholeSite || hasAny(value, ["copy", "text", "rewrite", "content", "headline"])) phases.push("content");
  if (wholeSite || hasAny(value, ["design", "visual", "premium", "beautiful", "3d", "animation", "modern"])) {
    phases.push("visual");
  }
  if (wholeSite || hasAny(value, ["mobile", "responsive", "phone", "tablet"])) phases.push("responsive");
  if (wholeSite || hasAny(value, ["accessibility", "accessible", "keyboard", "contrast", "aria"])) phases.push("accessibility");
  if (wholeSite || hasAny(value, ["seo", "search", "google", "metadata", "schema"])) phases.push("seo");
  if (wholeSite || hasAny(value, ["speed", "fast", "performance", "loading", "optimize"])) phases.push("performance");
  if (wholeSite || hasAny(value, ["security", "safe", "tenant", "privacy", "permission"])) phases.push("security");
  if (wholeSite || hasAny(value, ["test", "qa", "verify", "audit", "broken", "fix"])) phases.push("verification");
  if (wholeSite || hasAny(value, ["restore", "rollback", "undo", "recover"])) phases.push("recovery");

  return unique(phases);
}

/**
 * Deterministic "Builder 2.0" operating system.
 *
 * This layer deliberately does not pretend to have a browser, model provider,
 * production telemetry, or database authority. It converts the current site
 * graph into a bounded engineering plan and safe actions. Runtime evidence is
 * explicitly returned as a boundary for the existing browser/verification
 * pipeline.
 */
export function compileAutonomousEngineering(
  context: AgentContext,
  instruction: string,
  wholeSite: boolean,
  cap = 60,
): AutonomousEngineeringPlan {
  const facts = factsOf(context);
  const playbook = playbookFor(context.business.industry, instruction);
  const value = instruction.toLowerCase();
  const findings: AutonomousFinding[] = [];
  const actions: AgentAction[] = [];
  const blocked: string[] = [];
  const runtimeRequired: string[] = [];
  const phases = requestedPhases(instruction, wholeSite);

  const addFinding = (
    phase: AutonomousPhase,
    severity: AutonomousFinding["severity"],
    message: string,
    evidence: string,
    repairable: boolean,
  ) => findings.push({ phase, severity, message, evidence, repairable });

  /* Architecture / site graph */
  const slugs = new Map<string, number>();
  for (const page of context.pages) {
    const normalizedSlug = text(page.slug).toLowerCase().replace(/^\/+|\/+$/g, "");
    const slug = normalizedSlug || "/";
    slugs.set(slug, (slugs.get(slug) ?? 0) + 1);
    if (!pageHasContent(page)) {
      addFinding("architecture", "high", "Page has no meaningful visible content.", page.id, false);
    }
  }

  for (const [slug, count] of slugs) {
    if (count > 1) {
      addFinding("architecture", "medium", "Duplicate page slug detected.", `${slug} × ${count}`, false);
    }
  }

  if (context.pages.length === 0) {
    addFinding("architecture", "critical", "No pages are available to plan against.", "pages.length = 0", false);
    blocked.push("Cannot safely target a page until the workspace exposes at least one page.");
  }

  /* Content quality */
  for (const page of context.pages.slice(0, 20)) {
    for (const section of page.sections.slice(0, 20)) {
      const combined = [section.heading, section.subheading, section.body].map(text).join(" ");
      if (containsPlaceholder(combined)) {
        addFinding(
          "content",
          "high",
          "Placeholder or template copy is present.",
          `${page.slug}/${section.kind}`,
          true,
        );
      }
    }
  }

  /* Conversion intelligence */
  const hasContactRoute = context.pages.some(
    (page) => text(page.slug).toLowerCase().replace(/^\/+|\/+$/g, "") === "contact",
  );
  const directTarget =
    ctaTarget(facts);
  const target =
    directTarget && (Boolean(text(facts.phone)) || Boolean(text(facts.email)) || hasContactRoute)
      ? directTarget
      : null;
  const pagesMissingCta = context.pages.filter((page) => {
    const host = page.sections.find((section) => section.kind === "hero") ?? page.sections[0];
    return Boolean(host) && !hasCta(host!);
  });

  if (pagesMissingCta.length > 0) {
    addFinding(
      "conversion",
      "high",
      "Visible pages lack a clear primary action.",
      pagesMissingCta.map((page) => page.slug).slice(0, 8).join(", "),
      Boolean(target),
    );

    if (target) {
      for (const page of pagesMissingCta.slice(0, 8)) {
        const host = page.sections.find((section) => section.kind === "hero") ?? page.sections[0];
        if (!host) continue;
        pushUnique(
          actions,
          {
            type: "add_component",
            sectionId: host.id,
            kind: "button",
            label: playbook.ctaLabels.primary,
            link_url: target.url,
            link_label: playbook.ctaLabels.primary,
          },
          cap,
        );
      }
    } else {
      blocked.push("Primary conversion destination is not known; no external or invented CTA target was created.");
    }
  }

  /* Content completion: only fill genuinely empty fields. */
  for (const page of context.pages.slice(0, 12)) {
    for (const section of page.sections.slice(0, 12)) {
      if (actions.length >= cap) break;
      const copy = sectionCopy(section.kind, facts, playbook);
      if (!text(section.heading) && text(copy.heading)) {
        pushUnique(actions, { type: "set_section_text", sectionId: section.id, field: "heading", value: copy.heading }, cap);
      }
      if (!text(section.subheading) && text(copy.subheading)) {
        pushUnique(actions, { type: "set_section_text", sectionId: section.id, field: "subheading", value: copy.subheading }, cap);
      }
      if (!text(section.body) && text(copy.body)) {
        pushUnique(actions, { type: "set_section_text", sectionId: section.id, field: "body", value: copy.body ?? "" }, cap);
      }
    }
  }

  /* SEO: repair missing page metadata without inventing facts. */
  for (const page of context.pages.slice(0, 20)) {
    const seoTitle = text((page as { seo_title?: string }).seo_title);
    const seoDescription = text((page as { seo_description?: string }).seo_description);
    if (!seoTitle || !seoDescription) {
      addFinding("seo", "medium", "Page metadata is incomplete.", page.slug, true);
      pushUnique(
        actions,
        {
          type: "set_page",
          pageId: page.id,
          patch: pageSeo(page.title || "Page", facts, playbook),
        },
        cap,
      );
    }
  }

  /* Accessibility: semantic gaps are detectable, but contrast/screen-reader
     rendering remains a runtime boundary. */
  for (const page of context.pages.slice(0, 12)) {
    for (const section of page.sections.slice(0, 12)) {
      for (const component of section.components.slice(0, 20)) {
        const kind = text(component.kind).toLowerCase();
        const label = text(component.label);
        if ((kind === "button" || kind === "link" || kind === "image") && !label) {
          addFinding(
            "accessibility",
            "medium",
            "Interactive/media component lacks an explicit human-readable label.",
            `${page.slug}/${section.kind}/${component.id}`,
            false,
          );
        }
      }
    }
  }
  runtimeRequired.push("contrast measurement", "keyboard traversal", "screen-reader behavior");

  /* Performance: flag complexity, but never claim a measured load time. */
  const visualComplexity = context.pages.reduce(
    (total, page) =>
      total +
      page.sections.reduce(
        (sectionTotal, section) => sectionTotal + section.components.length,
        0,
      ),
    0,
  );
  if (visualComplexity > 120) {
    addFinding(
      "performance",
      "medium",
      "The site contains a large number of rendered components and deserves runtime performance verification.",
      `${visualComplexity} rendered components in the available site map`,
      false,
    );
  }
  runtimeRequired.push("Core Web Vitals", "network waterfall", "runtime JavaScript cost");

  /* Responsive */
  const densePages = context.pages.filter((page) => page.sections.length > 14);
  if (densePages.length > 0) {
    addFinding(
      "responsive",
      "low",
      "Long page structures deserve mobile layout verification.",
      densePages.map((page) => page.slug).slice(0, 6).join(", "),
      false,
    );
  }
  runtimeRequired.push("desktop/mobile visual comparison", "touch target verification");

  /* Security / tenant safety */
  if (hasAny(value, ["security", "tenant", "permission", "privacy"]) || wholeSite) {
    addFinding(
      "security",
      "medium",
      "Tenant isolation and privileged boundaries require environment-level adversarial evidence.",
      "RLS/server-auth/runtime configuration",
      false,
    );
    blocked.push("Do not infer tenant isolation from the builder plan; require RLS and server authorization evidence.");
  }

  /* Browser verification */
  if (wholeSite || hasAny(value, ["qa", "test", "verify", "audit", "broken", "fix"])) {
    runtimeRequired.push(
      "real browser navigation",
      "console/runtime errors",
      "form submission",
      "visual screenshot comparison",
    );
  }

  /* Recovery */
  if (actions.length > 0) {
    phases.push("recovery");
  }
  const recoveryStrategy = [
    "Snapshot before applying a high-risk plan.",
    "Apply bounded actions through the existing executor only.",
    "Run deterministic validation after execution.",
    "If verification fails, isolate the failed action group rather than retrying the entire plan blindly.",
    "Restore the last known-good snapshot when a safe repair cannot be proven.",
  ];

  const score = scoreFindings(findings);
  const summary =
    `Autonomous Engineering 2.0: ${actions.length} safe action${actions.length === 1 ? "" : "s"}, ${findings.length} finding${findings.length === 1 ? "" : "s"}, ${runtimeRequired.length} runtime verification boundary${runtimeRequired.length === 1 ? "" : "ies"}, score ${score}/100.`;

  return {
    phases: unique(phases),
    findings: findings.slice(0, 60),
    actions,
    blocked: unique(blocked).slice(0, 20),
    runtimeRequired: unique(runtimeRequired).slice(0, 30),
    score,
    summary,
    recoveryStrategy,
  };
}
