/**
 * Stores the owner's "Rules for my site", one row per workspace.
 *
 * Runs through the caller's own client, so RLS decides who can read or write.
 * Reading must never block a build: a failure simply means no rules brief.
 */

import { checkSiteRules, siteRulesBrief } from "@/lib/builder/site-rules";

type RulesClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    upsert: (
      row: unknown,
      options: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

/** The owner's rules text, or "" when none are set. Never throws. */
export async function loadSiteRules(client: RulesClient, organizationId: string): Promise<string> {
  try {
    const { data, error } = await client
      .from("website_rules")
      .select("rules")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) return "";
    const rules = (data as { rules?: unknown } | null)?.rules;
    return typeof rules === "string" ? rules : "";
  } catch {
    return "";
  }
}

/** The always-applied brief for the AI, or null when there are no rules. */
export async function siteRulesBriefFor(
  client: RulesClient,
  organizationId: string,
): Promise<string | null> {
  return siteRulesBrief(await loadSiteRules(client, organizationId));
}

export async function saveSiteRules(
  client: RulesClient,
  organizationId: string,
  userId: string | null,
  input: unknown,
): Promise<{ saved: true; rules: string }> {
  const checked = checkSiteRules(input);
  if (!checked.ok) throw new Error(checked.message);
  const { error } = await client.from("website_rules").upsert(
    {
      organization_id: organizationId,
      rules: checked.rules,
      updated_at: new Date().toISOString(),
      ...(userId ? { updated_by: userId } : {}),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new Error("Your rules couldn't be saved. Try again.");
  return { saved: true, rules: checked.rules };
}

export async function deleteSiteRules(
  client: RulesClient,
  organizationId: string,
): Promise<{ deleted: true }> {
  const { error } = await client
    .from("website_rules")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw new Error("Your rules couldn't be deleted. Try again.");
  return { deleted: true };
}
