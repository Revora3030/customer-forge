/**
 * SOL / TERRA / LUNA RESULT CARDS for the builder chat.
 *
 * Sol shows the creative brief the AI returned. Terra and Luna show readings
 * from stored browser QA and from the head the site really emits; anything that
 * was not measured says NOT VERIFIED. There is no made-up score here.
 */
import { useQuery } from "@tanstack/react-query";
import { CompositionPreviewCard } from "@/components/app/CompositionPreviewCard";
import { supabase } from "@/integrations/supabase/client";
import type { CompositionPreview } from "@/lib/builder/composition-preview";
import { lunaCard, solBrief, terraBadge, type CheckState, type LunaCard, type TerraBadge, type VisualReportRow } from "@/lib/builder/result-cards";
import { getOwnerDraftSite } from "@/lib/public-site.functions";
import { tenantSiteHead } from "@/lib/site-head";

const STATE_LABEL: Record<CheckState, string> = { pass: "Measured: OK", fail: "Measured: needs work", not_verified: "NOT VERIFIED" };
const STATE_CLASS: Record<CheckState, string> = {
  pass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  fail: "bg-destructive/10 text-destructive",
  not_verified: "bg-muted text-muted-foreground",
};

function Shell({ tier, title, children }: { tier: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3" data-result-card={tier.toLowerCase()}>
      <p className="text-[12.5px] font-medium">
        <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase">{tier}</span>
        {title}
      </p>
      {children}
    </div>
  );
}

export function SolCard({ composition }: { composition: CompositionPreview }) {
  const brief = solBrief(composition);
  if (!brief) return null;
  return (
    <div data-result-card="sol">
      <p className="mt-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Sol · creative brief</p>
      <CompositionPreviewCard composition={composition} />
      <p className="mt-1.5 text-[12px] text-muted-foreground">
        {brief.mood} mood, {brief.tone} theme, set in {brief.font}. {brief.fontNote}
      </p>
    </div>
  );
}

export function TerraCardView({ badge }: { badge: TerraBadge }) {
  return (
    <Shell tier="Terra" title="Device check">
      <ul className="mt-2 space-y-1.5">
        {badge.checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-[12px]" data-check={check.id} data-state={check.state}>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium ${STATE_CLASS[check.state]}`}>{STATE_LABEL[check.state]}</span>
            <span className="min-w-0">
              <span className="font-medium">{check.label}.</span> <span className="text-muted-foreground">{check.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {badge.measuredAt ? <p className="mt-1.5 text-[11px] text-muted-foreground">From the browser check run {new Date(badge.measuredAt).toLocaleString()}.</p> : null}
    </Shell>
  );
}

export function LunaCardView({ card }: { card: LunaCard }) {
  const field = (label: string, f: LunaCard["title"]) => (
    <li className="text-[12px]">
      <span className="font-medium">{label}:</span>{" "}
      <span className="text-muted-foreground">{f.present ? `present, ${f.length} characters` : "missing"}</span>
    </li>
  );
  return (
    <Shell tier="Luna" title="Search listing">
      <ul className="mt-2 space-y-1">
        {field("Title", card.title)}
        {field("Meta description", card.description)}
        <li className="text-[12px]">
          <span className="font-medium">Structured data (JSON-LD):</span>{" "}
          <span className="text-muted-foreground">
            {card.jsonLdTypes.length ? card.jsonLdTypes.join(", ") : "none emitted"}
          </span>
        </li>
        {card.noindex ? <li className="text-[12px] text-muted-foreground">This page is marked noindex, so search engines will skip it.</li> : null}
      </ul>
    </Shell>
  );
}

/** Reads this workspace's stored browser QA rows through the caller's session (RLS decides visibility). */
function useVisualRows(organizationId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["result-cards-visual", organizationId],
    enabled: enabled && Boolean(organizationId),
    staleTime: 60_000,
    queryFn: async (): Promise<VisualReportRow[]> => {
      const { data, error } = await supabase
        .from("website_visual_reports")
        .select("measured_at, measurements, page_slug")
        .eq("organization_id", organizationId as string)
        .order("measured_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as VisualReportRow[];
    },
  });
}

function useLuna(organizationId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["result-cards-luna", organizationId],
    enabled: enabled && Boolean(organizationId),
    staleTime: 60_000,
    queryFn: async (): Promise<LunaCard | null> => {
      const { data: org } = await supabase.from("organizations").select("slug").eq("id", organizationId as string).maybeSingle();
      if (!org?.slug) return null;
      const draft = await getOwnerDraftSite({ data: { slug: org.slug } });
      if (!draft.site) return null;
      const url = `https://revoragrowthsystems.com/s/${org.slug}`;
      // The same head builder the live site uses, so these are the tags a visitor's browser gets.
      return lunaCard(tenantSiteHead({ site: draft.site as never, pageSlug: null, canonical: url, businessUrl: url }));
    },
  });
}

/**
 * The single mount point. `finished` is true once the request has completed;
 * Terra and Luna only appear then, so nothing claims a check on an unfinished build.
 */
export function ResultCards({ organizationId, composition, finished }: { organizationId: string | null | undefined; composition: CompositionPreview | null | undefined; finished: boolean }) {
  const visual = useVisualRows(organizationId, finished);
  const luna = useLuna(organizationId, finished);
  return (
    <>
      {composition ? <SolCard composition={composition} /> : null}
      {finished && visual.isSuccess ? <TerraCardView badge={terraBadge(visual.data)} /> : null}
      {finished && luna.data ? <LunaCardView card={luna.data} /> : null}
    </>
  );
}
