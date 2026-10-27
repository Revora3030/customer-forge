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

/* ------------------------- triage, activity and search ------------------------ */

export const FAILED_STATUSES = ["failed", "error"] as const;
export const WAITING_STATUSES = ["pending", "waiting", "queued", "retrying"] as const;
const isFailed = (status: string) => (FAILED_STATUSES as readonly string[]).includes(status);
const isWaiting = (status: string) => (WAITING_STATUSES as readonly string[]).includes(status);

const allRows = (snapshot: CitySnapshot | undefined): CityWork[] => Object.values(snapshot?.sources ?? {}).flatMap((source) => source.rows);

/** Records that need the owner, most urgent first: failures, then the longest-waiting items. */
export type AttentionItem = { row: CityWork; district: DistrictId; kind: "failed" | "waiting"; ageMs: number };

export function attentionItems(snapshot: CitySnapshot | undefined, now: number, limit = 30): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const row of allRows(snapshot)) {
    const kind = isFailed(row.status) ? "failed" : isWaiting(row.status) ? "waiting" : null;
    const at = Date.parse(row.at);
    if (!kind || !Number.isFinite(at)) continue;
    items.push({ row, district: row.district, kind, ageMs: Math.max(0, now - at) });
  }
  // Failures before waiting; within each, the longest-standing first so nothing rots.
  items.sort((a, b) => (a.kind === b.kind ? b.ageMs - a.ageMs : a.kind === "failed" ? -1 : 1));
  return items.slice(0, limit);
}

export type DistrictCounts = { running: number; queued: number; errors: number; total: number };

export function districtCounts(snapshot: CitySnapshot | undefined, id: DistrictId, now: number): DistrictCounts | null {
  if (!snapshot) return null;
  const rows = allRows(snapshot).filter((row) => row.district === id);
  return {
    running: rows.filter((row) => workIsActive(row, now)).length,
    queued: rows.filter((row) => isWaiting(row.status)).length,
    errors: rows.filter((row) => isFailed(row.status)).length,
    total: rows.length,
  };
}

/** Records per hour for the last `hours` hours, oldest first. Only recorded timestamps are counted. */
export function hourlyBuckets(rows: readonly CityWork[], now: number, hours = 24): number[] {
  const buckets = new Array<number>(hours).fill(0);
  for (const row of rows) {
    const at = Date.parse(row.at);
    if (!Number.isFinite(at) || at > now) continue;
    const back = Math.floor((now - at) / 3_600_000);
    if (back < hours) buckets[hours - 1 - back] = (buckets[hours - 1 - back] ?? 0) + 1;
  }
  return buckets;
}

export function searchWork(rows: readonly CityWork[], query: string): CityWork[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...rows];
  return rows.filter((row) => {
    const haystack = [row.title, row.source, row.status, row.model ?? "", row.detail ?? ""].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Newest first across every district, optionally narrowed to one district and a text query. */
export function activityFeed(snapshot: CitySnapshot | undefined, options: { district?: DistrictId | null; query?: string; limit?: number } = {}): CityWork[] {
  let rows = allRows(snapshot);
  if (options.district) rows = rows.filter((row) => row.district === options.district);
  rows = searchWork(rows, options.query ?? "");
  return rows.filter((row) => Number.isFinite(Date.parse(row.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, options.limit ?? 40);
}

export function districtFromParam(value: unknown): DistrictId | null {
  return CITY_DISTRICTS.find((district) => district.id === value)?.id ?? null;
}

/** "3m", "2h", "5d" — how long ago, for dense lists. */
export function ageLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** Digit keys 1-7 and arrow keys move between districts; anything else is ignored. */
export function districtForKey(key: string, current: DistrictId): DistrictId | null {
  const index = CITY_DISTRICTS.findIndex((district) => district.id === current);
  if (/^[1-7]$/.test(key)) return CITY_DISTRICTS[Number(key) - 1]?.id ?? null;
  if (key === "ArrowRight" || key === "ArrowDown") return CITY_DISTRICTS[(index + 1) % CITY_DISTRICTS.length]?.id ?? null;
  if (key === "ArrowLeft" || key === "ArrowUp") return CITY_DISTRICTS[(index - 1 + CITY_DISTRICTS.length) % CITY_DISTRICTS.length]?.id ?? null;
  return null;
}
