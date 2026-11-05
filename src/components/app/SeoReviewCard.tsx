/**
 * Owner dashboard "SEO & AI search review" checklist (G-A6).
 *
 * Reads workspace SEO fields, business profile, image_records alt text, and
 * publish state. Fix buttons deep-link into existing Website / Settings
 * screens. Does not generate alt text, meta, or sitemaps — that is CG-16
 * (SEO & Content). Search Console numbers are never invented.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBusinessProfile, useWebsiteSettings } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { FixAllButton, FixItButton } from "@/components/app/FixItCard";
import type { FixFinding } from "@/lib/fix-it";
import { buildAiSearchItem, buildSeoReview, type SeoReviewItem, type SeoReviewStatus } from "@/lib/seo-review";
import type { SiteSeo } from "@/lib/site-seo";
import { cn } from "@/lib/utils";

function StatusIcon({ status }: { status: SeoReviewStatus }) {
  if (status === "ok") return <CheckCircle2 className="size-4 text-primary" aria-hidden />;
  if (status === "needs_work") return <CircleAlert className="size-4 text-amber-400" aria-hidden />;
  return <CircleHelp className="size-4 text-muted-foreground" aria-hidden />;
}

/** Owner-only items (profile facts, Search Console) never get an AI fix that would guess. */
const OWNER_ONLY: ReadonlySet<SeoReviewItem["id"]> = new Set(["local_business", "search_console"]);

function toFinding(item: SeoReviewItem): FixFinding & { key: string } {
  return { key: item.id, title: item.label, plainReason: item.detail, scope: "site", needsOwner: OWNER_ONLY.has(item.id) };
}

async function readText(url: string): Promise<{ status: number; text: string } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return { status: res.status, text: res.ok ? await res.text() : "" };
  } catch {
    return null;
  }
}

export function SeoReviewCard({
  organizationId,
  businessName,
  slug,
}: {
  organizationId: string | undefined;
  businessName: string | null | undefined;
  slug?: string | null | undefined;
}) {
  const { data: settings, isPending: settingsPending } = useWebsiteSettings(organizationId);
  const { data: profile, isPending: profilePending } = useBusinessProfile(organizationId);
  const imagesQuery = useQuery({
    queryKey: ["image_records", organizationId, "seo-review-alts"],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("image_records")
        .select("alt_text, status")
        .eq("organization_id", organizationId!)
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const published = settings?.publish_state === "published";
  const aiQuery = useQuery({
    queryKey: ["seo-review-ai-search", slug],
    enabled: !!slug && published && typeof window !== "undefined",
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const siteUrl = `${window.location.origin}/s/${encodeURIComponent(slug!)}`;
      const [robots, llms] = await Promise.all([readText(`${siteUrl}/robots.txt`), readText(`${siteUrl}/llms.txt`)]);
      return { siteUrl, robotsTxt: robots && robots.status === 200 ? robots.text : null, llmsStatus: llms?.status ?? null };
    },
  });

  const items = [...buildSeoReview({
    seo: (settings?.seo as SiteSeo | null | undefined) ?? null,
    businessName,
    profile: profile
      ? {
          phone: profile.phone,
          email: profile.email,
          address: profile.address,
          city: profile.city,
          state: profile.state,
          zip: profile.zip,
        }
      : null,
    images: imagesQuery.data ?? null,
    published,
  }), buildAiSearchItem(published ? (aiQuery.data ?? null) : null)];
  const findings = items.filter((item) => item.status === "needs_work").map(toFinding);

  const pending = settingsPending || profilePending || imagesQuery.isPending;
  const needs = items.filter((item) => item.status === "needs_work").length;

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="seo-review-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">SEO & AI search</p>
          <h2 id="seo-review-heading" className="mt-1 text-[15px] font-medium">
            Search review checklist
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {pending
              ? "Reading your site settings…"
              : needs
                ? `${needs} item${needs === 1 ? "" : "s"} need attention. Fix links open the screens that already edit each field.`
                : "Title, local details, photos, and publish state look ready. Open Search to verify Google results yourself."}
          </p>
        </div>
        <FixAllButton findings={findings} />
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-elevated p-3"
          >
            <div className="flex min-w-0 flex-1 gap-2">
              <StatusIcon status={item.status} />
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{item.label}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{item.detail}</p>
              </div>
            </div>
            {item.status === "needs_work" ? (
              <FixItButton finding={toFinding(item)} />
            ) : (
            <Button
              asChild
              size="sm"
              variant={item.status === "ok" ? "outline" : "signal"}
              className={cn(item.status === "ok" && "text-muted-foreground")}
            >
              {item.fixTo === "/app/settings" ? (
                <Link to="/app/settings">{item.fixLabel}</Link>
              ) : (
                <Link to="/app/website" search={item.fixSearch ?? { section: "seo" }}>
                  {item.fixLabel}
                </Link>
              )}
            </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
