/**
 * COMP-9 storage and use of trade starter snapshots (server only).
 *
 * - saveSnapshotFromSite: reads one site's pages and sections, runs the pure
 *   `buildTradeSnapshot` (which throws if any source fact is left) and stores
 *   the result. A leak refuses the save and says how many, never what.
 * - listSnapshots: the saved snapshots, without their bodies.
 * - startFromSnapshot: fills a snapshot from the NEW site's own business
 *   profile and writes pages and sections, only into a site that has none yet,
 *   so it can never overwrite a built or published site. A fact the owner did
 *   not give becomes a visible "[Add your ...]" marker.
 *
 * `admin` is the service-role client; callers check super_admin first.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTradeSnapshot,
  instantiateSnapshot,
  SnapshotLeakError,
  type SnapshotSourcePage,
  type SnapshotSourceSection,
  type TradeSnapshot,
} from "@/lib/builder/trade-snapshot";

type Db = Pick<SupabaseClient, "from">;
// The table is new, so it isn't in the generated types yet.
type Loose = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const loose = (db: Db) => db as unknown as Loose;

export type SnapshotListItem = {
  id: string;
  trade: string;
  name: string;
  pageCount: number;
  sectionCount: number;
  createdAt: string;
};

export type SaveResult =
  | {
      ok: true;
      id: string;
      pageCount: number;
      sectionCount: number;
      removed: TradeSnapshot["removed"];
    }
  | {
      ok: false;
      reason: "empty_site" | "leak" | "exists" | "failed" | "bad_input";
      message: string;
    };

export type StartResult =
  | { ok: true; pages: number; sections: number; missing: string[] }
  | { ok: false; reason: "not_found" | "site_not_empty" | "failed" | "bad_input"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const cleanTrade = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 60);
export const cleanName = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

/** Opening hours are stored as JSON; the leak check needs them as the text a page would show. */
export function hoursText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const parts = Object.values(value as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    return parts.length ? parts.join(" ") : null;
  }
  return null;
}

async function loadSite(admin: Db, organizationId: string) {
  const [org, profile, pages, sections] = await Promise.all([
    loose(admin).from("organizations").select("id, name").eq("id", organizationId).maybeSingle(),
    loose(admin)
      .from("business_profiles")
      .select(
        "owner_name, email, owner_email, phone, address, city, hours, description, service_area, website, years_in_business",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
    loose(admin)
      .from("website_pages")
      .select("id, kind, slug, title, sort_order, seo_title, seo_description")
      .eq("organization_id", organizationId)
      .order("sort_order"),
    loose(admin)
      .from("website_sections")
      .select("page_id, kind, variant, sort_order, heading, subheading, body, settings, is_visible")
      .eq("organization_id", organizationId)
      .order("sort_order"),
  ]);
  if (org.error || profile.error || pages.error || sections.error || !org.data) return null;
  return {
    org: org.data as { id: string; name: string | null },
    profile: (profile.data ?? {}) as Record<string, unknown>,
    pages: (pages.data ?? []) as Array<SnapshotSourcePage & { id: string }>,
    sections: (sections.data ?? []) as Array<Record<string, unknown>>,
  };
}

export async function saveSnapshotFromSite(
  admin: Db,
  input: { organizationId: string; trade: string; name: string; createdBy: string },
): Promise<SaveResult> {
  const trade = cleanTrade(input.trade);
  const name = cleanName(input.name);
  if (!UUID.test(input.organizationId) || !trade || !name) {
    return {
      ok: false,
      reason: "bad_input",
      message: "Pick a site, a trade and a name for the snapshot.",
    };
  }
  const site = await loadSite(admin, input.organizationId);
  if (!site) return { ok: false, reason: "failed", message: "Couldn't read that site." };
  if (!site.pages.length)
    return { ok: false, reason: "empty_site", message: "That site has no pages to save yet." };

  const slugById = new Map(site.pages.map((p) => [p.id, p.slug]));
  const sourceSections: SnapshotSourceSection[] = site.sections
    .filter((s) => s["is_visible"] !== false && slugById.has(String(s["page_id"])))
    .map((s) => ({
      pageSlug: slugById.get(String(s["page_id"]))!,
      kind: String(s["kind"]),
      variant: String(s["variant"] ?? "default"),
      sort_order: Number(s["sort_order"] ?? 0),
      heading: (s["heading"] as string | null) ?? null,
      subheading: (s["subheading"] as string | null) ?? null,
      body: (s["body"] as string | null) ?? null,
      settings: s["settings"] ?? {},
    }));

  const p = site.profile;
  let snapshot: TradeSnapshot;
  try {
    snapshot = buildTradeSnapshot({
      trade,
      pages: site.pages,
      sections: sourceSections,
      facts: {
        businessName: site.org.name,
        ownerName: (p["owner_name"] as string | null) ?? null,
        phone: (p["phone"] as string | null) ?? null,
        email: (p["email"] as string | null) ?? (p["owner_email"] as string | null) ?? null,
        address: (p["address"] as string | null) ?? null,
        city: (p["city"] as string | null) ?? null,
        hours: hoursText(p["hours"]),
      },
    });
  } catch (error) {
    if (error instanceof SnapshotLeakError) {
      return {
        ok: false,
        reason: "leak",
        message: `Not saved: ${error.leaks.length} detail(s) from that site could not be removed safely, so it can't be a starter.`,
      };
    }
    throw error;
  }

  const { data, error } = await loose(admin)
    .from("site_snapshots")
    .insert({
      trade: snapshot.trade,
      name,
      snapshot,
      page_count: snapshot.pages.length,
      section_count: snapshot.sections.length,
      source_organization_id: input.organizationId,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error) {
    const duplicate = (error as { code?: string }).code === "23505";
    return duplicate
      ? {
          ok: false,
          reason: "exists",
          message: "A snapshot with that trade and name already exists. Use another name.",
        }
      : { ok: false, reason: "failed", message: "Couldn't save the snapshot." };
  }
  return {
    ok: true,
    id: String((data as { id: string }).id),
    pageCount: snapshot.pages.length,
    sectionCount: snapshot.sections.length,
    removed: snapshot.removed,
  };
}

export async function listSnapshots(admin: Db, limit = 100): Promise<SnapshotListItem[]> {
  const { data, error } = await loose(admin)
    .from("site_snapshots")
    .select("id, trade, name, page_count, section_count, created_at")
    .order("trade")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Couldn't load the snapshots.");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r["id"]),
    trade: String(r["trade"]),
    name: String(r["name"]),
    pageCount: Number(r["page_count"]),
    sectionCount: Number(r["section_count"]),
    createdAt: String(r["created_at"]),
  }));
}

export async function startFromSnapshot(
  admin: Db,
  input: { organizationId: string; snapshotId: string },
): Promise<StartResult> {
  if (!UUID.test(input.organizationId) || !UUID.test(input.snapshotId)) {
    return { ok: false, reason: "bad_input", message: "Pick a site and a snapshot." };
  }
  const snap = await loose(admin)
    .from("site_snapshots")
    .select("snapshot")
    .eq("id", input.snapshotId)
    .maybeSingle();
  if (snap.error) return { ok: false, reason: "failed", message: "Couldn't load that snapshot." };
  if (!snap.data)
    return { ok: false, reason: "not_found", message: "That snapshot doesn't exist." };

  const site = await loadSite(admin, input.organizationId);
  if (!site) return { ok: false, reason: "not_found", message: "That site doesn't exist." };
  if (site.pages.length > 0 || site.sections.length > 0) {
    return {
      ok: false,
      reason: "site_not_empty",
      message:
        "That site already has pages. A snapshot only starts an empty site, so nothing was changed.",
    };
  }

  const p = site.profile;
  const filled = instantiateSnapshot((snap.data as { snapshot: TradeSnapshot }).snapshot, {
    businessName: site.org.name,
    phone: (p["phone"] as string | null) ?? null,
    email: (p["email"] as string | null) ?? (p["owner_email"] as string | null) ?? null,
    address: (p["address"] as string | null) ?? null,
    city: (p["city"] as string | null) ?? null,
    serviceArea: (p["service_area"] as string | null) ?? null,
    hours: hoursText(p["hours"]),
  });

  const pageRows = filled.pages.map((pg) => ({
    organization_id: input.organizationId,
    kind: pg.kind,
    slug: pg.slug,
    title: pg.title,
    sort_order: pg.sort_order,
    seo_title: pg.seo_title,
    seo_description: pg.seo_description,
  }));
  const inserted = await loose(admin).from("website_pages").insert(pageRows).select("id, slug");
  if (inserted.error || !inserted.data)
    return {
      ok: false,
      reason: "failed",
      message: "Couldn't create the pages. Nothing was changed.",
    };
  const idBySlug = new Map(
    (inserted.data as Array<{ id: string; slug: string }>).map((r) => [r.slug, r.id]),
  );

  const sectionRows = filled.sections
    .filter((s) => idBySlug.has(s.pageSlug))
    .map((s) => ({
      organization_id: input.organizationId,
      page_id: idBySlug.get(s.pageSlug)!,
      kind: s.kind,
      variant: s.variant,
      sort_order: s.sort_order,
      heading: s.heading,
      subheading: s.subheading,
      body: s.body,
      settings: s.settings,
    }));
  if (sectionRows.length) {
    const sectionsInserted = await loose(admin).from("website_sections").insert(sectionRows);
    if (sectionsInserted.error) {
      // Undo the pages so the site is empty again and the owner can retry.
      await loose(admin)
        .from("website_pages")
        .delete()
        .eq("organization_id", input.organizationId)
        .in("id", [...idBySlug.values()]);
      return {
        ok: false,
        reason: "failed",
        message: "Couldn't create the sections. Nothing was changed.",
      };
    }
  }
  return {
    ok: true,
    pages: pageRows.length,
    sections: sectionRows.length,
    missing: filled.missing,
  };
}
