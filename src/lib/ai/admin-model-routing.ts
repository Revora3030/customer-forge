import { ineligibleReason, surfaceFor, type CatalogueModel } from "./catalogue";

export type AdminRoutingModel = { model: string; provider: "lovable"; roles: string[]; calls: number; successes: number; failures: number };
export type RoutingUsage = { model: string | null; provider: string | null; ok: boolean | null };

/** Only regular text/vision rosters use Command Center overrides; media has dedicated selectors. */
export function adminRoutingModels(rosters: Record<string, string>, catalogue: CatalogueModel[], usage: readonly unknown[]): AdminRoutingModel[] {
  const byId = new Map(catalogue.map(model => [model.id, model]));
  const models = new Map<string, AdminRoutingModel>();
  for (const [role, list] of Object.entries(rosters)) {
    if (role === "image" || role === "transcription" || role === "speech" || role === "video") continue;
    for (const id of list.split(",").map(id => id.trim()).filter(Boolean)) {
      if (ineligibleReason(byId.get(id), surfaceFor(role, id), role === "vision")) continue;
      const row = models.get(id) ?? { model: id, provider: "lovable", roles: [], calls: 0, successes: 0, failures: 0 };
      if (!row.roles.includes(role)) row.roles.push(role);
      models.set(id, row);
    }
  }
  for (const raw of usage) {
    if (!raw || typeof raw !== "object") continue;
    const event = raw as Partial<RoutingUsage>;
    // Legacy direct-provider events must never become current routing eligibility or success evidence.
    if (event.provider !== "lovable" || !event.model) continue;
    const id = models.has(event.model) ? event.model : [...models.keys()].find(id => id.split("/").pop() === event.model);
    const row = id ? models.get(id) : undefined;
    if (!row) continue;
    row.calls += 1;
    if (event.ok === true) row.successes += 1;
    if (event.ok === false) row.failures += 1;
  }
  return [...models.values()];
}

export function validateAdminRoutingIds(ids: readonly string[], models: readonly AdminRoutingModel[]): string[] {
  const allowed = new Set(models.map(model => model.model));
  if (ids.some(id => !allowed.has(id))) throw new Error("A selected model is no longer eligible for Lovable AI routing. Refresh the model list.");
  return [...new Set(ids)];
}