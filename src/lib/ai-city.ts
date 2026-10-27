export const CITY_DISTRICTS = [
  { id: "executive", name: "Jarvis Tower", subtitle: "Executive operations", role: "Jarvis", position: [0, 0] as [number, number], height: 7, tone: "gold", route: "/admin/jarvis", tool: "platform.errors.summary", mission: "Inspect real operations and prioritize the highest-impact work. Propose actions with evidence; do not spend, send or publish without my explicit approval." },
  { id: "factory", name: "Website Factory", subtitle: "Design · QA · SEO", role: "Sol · Terra · Luna", position: [-7, 0] as [number, number], height: 4.5, tone: "cyan", route: "/admin/websites", tool: "builder.health.summary", mission: "Inspect website jobs and saved results. Identify incomplete pages and the next Sol, Terra and Luna handoff. Draft a repair plan; no paid build or publishing without approval." },
  { id: "institute", name: "AI Institute", subtitle: "Model evidence & evaluation", role: "Terra", position: [0, -7] as [number, number], height: 4, tone: "cyan", route: "/admin/ai", tool: "ai.providers.snapshot", mission: "Review recorded Lovable model performance and capability evidence. Separate configured models from tested capabilities. Propose an evaluation plan without running paid calls." },
  { id: "creative", name: "Creative District", subtitle: "Images · motion · voice", role: "Sunburst · Flare · Whisper", position: [7, -7] as [number, number], height: 4.5, tone: "magenta", route: "/admin/command", tool: "connectors.permissions.snapshot", mission: "Inspect creative media capabilities and pending assets. Prepare grounded shot lists and voice or motion plans. Label unavailable capabilities; do not generate paid assets without approval." },
  { id: "growth", name: "Growth & Sales Hub", subtitle: "Scout · demos · deal desk", role: "Acquisition team", position: [7, 0] as [number, number], height: 5, tone: "gold", route: "/admin/growth", tool: "growth.funnel.summary", mission: "Review the real acquisition funnel and pending growth approvals. Prioritize evidence-backed prospect research, private demos and outreach drafts. No external sends or paid work without approval." },
  { id: "security", name: "Reliability Center", subtitle: "Security & release control", role: "Terra · Jarvis", position: [-7, 7] as [number, number], height: 3.8, tone: "cyan", route: "/admin/monitoring", tool: "database.contracts.probe", mission: "Inspect recorded platform errors and database contracts. Diagnose failures and propose safe repairs while preserving tenant isolation, auth and billing. Never deploy or change permissions without approval." },
  { id: "knowledge", name: "Knowledge Library", subtitle: "Memory & business facts", role: "Institutional memory", position: [7, 7] as [number, number], height: 3.5, tone: "magenta", route: "/admin/jarvis", tool: "connectors.permissions.snapshot", mission: "Review saved owner memory and business context for missing or contradictory facts. Propose knowledge cleanup; never invent claims or silently change saved rules." },
] as const;

export type DistrictId = typeof CITY_DISTRICTS[number]["id"];
export type CityWork = { id: string; district: DistrictId; title: string; status: string; at: string; source: string; organizationId?: string; model?: string | null; progress?: number; detail?: string | null; runId?: string };
export type CitySource = { available: boolean; rows: CityWork[]; total: number | null; truncated: boolean };
export type CitySnapshot = { checkedAt: string; sources: Record<string, CitySource>; pipeline?: PipelineCounts };

// Only an explicit running record with a recent heartbeat may animate a district.
export function workIsActive(work: CityWork, now: number): boolean {
  const age = now - Date.parse(work.at);
  return work.status === "running" && age >= 0 && age < 15 * 60_000;
}

export function districtState(id: DistrictId, snapshot: CitySnapshot | undefined, now: number) {
  if (!snapshot) return "unavailable";
  const sources = Object.values(snapshot.sources).filter(s => s.rows.some(r => r.district === id));
  const dependencies: Record<DistrictId, string[]> = { executive: ["events", "routines"], factory: ["jobs"], institute: ["traces"], creative: ["images"], growth: ["approvals", "automations"], security: ["errors"], knowledge: ["memories"] };
  if (dependencies[id].some(key => !snapshot.sources[key]?.available)) return "unavailable";
  const rows = sources.flatMap(s => s.rows).filter(r => r.district === id);
  if (rows.some(r => workIsActive(r, now))) return "working";
  if (rows.some(r => ["failed", "error", "pending", "waiting"].includes(r.status))) return "attention";
  return "idle";
}

export function cityCommandDraft(id: DistrictId) {
  const district = CITY_DISTRICTS.find(d => d.id === id);
  return district ? `[AI City · ${district.name}] ${district.mission}` : "";
}
export type PipelineCounts = { found: number | null; demoReady: number | null; awaitingApproval: number | null; sent: number | null; replied: number | null };
export const PIPELINE_STAGES = [
  { key: "found", label: "Found" },
  { key: "demoReady", label: "Demo ready" },
  { key: "awaitingApproval", label: "Awaiting approval" },
  { key: "sent", label: "Sent" },
  { key: "replied", label: "Replied" },
] as const;

// A failed read is "Unavailable", never a zero that looks like an empty funnel.
export function pipelineStages(counts: PipelineCounts | null | undefined) {
  return PIPELINE_STAGES.map(stage => {
    const value = counts ? counts[stage.key] : null;
    return { ...stage, value, display: typeof value === "number" ? String(value) : "Unavailable" };
  });
}

export function offerPriceSentence(rates: { setupPrice: number; monthlyPrice: number }) {
  return `$${rates.setupPrice} one-time setup, first month free, then $${rates.monthlyPrice}/month.`;
}

export type SalesMission = "scout" | "demo" | "pitch";
export function salesMissionDraft(kind: SalesMission, rates: { setupPrice: number; monthlyPrice: number }) {
  const gate = "Do not send, publish or spend without my explicit approval.";
  if (kind === "scout") return `[AI City · Scout] Find prospects with the OpenStreetMap search only: businesses with no website or a weak website that list a public email. Show evidence for each. ${gate}`;
  if (kind === "demo") return `[AI City · Demo Forge] For the prospect I choose, prepare a private demo site through the existing demo builder and its daily limit, spend cap and launch checks. ${gate}`;
  return `[AI City · Pitch] Draft an outreach email for the prospect I choose and add it to the approval queue. Include exactly this price sentence: "${offerPriceSentence(rates)}" Use only verified facts. ${gate}`;
}
