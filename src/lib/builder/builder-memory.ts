/** Deterministic request-scoped long-task context. No persistence or DB access. */
export type BuilderMemory = { recentInstructions: string[]; carriedForward: string[]; constraints: string[]; goals: string[]; unresolvedSignals: string[]; summary: string; };
const CONSTRAINTS = [["do not invent","no_invention"],["don't invent","no_invention"],["keep facts","keep_facts"],["use real","keep_facts"],["mobile first","mobile_first"],["accessible","accessible"],["simple","simple"],["free","free_engine"]] as const;
const GOALS = ["conversion","leads","booking","seo","local seo","mobile","redesign","premium","performance","speed","accessibility","responsive","analytics","automation"];
function clean(value: string): string { return value.replace(/\s+/g, " ").trim().slice(0, 500); }
export function buildBuilderMemory(history: string[] = []): BuilderMemory {
 const recentInstructions = history.map(clean).filter(Boolean).slice(-12);
 const carriedForward = recentInstructions.filter((entry) => /\b(continue|keep|preserve|still|also|again|next|remaining)\b/i.test(entry)).slice(-6);
 const constraints = CONSTRAINTS.filter(([term]) => recentInstructions.some((entry) => entry.toLowerCase().includes(term))).map(([, value]) => value);
 const goals = GOALS.filter((term) => recentInstructions.some((entry) => entry.toLowerCase().includes(term)));
 const unresolvedSignals = recentInstructions.filter((entry) => /\b(need|missing|fix|failed|error|issue|question|not working|remaining)\b/i.test(entry)).slice(-8);
 const parts = [recentInstructions.length + " recent instruction" + (recentInstructions.length === 1 ? "" : "s"), carriedForward.length ? carriedForward.length + " continuity signal" + (carriedForward.length === 1 ? "" : "s") : "", constraints.length ? "constraints: " + constraints.join(", ") : "", goals.length ? "goals: " + goals.slice(0, 6).join(", ") : "", unresolvedSignals.length ? unresolvedSignals.length + " unresolved signal" + (unresolvedSignals.length === 1 ? "" : "s") : ""];
 return { recentInstructions, carriedForward, constraints: [...new Set(constraints)], goals: [...new Set(goals)], unresolvedSignals, summary: parts.filter(Boolean).join(" · ") || "No prior builder context supplied." };
}
export function memoryInstruction(history: string[] = []): string { const memory = buildBuilderMemory(history); if (!memory.carriedForward.length) return ""; return ["Prior builder context (continuity only; current instruction has priority):", ...memory.carriedForward.map((item) => "- " + item)].join("\n"); }
