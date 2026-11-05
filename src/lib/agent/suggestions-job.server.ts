/**
 * PAI-21 daily job: one suggestion pass per live workspace. SQL signals only,
 * no AI wording (free), nothing sent to anyone. Safe to run twice: the live
 * unique index keeps one active row per workspace + signal, and a pass only
 * creates, resolves or leaves rows.
 */
import { runSuggestionPass, type SuggestionRepo } from "@/lib/agent/suggestions.server";

export type SuggestionsJobResult = { workspaces: number; created: number; resolved: number; failed: number; stoppedEarly: boolean };

type OrgLister = () => Promise<string[]>;

export async function runSuggestionsJob(
  listOrgs: OrgLister,
  repo: SuggestionRepo,
  opts: { now?: Date; budgetMs?: number; clock?: () => number } = {},
): Promise<SuggestionsJobResult> {
  const clock = opts.clock ?? Date.now;
  const started = clock();
  const budget = opts.budgetMs ?? 8 * 60_000;
  const out: SuggestionsJobResult = { workspaces: 0, created: 0, resolved: 0, failed: 0, stoppedEarly: false };
  for (const org of await listOrgs()) {
    if (clock() - started > budget) { out.stoppedEarly = true; break; }
    out.workspaces += 1;
    try {
      const r = await runSuggestionPass(repo, org, opts.now ? { now: opts.now } : {});
      out.created += r.created;
      out.resolved += r.resolved;
    } catch (e) {
      out.failed += 1;
      console.error("[agent-suggestions] workspace pass failed", org, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/** Workspaces that aren't cancelled or suspended (same rule as the site monitor). */
export function supabaseLiveOrgLister(admin: unknown): OrgLister {
  const db = admin as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  return async () => {
    const { data, error } = await db.from("organizations").select("id, subscription_status").order("created_at").limit(2000);
    if (error) throw new Error("Couldn't list workspaces.");
    return ((data ?? []) as Array<{ id: string; subscription_status: string | null }>)
      .filter((o) => o.subscription_status !== "canceled" && o.subscription_status !== "suspended")
      .map((o) => o.id);
  };
}
