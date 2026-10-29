import { z } from "zod";

/**
 * Agent gateway shapes, shared by the /api/public/agent/* routes and tests.
 * Browser-safe: no secrets, no database.
 *
 * Leads sent by an outside bot (Grok) go to the same owner review list as a
 * CSV import. Nothing here contacts anyone or starts a build.
 */

export const MAX_PROSPECTS_PER_CALL = 25;

const url = z.string().trim().url().max(300).refine((v) => /^https?:\/\//i.test(v), "must be http(s)");

export const agentProspectSchema = z
  .object({
    business_name: z.string().trim().min(1).max(160),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().max(40).optional(),
    trade: z.string().trim().min(1).max(80),
    contact_name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    verified_email: z.string().trim().toLowerCase().email().max(200).optional(),
    source_url: url.optional(),
    website: url.optional(),
    /** 1–10, higher is a better fit. */
    score: z.number().int().min(1).max(10).optional(),
    why_selected: z.string().trim().max(500).optional(),
  })
  .strict()
  // A public email is only accepted with the page it was found on.
  .refine((lead) => !lead.verified_email || !!lead.source_url, {
    message: "verified_email needs the source_url of the page where it is shown",
    path: ["source_url"],
  });

export const agentProspectBatchSchema = z
  .object({ prospects: z.array(agentProspectSchema).min(1).max(MAX_PROSPECTS_PER_CALL) })
  .strict();

export type AgentProspect = z.infer<typeof agentProspectSchema>;

const csvCell = (value: string | number | undefined): string => {
  const text = value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Turn gateway leads into the CSV the existing import reads, so both paths share every check. */
export function prospectsToCsv(prospects: readonly AgentProspect[]): string {
  const header = ["business name", "contact name", "city", "state", "category", "phone", "email", "website", "source", "score", "notes"];
  const rows = prospects.map((p) =>
    [p.business_name, p.contact_name, p.city, p.state, p.trade, p.phone, p.verified_email, p.website, p.source_url, p.score, p.why_selected].map(csvCell).join(","),
  );
  return [header.map(csvCell).join(","), ...rows].join("\n");
}

/** Constant-time comparison of the presented key with the configured one. */
export function agentKeyMatches(presented: string | null | undefined, expected: string | null | undefined): boolean {
  if (!presented || !expected || expected.length < 24) return false;
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}
