import { Button } from "@/components/ui/button";

type Props = {
  organizationId?: string | null | undefined;
  businessName?: string | null;
  industry?: string | null;
  slug?: string | null;
  city?: string | null;
  publishState?: string | null;
  lastPublishedAt?: string | null;
  customDomain?: string | null;
  domainStatus?: string | null;
  pagesCount: number;
  visibleSections: number;
  score: number;
  onEdit: () => void;
  onLaunchChecks: () => void;
};

const STATUS: Record<string, { label: string; tone: string }> = {
  published: { label: "Live", tone: "text-primary border-primary/40 bg-primary/10" },
  preview: { label: "In preview", tone: "text-accent border-accent/40 bg-accent/10" },
  unpublished: { label: "Taken offline", tone: "text-muted-foreground border-border bg-elevated" },
  draft: { label: "Draft", tone: "text-muted-foreground border-border bg-elevated" },
};

const when = (value?: string | null) => {
  if (!value) return "Not published yet";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "Not published yet";
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `Published ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Published ${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `Published ${days} day${days === 1 ? "" : "s"} ago`;
};

/**
 * The client's website project card: one website per workspace, shown as a
 * real project with its own status, address, size and layout identity.
 */
export function WebsiteProject(props: Props) {
  const status = STATUS[props.publishState ?? "draft"] ?? STATUS["draft"]!;
  // A client website is served from the domain the client owns. The platform
  // share path is the address that always works until then.
  const address =
    props.customDomain || (props.slug ? `/s/${props.slug}` : "Address set when you publish");

  const stats = [
    { label: "Pages", value: String(props.pagesCount) },
    { label: "Live sections", value: String(props.visibleSections) },
    { label: "Revora score", value: `${props.score}/100` },
  ];

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">My website</p>
          <h2 className="mt-1 truncate font-display text-[19px] font-semibold">
            {props.businessName || "Your website"}
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {props.industry ? `${props.industry} · ` : ""}
            <span className="break-all">{address}</span>
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${status.tone}`}>
          {status.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-border bg-elevated p-2.5">
            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            <p className="mt-0.5 font-display text-[16px] font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-muted-foreground">
          {when(props.lastPublishedAt)}
          {props.domainStatus && props.domainStatus !== "not_connected"
            ? ` · domain ${props.domainStatus.replace(/_/g, " ")}`
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="signal" onClick={props.onEdit}>
            Edit this website
          </Button>
          <Button size="sm" variant="outline" onClick={props.onLaunchChecks}>
            Launch checks
          </Button>
        </div>
      </div>

      <p className="mt-2.5 text-[11.5px] text-muted-foreground">
        Every part of your website — section order, hero style, colours and wording — is designed by
        Revora's AI team for your business, so it never looks like another Revora client's site.
      </p>
    </section>
  );
}
