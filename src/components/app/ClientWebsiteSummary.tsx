/**
 * The client dashboard's website card: one honest picture of this
 * organization's website — live status, pages, sections, leads it captured,
 * bookings and visits — with direct doors into the builder areas that change
 * it. Reads only existing workspace data, so it never disagrees with the
 * builder or the live site.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { useWebsiteSettings } from "@/lib/queries";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";

const AREAS = [
  { key: "build", label: "Build", hint: "Pages & content" },
  { key: "design", label: "Design", hint: "Look & images" },
  { key: "ai", label: "AI", hint: "Ask Revora" },
  { key: "launch", label: "Launch", hint: "Go live" },
] as const;

export function ClientWebsiteSummary({
  organizationId,
  slug,
  leads,
  bookings,
  visits,
}: {
  organizationId: string | undefined;
  slug: string | null | undefined;
  leads: number;
  bookings: number;
  visits: number;
}) {
  const { data: settings } = useWebsiteSettings(organizationId);
  const { data: pages, isPending: pagesPending } = useWebsiteContent(organizationId);

  const state = settings?.publish_state ?? "draft";
  const live = state === "published";
  const pageCount = (pages ?? []).length;
  const sectionCount = (pages ?? []).reduce(
    (total, page) => total + page.sections.filter((section) => section.is_visible).length,
    0,
  );
  const address = settings?.custom_domain ?? (slug ? `/s/${slug}` : null);

  const stats: { label: string; value: number | string }[] = [
    { label: "Pages", value: pagesPending ? "—" : pageCount },
    { label: "Sections live", value: pagesPending ? "—" : sectionCount },
    { label: "Leads", value: leads },
    { label: "Bookings", value: bookings },
    { label: "Visits", value: visits },
  ];

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Your website</p>
          <p className="mt-1 truncate text-[15px] font-medium">
            {settings?.custom_domain ?? slug ?? "Not created yet"}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {live
              ? `Live${settings?.last_published_at ? ` · published ${relative(new Date(settings.last_published_at))}` : ""}`
              : state === "unpublished"
                ? "Taken offline — publish again from Launch"
                : "Not live yet — finish it in the builder and press Launch"}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] tracking-wide uppercase",
            live ? "border-primary/40 text-primary" : "border-border text-muted-foreground",
          )}
        >
          {live ? "Live" : state === "unpublished" ? "Offline" : "Draft"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-border bg-elevated p-2.5">
            <dt className="text-[11px] text-muted-foreground">{stat.label}</dt>
            <dd className="mt-0.5 font-display text-[18px] font-semibold">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {AREAS.map((area) => (
          <Button key={area.key} asChild size="sm" variant="outline">
            <Link to="/app/website" search={{ section: area.key }} title={area.hint}>
              {area.label}
            </Link>
          </Button>
        ))}
        {live && address ? (
          <Button asChild size="sm" variant="signal">
            <a
              href={address.startsWith("/") ? address : `https://${address}`}
              target="_blank"
              rel="noopener"
            >
              View live site <ExternalLink className="size-4" aria-hidden />
            </a>
          </Button>
        ) : (
          <Button asChild size="sm" variant="signal">
            <Link to="/app/website" search={{ section: "launch" }}>
              Go live <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
