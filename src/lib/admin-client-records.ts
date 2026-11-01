/**
 * Which workspaces the admin counts and lists as clients.
 *
 * The same rules feed the "Client businesses" number and the client lists, so
 * the number and the rows can never disagree. Nothing here deletes or edits
 * data: test records are only left out of the default view (and shown again by
 * the "Show test records" toggle), and a business that exists twice is shown
 * once.
 *
 * There is no is_test column. The flags that exist are is_demo, "no customer
 * member" (a workspace only Revora staff belong to), and the confirmed Revora
 * test accounts; the rest is clear QA/test naming.
 */
import { TEST_ACCOUNT_EMAILS } from "@/lib/staff-sessions";

export type ClientRecordFields = {
  id: string;
  name: string;
  slug?: string | null;
  is_demo?: boolean | null;
  /** False when only Revora staff belong to the workspace (or it is Revora's own). Unknown = undefined. */
  is_customer?: boolean | null;
  owner_name?: string | null;
  owner_email?: string | null;
  created_at?: string | null;
};

export type TestReason = "demo" | "staff_only" | "test_account" | "test_name" | "test_email";

const TEST_EMAILS = new Set<string>(TEST_ACCOUNT_EMAILS.map((email) => email.toLowerCase()));
const TEST_ACCOUNT_HANDLES = TEST_ACCOUNT_EMAILS.map((email) => email.split("@")[0]!.toLowerCase());
/** Whole words that mark a record as QA/test data. "Test Prep Tutoring" can be re-shown with the toggle. */
const TEST_WORDS = /(^|[^a-z0-9])(test|tests|testing|qa|e2e|demo|dummy|sample|fake|lorem|placeholder)([^a-z0-9]|$)/i;
const TEST_EMAIL_DOMAINS = /@(example\.(com|org|net)|test\.com|mailinator\.com|yopmail\.com)$/i;

/** Why a record is test/QA data, or null when it is a real client. */
export function testReason(client: ClientRecordFields): TestReason | null {
  if (client.is_demo) return "demo";
  if (client.is_customer === false) return "staff_only";
  const email = (client.owner_email ?? "").trim().toLowerCase();
  if (email && (TEST_EMAILS.has(email) || TEST_ACCOUNT_HANDLES.some((handle) => email.split("@")[0] === handle))) return "test_account";
  if (email && TEST_EMAIL_DOMAINS.test(email)) return "test_email";
  const labels = [client.name, client.slug ?? "", client.owner_name ?? ""];
  if (labels.some((label) => TEST_WORDS.test(String(label).replace(/[-_]+/g, " ")))) return "test_name";
  return null;
}

export const isTestRecord = (client: ClientRecordFields): boolean => testReason(client) !== null;

export function normalizeBusinessName(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/\b(llc|inc|co|corp|ltd|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type Deduped<T> = T & { duplicate_ids: string[] };

/** How much a row can tell the admin; the fullest copy of a duplicated business is the one shown. */
function richness(client: ClientRecordFields & Record<string, unknown>): number {
  const n = (key: string) => Number(client[key] ?? 0) || 0;
  return (
    (client["setup_paid_at"] ? 1000 : 0) +
    n("paid_total") +
    (client["publish_state"] === "published" ? 500 : 0) +
    n("leads") * 5 +
    n("appointments") * 5 +
    n("readinessScore") +
    (client.owner_email ? 50 : 0)
  );
}

/**
 * Shows each business once. Two rows are the same business when the normalised
 * name matches and they share an owner email, or one of them has no owner email
 * on file. Different owners with the same name stay separate. The row with the
 * most real data is kept; the other ids are listed in `duplicate_ids`.
 */
export function dedupeClients<T extends ClientRecordFields>(clients: readonly T[]): Deduped<T>[] {
  const clusters: { name: string; emails: Set<string>; rows: T[] }[] = [];
  for (const client of clients) {
    const name = normalizeBusinessName(client.name) || `id:${client.id}`;
    const email = (client.owner_email ?? "").trim().toLowerCase();
    const match = clusters.find(
      (cluster) =>
        cluster.name === name &&
        (!email || cluster.emails.size === 0 || cluster.emails.has(email)),
    );
    if (match) {
      match.rows.push(client);
      if (email) match.emails.add(email);
    } else {
      clusters.push({ name, emails: new Set(email ? [email] : []), rows: [client] });
    }
  }
  const keep = new Map<string, Deduped<T>>();
  for (const cluster of clusters) {
    const best = cluster.rows.reduce((a, b) => (richness(b as never) > richness(a as never) ? b : a));
    keep.set(best.id, { ...best, duplicate_ids: cluster.rows.filter((row) => row.id !== best.id).map((row) => row.id) });
  }
  // Original order is kept, so a list sorted newest-first stays that way.
  return clients.filter((client) => keep.has(client.id)).map((client) => keep.get(client.id)!);
}

/** What the admin sees: test/QA records out unless asked for, each business once. */
export function visibleClients<T extends ClientRecordFields>(clients: readonly T[], showTest = false): Deduped<T>[] {
  return dedupeClients(showTest ? clients : clients.filter((client) => !isTestRecord(client)));
}

/** The "Client businesses" number: exactly the rows the default list shows. */
export const clientBusinessCount = (clients: readonly ClientRecordFields[]): number => visibleClients(clients).length;
