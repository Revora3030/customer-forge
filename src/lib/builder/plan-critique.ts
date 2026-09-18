/**
 * Requirement-aware self-critique for native Revora plans.
 *
 * The old critique only counted generic action types. This version also reads
 * the intent that produced the plan, so a plan can be flagged when it has
 * actions but does not clearly address what the owner actually asked for.
 */
type CritiqueIntent = {
  goals?: string[];
  sectionKinds?: string[];
  moods?: string[];
  verbs?: string[];
};

const unique = <T>(items: T[]): T[] => [...new Set(items)];

function actionText(actions: { type: string }[]): string {
  return actions.map((action) => JSON.stringify(action)).join(" ").toLowerCase();
}

function requestedRequirements(intent: CritiqueIntent): string[] {
  const labels: string[] = [];
  const goals = new Set(intent.goals ?? []);
  const moods = new Set(intent.moods ?? []);

  if (goals.has("conversion") || goals.has("leads") || goals.has("booking") || goals.has("calls")) {
    labels.push("conversion");
  }
  if (goals.has("seo") || goals.has("local_seo")) labels.push("search visibility");
  if (goals.has("mobile")) labels.push("mobile experience");
  if (goals.has("trust")) labels.push("trust");
  if (goals.has("visual") || moods.has("premium") || moods.has("modern") || moods.has("bold")) {
    labels.push("visual presentation");
  }
  if ((intent.sectionKinds ?? []).length) labels.push("requested sections");

  return unique(labels);
}

function coveredRequirements(text: string, actionTypes: Set<string>): string[] {
  const covered: string[] = [];

  if (
    /call|book|quote|lead|cta|conversion/.test(text) &&
    (actionTypes.has("set_section_text") ||
      actionTypes.has("set_component") ||
      actionTypes.has("add_component") ||
      actionTypes.has("add_section"))
  ) {
    covered.push("conversion");
  }

  if (
    /seo|meta|canonical|noindex|search|google/.test(text) ||
    actionTypes.has("set_page")
  ) {
    covered.push("search visibility");
  }

  if (
    /mobile|responsive|phone|tablet/.test(text) ||
    actionTypes.has("set_section_variant") ||
    actionTypes.has("set_theme")
  ) {
    covered.push("mobile experience");
  }

  if (
    /review|testimonial|trust|credential|badge/.test(text) &&
    (actionTypes.has("set_section_text") ||
      actionTypes.has("set_component") ||
      actionTypes.has("add_section") ||
      actionTypes.has("add_component"))
  ) {
    covered.push("trust");
  }

  if (
    actionTypes.has("set_theme") ||
    actionTypes.has("set_section_variant") ||
    actionTypes.has("set_section_effect") ||
    actionTypes.has("set_backdrop")
  ) {
    covered.push("visual presentation");
  }

  if (actionTypes.has("add_section") || actionTypes.has("set_section_variant")) {
    covered.push("requested sections");
  }

  return unique(covered);
}

export function critiquePlan<
  T extends {
    actions: { type: string }[];
    notes: string[];
    trace: string[];
    coverage: string;
    intent?: CritiqueIntent;
  },
>(plan: T): T {
  const actionTypes = new Set(plan.actions.map((action) => action.type));
  const notes = [...plan.notes];
  const trace = [...plan.trace];
  const text = actionText(plan.actions);
  const requested = requestedRequirements(plan.intent ?? {});
  const covered = coveredRequirements(text, actionTypes);
  const missing = requested.filter((requirement) => !covered.includes(requirement));

  trace.push(
    `Autonomous Brain v8: self-critique inspected ${plan.actions.length} native actions against ${requested.length} requested requirement${requested.length === 1 ? "" : "s"}.`,
  );

  if (missing.length) {
    notes.push(
      `Requirement gap detected: ${missing.join(", ")}. The plan may need another focused pass before execution.`,
    );
    trace.push(
      `Autonomous Brain v8: detected uncovered requirements — ${missing.join(", ")}.`,
    );
  } else if (requested.length) {
    trace.push("Autonomous Brain v8: all detected request requirements have at least one supporting native action.");
  }

  if (!plan.actions.length) {
    notes.push("Self-critique found no native actions to execute; the request should remain a question rather than inventing work.");
  }

  return {
    ...plan,
    coverage: missing.length && plan.actions.length ? "partial" : plan.coverage,
    notes: unique(notes),
    trace: unique(trace),
  };
}
