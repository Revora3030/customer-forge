export function critiquePlan<T extends { actions: { type: string }[]; notes: string[]; trace: string[]; coverage: string }>(plan: T): T {
  const actionTypes = new Set(plan.actions.map((action) => action.type));
  const notes = [...plan.notes];
  const trace = [...plan.trace];
  const checks = [
    { label: "conversion", types: ["set_section_text", "set_component", "add_component", "set_section_variant"] },
    { label: "premium presentation", types: ["set_theme", "set_section_variant", "set_section_effect", "set_backdrop", "set_section_text"] },
    { label: "search visibility", types: ["set_page", "set_section_text", "add_section", "set_component"] },
    { label: "mobile experience", types: ["set_section_text", "set_section_variant", "set_component"] },
  ];
  const represented = checks.filter((check) => check.types.some((type) => actionTypes.has(type))).map((check) => check.label);
  trace.push(`Autonomous Brain v5: self-critique inspected ${plan.actions.length} native actions across ${represented.length} core outcome dimensions.`);
  if (!plan.actions.length) notes.push("Self-critique found no native actions to execute; the request should remain a question rather than inventing work.");
  return { ...plan, notes: [...new Set(notes)], trace: [...new Set(trace)] };
}
