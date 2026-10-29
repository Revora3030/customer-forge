import type { SupabaseClient } from "@supabase/supabase-js";
import { parseProspectDemoInput, type ProspectDemoInput } from "@/lib/jarvis-demo-site";
import { alreadyDemoed, nameCityKey, phoneKey, usPhoneE164, type AutopilotSettings, type DemoFingerprints } from "@/lib/prospect-autopilot";
import type { EmailVerification, EnrichmentSource, ProspectEnrichment } from "@/lib/prospect-enrichment";
import { isUpgradeProspect, webPresence, type SiteGap } from "@/lib/prospect-finder";
import {
  LEAD_REASON_LABELS,
  MAX_PENDING_LEADS,
  blockLabel,
  leadContacts,
  normalizeLeadRow,
  readImport,
  sourceLink,
  type ImportSummary,
  type ImportedLead,
  type LeadRejectReason,
  type QueueLead,
  type ReviewResult,
} from "@/lib/prospect-lead-import";

/**
 * Lead import for the Jarvis page. A CSV of leads collected elsewhere (the Grok
 * bots' sheet) is checked and parked in prospect_import_queue. Importing
 * contacts no one. Approving a lead hands it to the same pipeline the autopilot
 * uses: the do-not-contact list, duplicate and website checks, a verified public
 * email, a private demo workspace, and the autopilot's own limits and send gates.
 *
 * Nothing from a row's notes, source or contact name reaches a model or an email.
 * No AI module is imported here.
 */

type Db = SupabaseClient;

/** At most this many leads are released per tap, so one request stays short. */
export const MAX_RELEASE_PER_CALL = 10;
/** A claim this old belongs to a release that died; the lead goes back to pending. */
const STALE_RELEASE_MS = 15 * 60_000;
/** Same cap on website email lookups as one autopilot run. */
const MAX_WEBSITE_LOOKUPS = 4;
const TABLE = "prospect_import_queue";

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/* ------------------------------------------------------------------ import */

type ExistingKeys = { names: Set<string>; phones: Set<string>; hosts: Set<string>; emails: Set<string> };

async function existingQueueKeys(db: Db): Promise<ExistingKeys> {
  const pending = await db.from(TABLE).select("id", { count: "exact", head: true }).in("status", ["pending", "releasing"]);
  if (pending.error) throw new Error("Couldn't read the review queue.");
  if ((pending.count ?? 0) >= MAX_PENDING_LEADS) throw new Error(`The review queue already holds ${MAX_PENDING_LEADS} leads. Approve or reject some before importing more.`);
  const { data, error } = await db.from(TABLE).select("name_key, phone_key, site_host, email").limit(20_000);
  if (error) throw new Error("Couldn't read the review queue.");
  const keys: ExistingKeys = { names: new Set(), phones: new Set(), hosts: new Set(), emails: new Set() };
  for (const row of data ?? []) {
    keys.names.add(String(row.name_key));
    if (row.phone_key) keys.phones.add(String(row.phone_key));
    if (row.site_host) keys.hosts.add(String(row.site_host));
    if (row.email) keys.emails.add(String(row.email));
  }
  return keys;
}

/** Values from `column` of `table` that match any of `values`, read in small batches. A failed read throws: it never reads as "none". */
async function matching(db: Db, table: string, column: string, values: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunks([...new Set(values)], 100)) {
    const { data, error } = await db.from(table).select(column).in(column, part);
    if (error) throw new Error("Couldn't check the existing contacts. Nothing was imported.");
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) found.add(String(row[column]));
  }
  return found;
}

export type ImportDeps = { fingerprints?: (db: Db) => Promise<DemoFingerprints> };

export async function importLeadCsv(db: Db, input: { csv: string; defaultCategory?: string | null; actorId: string }, deps: ImportDeps = {}): Promise<ImportSummary> {
  const parsed = readImport(input.csv);
  if (!parsed.ok) throw new Error(parsed.message);
  const defaults = { category: (input.defaultCategory ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null };

  const skipped: ImportSummary["skipped"] = [];
  const skip = (row: number, name: string, reason: LeadRejectReason): void => {
    skipped.push({ row, name, label: LEAD_REASON_LABELS[reason] });
  };
  const leads: { row: number; lead: ImportedLead }[] = [];
  const inFile: ExistingKeys = { names: new Set(), phones: new Set(), hosts: new Set(), emails: new Set() };

  parsed.rows.forEach((cells, index) => {
    const row = index + 2; // the sheet's own row number: the header is row 1
    const result = normalizeLeadRow(cells, parsed.fields, defaults);
    if ("reason" in result) {
      skip(row, result.name, result.reason);
      return;
    }
    const { lead } = result;
    const repeats = inFile.names.has(lead.nameKey) || (lead.email && inFile.emails.has(lead.email)) || (lead.phoneKey && inFile.phones.has(lead.phoneKey)) || (lead.siteHost && inFile.hosts.has(lead.siteHost));
    if (repeats) {
      skip(row, lead.businessName, "duplicate_in_file");
      return;
    }
    inFile.names.add(lead.nameKey);
    if (lead.email) inFile.emails.add(lead.email);
    if (lead.phoneKey) inFile.phones.add(lead.phoneKey);
    if (lead.siteHost) inFile.hosts.add(lead.siteHost);
    leads.push({ row, lead });
  });

  let fresh = leads;
  if (leads.length) {
    const queued = await existingQueueKeys(db);
    const seen = await (deps.fingerprints ?? (async (client: Db) => (await import("@/lib/prospect-autopilot.server")).demoFingerprints(client)))(db);
    const emails = leads.flatMap(({ lead }) => (lead.email ? [lead.email] : []));
    const contacts = leads.flatMap(({ lead }) => leadContacts(lead));
    const [mailed, blocked] = await Promise.all([
      matching(db, "prospect_outreach", "recipient", emails),
      matching(db, "prospect_do_not_contact", "value", contacts),
    ]);
    const stop = (row: number, lead: ImportedLead): LeadRejectReason | null => {
      if (leadContacts(lead).some((contact) => blocked.has(contact))) return "do_not_contact";
      if ((lead.email && mailed.has(lead.email)) || (lead.phoneKey && seen.phones.has(lead.phoneKey))) return "already_contacted";
      if (seen.nameCity.has(lead.nameKey)) return "already_demoed";
      const queuedAlready = queued.names.has(lead.nameKey) || (lead.email && queued.emails.has(lead.email)) || (lead.phoneKey && queued.phones.has(lead.phoneKey)) || (lead.siteHost && queued.hosts.has(lead.siteHost));
      return queuedAlready ? "already_queued" : null;
    };
    fresh = leads.filter(({ row, lead }) => {
      const reason = stop(row, lead);
      if (reason) skip(row, lead.businessName, reason);
      return !reason;
    });
  }

  const batchId = crypto.randomUUID();
  let added = 0;
  for (const part of chunks(fresh, 100)) {
    const { data, error } = await db
      .from(TABLE)
      .upsert(
        part.map(({ lead }) => ({
          batch_id: batchId,
          created_by: input.actorId,
          business_name: lead.businessName,
          contact_name: lead.contactName,
          category: lead.category,
          city: lead.city,
          state: lead.state,
          address: lead.address,
          phone: lead.phone,
          email: lead.email,
          website: lead.website,
          source: lead.source,
          score: lead.score,
          notes: lead.notes,
          name_key: lead.nameKey,
          phone_key: lead.phoneKey,
          site_host: lead.siteHost,
        })),
        { onConflict: "name_key", ignoreDuplicates: true },
      )
      .select("name_key");
    if (error) throw new Error("Couldn't save the leads to the review queue. Apply the latest database migration, then try again.");
    const saved = new Set((data ?? []).map((row) => String(row.name_key)));
    added += saved.size;
    for (const { row, lead } of part) if (!saved.has(lead.nameKey)) skip(row, lead.businessName, "already_queued");
  }

  await db.from("audit_logs").insert({
    organization_id: null,
    actor_id: input.actorId,
    action: "jarvis.leads.imported",
    entity: TABLE,
    entity_id: null,
    metadata: { batch_id: batchId, read: parsed.rows.length, added, skipped: skipped.length },
  });
  skipped.sort((a, b) => a.row - b.row);
  return { batchId, read: parsed.rows.length, added, truncated: parsed.truncated, skipped: skipped.slice(0, 60), skippedCount: skipped.length };
}

/* ------------------------------------------------------------------- queue */

type QueueRow = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

function queueLead(row: QueueRow): QueueLead {
  return {
    id: String(row["id"]),
    businessName: String(row["business_name"] ?? ""),
    contactName: text(row["contact_name"]),
    category: text(row["category"]),
    city: String(row["city"] ?? ""),
    state: text(row["state"]),
    phone: text(row["phone"]),
    email: text(row["email"]),
    website: text(row["website"]),
    source: text(row["source"]),
    score: typeof row["score"] === "number" ? row["score"] : null,
    notes: text(row["notes"]),
    status: row["status"] === "blocked" ? "blocked" : row["status"] === "releasing" ? "releasing" : "pending",
    problem: text(row["blocked_reason"]),
    createdAt: String(row["created_at"] ?? ""),
  };
}

const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

/** Sites the autopilot may still create today: its daily limit minus what runs (and approvals) already built. */
async function buildsLeftToday(db: Db, settings: Pick<AutopilotSettings, "dailyBuildCap">, now: Date): Promise<number> {
  const { data, error } = await db.from("prospect_autopilot_runs").select("built").gte("started_at", startOfUtcDay(now));
  if (error) throw new Error("Couldn't read today's build count.");
  const built = (data ?? []).reduce((total, row) => total + (Number((row as { built?: unknown }).built) || 0), 0);
  return Math.max(0, settings.dailyBuildCap - built);
}

export type ImportQueue = {
  leads: QueueLead[];
  counts: { pending: number; approved: number; rejected: number; blocked: number };
  release: { pitchFirst: boolean; buildsLeftToday: number; perTap: number };
};

export async function listImportQueue(db: Db, limit = 100, deps: { settings?: (db: Db) => Promise<AutopilotSettings>; now?: () => Date } = {}): Promise<ImportQueue> {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .in("status", ["pending", "releasing", "blocked"])
    .order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new Error("Couldn't read the review queue.");
  const all = await db.from(TABLE).select("status").limit(20_000);
  const counts = { pending: 0, approved: 0, rejected: 0, blocked: 0 };
  for (const row of all.data ?? []) {
    const status = String(row.status);
    if (status === "approved") counts.approved += 1;
    else if (status === "rejected") counts.rejected += 1;
    else if (status === "blocked") counts.blocked += 1;
    else counts.pending += 1;
  }
  const settings = await (deps.settings ?? (async (client: Db) => (await import("@/lib/prospect-autopilot.server")).getAutopilotSettings(client)))(db);
  return {
    leads: (data ?? []).map((row) => queueLead(row as QueueRow)),
    counts,
    release: { pitchFirst: settings.pitchFirst, buildsLeftToday: await buildsLeftToday(db, settings, (deps.now ?? (() => new Date()))()), perTap: MAX_RELEASE_PER_CALL },
  };
}

/* ------------------------------------------------------------------ review */

export type ReviewDeps = {
  now?: () => Date;
  settings?: (db: Db) => Promise<AutopilotSettings>;
  isDoNotContact?: (db: Db, value: string) => Promise<boolean>;
  fingerprints?: (db: Db) => Promise<DemoFingerprints>;
  assessSite?: (url: string) => Promise<SiteGap[] | null>;
  verifyEmail?: (db: Db, email: string, deps: { now: () => Date }) => Promise<EmailVerification>;
  enrichEmail?: (db: Db, url: string, deps: { now: () => Date }) => Promise<ProspectEnrichment>;
  provision?: (db: Db, input: ProspectDemoInput, actorId: string, origin: { source: "autopilot"; placeId: null; enrichment?: ProspectEnrichment; pitchFirst: boolean }) => Promise<{ organizationId: string }>;
};

type Release = { ok: true; organizationId: string } | { ok: false; code: string; retry?: boolean };

/** One lead through the autopilot's gates, in its order. Returns why it stopped, or the demo it created. */
async function releaseLead(db: Db, lead: QueueRow, actorId: string, settings: AutopilotSettings, seen: DemoFingerprints, lookups: { used: number }, deps: Required<Omit<ReviewDeps, "settings" | "now">> & { now: () => Date }): Promise<Release> {
  const name = String(lead["business_name"]);
  const city = String(lead["city"]);
  const email = text(lead["email"]);
  const website = text(lead["website"]);
  const phone = text(lead["phone"]);

  for (const contact of [email, usPhoneE164(phone)]) {
    if (contact && (await deps.isDoNotContact(db, contact))) return { ok: false, code: "do_not_contact" };
  }
  if (alreadyDemoed({ placeId: "", name, city, phone } as unknown as Parameters<typeof alreadyDemoed>[0], seen)) return { ok: false, code: "already_demoed" };

  // A business with a real website is pitched only for verified gaps, never as "you have no website".
  let gaps: SiteGap[] | undefined;
  if (website && webPresence(website) === "has_website") {
    const found = await deps.assessSite(website);
    if (!found) return { ok: false, code: "website_unchecked" };
    if (!isUpgradeProspect(found)) return { ok: false, code: "website_has_no_verified_gaps" };
    gaps = found;
  }

  let enrichment: ProspectEnrichment | null = null;
  let publicEmail: string | null = null;
  if (email) {
    const check = await deps.verifyEmail(db, email, { now: deps.now });
    if (check.status === "rejected") return { ok: false, code: `email_rejected: ${check.reason}` };
    enrichment = { ...check, email, source: "imported_lead" satisfies EnrichmentSource, sourceUrl: sourceLink(text(lead["source"])), checkedAt: deps.now().toISOString() };
    publicEmail = email;
  } else if (website && lookups.used < MAX_WEBSITE_LOOKUPS) {
    lookups.used += 1;
    const found = await deps.enrichEmail(db, website, { now: deps.now }).catch(() => null);
    if (found?.email && found.status !== "rejected") {
      enrichment = found;
      publicEmail = found.email;
    }
  }
  // Outreach is by email only, so a lead with no email that passes the checks cannot be pitched.
  if (!publicEmail) return { ok: false, code: "no_public_email" };

  const industry = String(lead["category"] ?? "").slice(0, 80);
  const state = text(lead["state"]);
  let input: ProspectDemoInput;
  try {
    input = parseProspectDemoInput({
      businessName: name,
      industry,
      city,
      state,
      phone,
      email: publicEmail,
      address: text(lead["address"]),
      description: `${industry} serving ${[city, state].filter(Boolean).join(", ") || "the local area"}.`,
      services: [],
      placeId: null,
      ...(gaps?.length ? { siteGaps: gaps } : {}),
    });
  } catch (error) {
    return { ok: false, code: `invalid_facts: ${error instanceof Error ? error.message : "invalid"}`.slice(0, 160) };
  }
  try {
    const demo = await deps.provision(db, input, actorId, { source: "autopilot", placeId: null, ...(enrichment ? { enrichment } : {}), pitchFirst: settings.pitchFirst });
    return { ok: true, organizationId: demo.organizationId };
  } catch (error) {
    return { ok: false, code: `build_failed: ${(error instanceof Error ? error.message : "failed").slice(0, 160)}`, retry: true };
  }
}

async function defaultDeps(deps: ReviewDeps): Promise<Required<Omit<ReviewDeps, "settings" | "now">> & { now: () => Date }> {
  return {
    now: deps.now ?? (() => new Date()),
    isDoNotContact: deps.isDoNotContact ?? (async (db, value) => (await import("@/lib/prospect-outreach.server")).isDoNotContact(db, value)),
    fingerprints: deps.fingerprints ?? (async (db) => (await import("@/lib/prospect-autopilot.server")).demoFingerprints(db)),
    assessSite: deps.assessSite ?? (async (url) => (await import("@/lib/prospect-email.server")).assessWebsite(url)),
    verifyEmail: deps.verifyEmail ?? (async (db, email, options) => (await import("@/lib/prospect-enrichment.server")).verifyProspectEmail(db, email, options)),
    enrichEmail: deps.enrichEmail ?? (async (db, url, options) => (await import("@/lib/prospect-enrichment.server")).enrichProspectEmail(db, url, options)),
    provision: deps.provision ?? (async (db, input, actorId, origin) => (await import("@/lib/jarvis-demo-site.server")).provisionProspectDemo(db, input, actorId, origin)),
  };
}

export async function reviewImportedLeads(db: Db, input: { ids: readonly string[]; decision: "approve" | "reject"; actorId: string }, deps: ReviewDeps = {}): Promise<ReviewResult> {
  const now = deps.now ?? (() => new Date());
  const ids = [...new Set(input.ids)].slice(0, 50);
  const reviewedAt = now().toISOString();
  if (!ids.length) return { released: 0, rejected: 0, blocked: [], waiting: 0, message: "Choose at least one lead first." };

  if (input.decision === "reject") {
    const { data, error } = await db
      .from(TABLE)
      .update({ status: "rejected", reviewed_by: input.actorId, reviewed_at: reviewedAt })
      .in("id", ids)
      .in("status", ["pending", "blocked"])
      .select("id");
    if (error) throw new Error("Couldn't update those leads.");
    const rejected = data?.length ?? 0;
    return { released: 0, rejected, blocked: [], waiting: 0, message: rejected ? `Rejected ${rejected} lead${rejected === 1 ? "" : "s"}. Nothing was sent.` : "Those leads were already reviewed." };
  }

  const settings = await (deps.settings ?? (async (client: Db) => (await import("@/lib/prospect-autopilot.server")).getAutopilotSettings(client)))(db);
  const room = await buildsLeftToday(db, settings, now());
  if (room <= 0) {
    return { released: 0, rejected: 0, blocked: [], waiting: ids.length, message: `Today's limit of ${settings.dailyBuildCap} new sites is used up. Approve these tomorrow, or raise the daily limit in the autopilot settings.` };
  }

  // A release that died leaves its leads "releasing"; after a while they are pending again.
  await db.from(TABLE).update({ status: "pending" }).eq("status", "releasing").lt("reviewed_at", new Date(now().getTime() - STALE_RELEASE_MS).toISOString());
  const take = ids.slice(0, MAX_RELEASE_PER_CALL);
  // Claiming first means a double tap or a second tab can never release the same lead twice.
  const claimed = await db
    .from(TABLE)
    .update({ status: "releasing", reviewed_by: input.actorId, reviewed_at: reviewedAt })
    .in("id", take)
    .eq("status", "pending")
    .select("*");
  if (claimed.error) throw new Error("Couldn't start releasing those leads.");
  const leads = ((claimed.data ?? []) as QueueRow[]).sort((a, b) => (Number(b["score"]) || 0) - (Number(a["score"]) || 0));

  const resolved = await defaultDeps(deps);
  const seen = leads.length ? await resolved.fingerprints(db) : { placeIds: new Set<string>(), phones: new Set<string>(), nameCity: new Set<string>() };
  const lookups = { used: 0 };
  const blocked: ReviewResult["blocked"] = [];
  const skippedForRun: { reason: string; name: string }[] = [];
  const leftover: string[] = [];
  let released = 0;

  for (const lead of leads) {
    const id = String(lead["id"]);
    const name = String(lead["business_name"]);
    // A lead stopped at a check builds nothing, so only releases count against today's room.
    if (released >= room) {
      leftover.push(id);
      continue;
    }
    let outcome: Release;
    try {
      outcome = await releaseLead(db, lead, input.actorId, settings, seen, lookups, resolved);
    } catch (error) {
      outcome = { ok: false, code: `build_failed: ${(error instanceof Error ? error.message : "failed").slice(0, 160)}`, retry: true };
    }
    if (outcome.ok) {
      released += 1;
      const phone = phoneKey(text(lead["phone"]));
      if (phone) seen.phones.add(phone);
      seen.nameCity.add(nameCityKey(name, String(lead["city"])));
      await db.from(TABLE).update({ status: "approved", organization_id: outcome.organizationId, blocked_reason: null }).eq("id", id);
    } else {
      blocked.push({ id, name, label: blockLabel(outcome.code) });
      skippedForRun.push({ reason: outcome.code, name });
      // A failed build can be tried again; every other stop is a reason the lead should not go out.
      await db.from(TABLE).update({ status: outcome.retry ? "pending" : "blocked", blocked_reason: outcome.code.slice(0, 200) }).eq("id", id);
    }
  }

  if (leftover.length) await db.from(TABLE).update({ status: "pending" }).in("id", leftover).eq("status", "releasing");

  // One finished run row, so these sites count toward the autopilot's daily limit.
  if (leads.length) {
    await db.from("prospect_autopilot_runs").insert({ trigger: "manual", started_at: reviewedAt, finished_at: now().toISOString(), found: leads.length, built: released, skipped: skippedForRun });
    await db.from("audit_logs").insert({
      organization_id: null,
      actor_id: input.actorId,
      action: "jarvis.leads.approved",
      entity: TABLE,
      entity_id: null,
      metadata: { requested: ids.length, released, blocked: blocked.length },
    });
  }

  const waiting = ids.length - take.length + leftover.length;
  const sentence = released
    ? `${released} lead${released === 1 ? " is" : "s are"} now ${settings.pitchFirst ? "ready for a pitch" : "being built as demo sites"}. Nothing is sent from this page; the autopilot sends only when it is on, within its limits.`
    : "No lead was released.";
  return {
    released,
    rejected: 0,
    blocked,
    waiting,
    message: `${sentence}${blocked.length ? ` ${blocked.length} stopped at a check.` : ""}${waiting ? ` ${waiting} more ${released >= room ? "wait for tomorrow's limit" : "wait for the next tap"}.` : ""}`,
  };
}
