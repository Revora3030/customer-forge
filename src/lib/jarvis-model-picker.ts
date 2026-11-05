/**
 * JC-38: per-chat model picker options. Lists only conversation-roster models
 * the platform can actually try (Lovable key present; not retired in the
 * registry when the registry is readable). Health comes from recorded calls
 * only — never invents a success rate. Auto stays the platform default.
 */
import { LOVABLE_CONVERSATION_MODELS, modelDisplayName } from "@/lib/ai/lovable-models";

export type PickerHealth =
  | { kind: "recorded"; calls: number; ok: number; lastSuccessAt: string | null }
  | { kind: "none" }
  | { kind: "unavailable" };

export type PickerModel = {
  id: string;
  label: string;
  family: "openai" | "anthropic" | "google" | "other";
  /** From ai_model_registry.paid when readable; null means unknown (do not invent). */
  paid: boolean | null;
  health: PickerHealth;
};

export type PaidBudgetSnapshot = {
  settledUsd: number;
  openUsd: number;
  capUsd: number;
  day: string;
};

export type ModelPickerData = {
  /** True when the Lovable provider key is set (the only gateway). */
  configured: boolean;
  models: PickerModel[];
  /** Today's paid spend vs cap; null when the ledger could not be read. */
  paidBudget: PaidBudgetSnapshot | null;
  checkedAt: string;
};

export type RegistryRow = { model: string; provider: string; display_name: string | null; retired: boolean; paid: boolean };
export type TraceRow = { model: string | null; ok: boolean | null; created_at: string };

const key = (model: string) => model.trim().toLowerCase();

export function modelFamily(id: string): PickerModel["family"] {
  if (id.startsWith("openai/")) return "openai";
  if (id.startsWith("anthropic/")) return "anthropic";
  if (id.startsWith("google/")) return "google";
  return "other";
}

/** Aggregate recorded health per model id (case-insensitive). */
export function healthByModel(trace: readonly TraceRow[] | null): Map<string, Extract<PickerHealth, { kind: "recorded" }>> | null {
  if (!trace) return null;
  type Acc = { model: string; calls: number; ok: number; last: string | null };
  const map = new Map<string, Acc>();
  for (const row of trace) {
    const model = row.model?.trim();
    if (!model) continue;
    const acc = map.get(key(model)) ?? { model, calls: 0, ok: 0, last: null };
    acc.calls += 1;
    if (row.ok === true) {
      acc.ok += 1;
      if (!acc.last || Date.parse(row.created_at) > Date.parse(acc.last)) acc.last = row.created_at;
    }
    map.set(key(model), acc);
  }
  const out = new Map<string, Extract<PickerHealth, { kind: "recorded" }>>();
  for (const [k, acc] of map) {
    out.set(k, { kind: "recorded", calls: acc.calls, ok: acc.ok, lastSuccessAt: acc.last });
  }
  return out;
}

export function buildModelPickerData(input: {
  configured: boolean;
  roster?: readonly string[];
  registry: readonly RegistryRow[] | null;
  trace: readonly TraceRow[] | null;
  paidBudget: PaidBudgetSnapshot | null;
  checkedAt: string;
}): ModelPickerData {
  const roster = input.roster ?? (LOVABLE_CONVERSATION_MODELS as readonly string[]);
  if (!input.configured) {
    return { configured: false, models: [], paidBudget: input.paidBudget, checkedAt: input.checkedAt };
  }
  const registryById = new Map<string, RegistryRow>();
  if (input.registry) {
    for (const row of input.registry) registryById.set(key(row.model), row);
  }
  const health = healthByModel(input.trace);
  const models: PickerModel[] = [];
  for (const id of roster) {
    const reg = registryById.get(key(id));
    // When the registry is readable, skip retired ids. Unknown-to-registry ids stay listed
    // (they are on the conversation roster the router already tries).
    if (input.registry && reg?.retired) continue;
    const recorded = health?.get(key(id));
    let h: PickerHealth;
    if (health === null) h = { kind: "unavailable" };
    else if (recorded) h = recorded;
    else h = { kind: "none" };
    models.push({
      id,
      label: reg?.display_name?.trim() || modelDisplayName(id),
      family: modelFamily(id),
      paid: input.registry ? (reg ? reg.paid : null) : null,
      health: h,
    });
  }
  return { configured: true, models, paidBudget: input.paidBudget, checkedAt: input.checkedAt };
}

/** Short honest health text for an option row. */
export function healthLabel(health: PickerHealth): string {
  if (health.kind === "unavailable") return "health unavailable";
  if (health.kind === "none") return "no recorded calls";
  const rate = Math.round((health.ok / health.calls) * 100);
  return `${rate}% (${health.ok}/${health.calls})`;
}

/**
 * Warning shown when the owner picks a paid model. Null for Auto or unpaid /
 * unknown. Mentions today's cap when the ledger is readable.
 */
export function paidPickWarning(model: PickerModel | null | undefined, budget: PaidBudgetSnapshot | null): string | null {
  if (!model || model.paid !== true) return null;
  if (!budget || !(budget.capUsd > 0)) {
    return "This model uses the paid AI budget. Auto keeps the platform default (cheapest capable model first).";
  }
  const used = budget.settledUsd + budget.openUsd;
  const left = Math.max(0, budget.capUsd - used);
  return `This model uses the paid AI budget (about $${left.toFixed(2)} of $${budget.capUsd.toFixed(2)} left today, UTC). Auto keeps the platform default.`;
}
