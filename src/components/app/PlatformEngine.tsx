import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, Copy, Download, Radar, X } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import {
  CAPABILITY_LABELS,
  PLATFORMS,
  QUALITY_TARGETS,
  RESPONSIVE_BREAKPOINTS,
  CONTENT_SCHEMA_VERSION,
  designTokens,
  detectPlatformFromBrowser,
  limitationReport,
  normalizedSpec,
  platformProfile,
  portableSpec,
  specBrief,
  stackStrategy,
  tokensCss,
  type PlatformDetection,
  type PlatformId,
} from "@/lib/platform-engine";
import type { ContentPage } from "@/lib/website-content";

type Props = {
  businessName: string | null | undefined;
  slug: string | null | undefined;
  profile: Record<string, unknown> | null | undefined;
  services: {
    name: string;
    description?: string | null;
    price?: number | null;
    bookable?: boolean;
  }[];
  seo: { title?: string | null; description?: string | null; headline?: string | null };
  pages: ContentPage[];
  /** Publish flow hooks so a rebuild can be triggered from the builder. */
  publishState?: string | null;
  canManage?: boolean;
  isPublishing?: boolean;
  onPublish?: () => void;
};

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * Universal Cross-Platform Code Engine: shows which capabilities the target
 * environment really has, the implementation strategy that follows from them,
 * an honest limitation report, and a portable build spec for rebuilding the
 * same site elsewhere.
 */
export function PlatformEngine({
  businessName,
  slug,
  profile,
  services,
  seo,
  pages,
  publishState,
  canManage = false,
  isPublishing = false,
  onPublish,
}: Props) {
  const [detection, setDetection] = useState<PlatformDetection | null>(null);
  const [override, setOverride] = useState<PlatformId | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDetection(detectPlatformFromBrowser());
  }, []);

  const platform: PlatformId = override ?? detection?.platform ?? "lovable";
  const target = platformProfile(platform);

  const tokens = useMemo(
    () =>
      designTokens({
        primary: str(profile?.["primary_color"]),
        secondary: str(profile?.["secondary_color"]),
        accent: str(profile?.["accent_color"]),
        font: str(profile?.["font_preference"]),
      }),
    [profile],
  );

  const spec = useMemo(
    () =>
      portableSpec({
        platform,
        business: {
          name: businessName ?? null,
          tagline: str(profile?.["tagline"]),
          description: str(profile?.["description"]),
          phone: str(profile?.["phone"]),
          email: str(profile?.["email"]),
          city: str(profile?.["city"]),
          state: str(profile?.["state"]),
          address: str(profile?.["address"]),
          serviceArea: str(profile?.["service_area"]),
          website: str(profile?.["website"]),
          reviewLink: str(profile?.["review_link"]),
        },
        services,
        seo,
        pages,
        tokens,
      }),
    [platform, businessName, profile, services, seo, pages, tokens],
  );

  const normalized = useMemo(() => normalizedSpec(spec), [spec]);
  const checklist = normalized.auditChecklist;
  const blockers = checklist.filter((item) => item.severity === "blocker");
  const openBlockers = blockers.filter((item) => !done[item.id]);
  const limitations = limitationReport(target);
  const strategy = stackStrategy(target);

  const download = (name: string, body: string, type: string) => {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const base = (slug ?? "website").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(specBrief(spec));
      toast.success("Build brief copied — paste it into the other builder.");
    } catch {
      toast.error("Clipboard blocked. Use “Download brief” instead.");
    }
  };

  return (
    <Panel className="space-y-5">
      <SectionHeading
        eyebrow="Cross-platform engine"
        title="Rebuild this site on another platform"
        action={<Pill tone="info">{target.kind.replace(/-/g, " ")}</Pill>}
      />
      <p className="text-[13px] text-muted-foreground">
        Same strategy, same business facts, same design system — only the implementation method
        changes. Pick the target environment to see what it genuinely supports and where a fallback
        is required.
      </p>

      <div>
        <p className="eyebrow">Target platform</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <Radar className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {detection ? (
            <span>
              Detected{" "}
              <span className="text-foreground">{platformProfile(detection.platform).label}</span> (
              {detection.confidence} confidence) — {detection.signals[detection.signals.length - 1]}
              {override ? " · manual override active" : ""}
            </span>
          ) : (
            <span>Detecting environment…</span>
          )}
          {override ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setOverride(null)}>
              Use detected
            </Button>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={p.id === platform ? "default" : "outline"}
              onClick={() => setOverride(p.id)}
              aria-pressed={p.id === platform}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">{target.summary}</p>
      </div>

      <div>
        <p className="eyebrow">Detected capabilities</p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITY_LABELS.map((cap) => {
            const ok = target.caps[cap.key] === true;
            return (
              <li
                key={cap.key}
                className="flex items-center gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-[12px]"
              >
                {ok ? (
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <X className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className={ok ? "" : "text-muted-foreground"}>{cap.label}</span>
                <span className="sr-only">{ok ? "supported" : "not supported"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Implementation strategy</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {strategy.map((line) => (
              <li key={line} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                />
                <span>{line}</span>
              </li>
            ))}
            {target.prefer.map((line) => (
              <li key={line} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow">Do not</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
            {target.avoid.map((line) => (
              <li key={line} className="flex gap-2">
                <X className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <p className="eyebrow">Platform limitation report</p>
        {limitations.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            No fallbacks needed — this environment supports every capability the lead engine uses.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="pb-2 pr-3 font-medium">
                    Feature
                  </th>
                  <th scope="col" className="pb-2 pr-3 font-medium">
                    Limitation
                  </th>
                  <th scope="col" className="pb-2 pr-3 font-medium">
                    Best available
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    To enable fully
                  </th>
                </tr>
              </thead>
              <tbody>
                {limitations.map((row) => (
                  <tr key={row.feature} className="border-t border-border align-top">
                    <td className="py-2 pr-3 font-medium">{row.feature}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.limitation}</td>
                    <td className="py-2 pr-3">{row.best}</td>
                    <td className="py-2 text-muted-foreground">{row.toEnable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Design tokens (portable)</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(tokens.colors).map(([name, value]) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px]"
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full border border-border"
                  style={{ backgroundColor: value }}
                />
                {name}
              </span>
            ))}
          </div>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border bg-elevated p-2 text-[11px]">
            <code>{tokensCss(tokens)}</code>
          </pre>
        </div>
        <div>
          <p className="eyebrow">Quality bar (every platform)</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUALITY_TARGETS.map((item) => (
              <Pill key={item} tone="signal">
                {item} 9+
              </Pill>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Responsive checks at {RESPONSIVE_BREAKPOINTS.join(", ")}px. {spec.pages.length} visible
            page(s), {spec.pages.reduce((n, p) => n + p.sections.length, 0)} section(s) and{" "}
            {spec.services.length} service(s) travel with the spec.
          </p>
        </div>
      </div>

      <div>
        <p className="eyebrow">Build → test → audit checklist (before you finalize)</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {openBlockers.length === 0
            ? "No blockers left. Every item below is still worth re-testing on the rebuilt site."
            : `${openBlockers.length} blocker(s) must be handled before this build is finalized.`}
        </p>
        <ul className="mt-2 space-y-2">
          {checklist.map((item) => {
            const checked = done[item.id] === true;
            return (
              <li key={item.id} className="rounded-md border border-border bg-elevated p-2.5">
                <label className="flex cursor-pointer gap-2.5 text-[13px]">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
                    checked={checked}
                    onChange={(event) =>
                      setDone((prev) => ({ ...prev, [item.id]: event.target.checked }))
                    }
                  />
                  <span className={checked ? "text-muted-foreground line-through" : ""}>
                    <span className="flex flex-wrap items-center gap-2">
                      <Pill tone={item.severity === "blocker" ? "attention" : "info"}>
                        {item.severity}
                      </Pill>
                      <span className="font-medium">{item.area}</span>
                    </span>
                    <span className="mt-1 block">{item.task}</span>
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      Test: {item.test}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copyBrief}>
          <Copy className="size-4" /> Copy build brief
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => download(`${base}-${platform}-brief.md`, specBrief(spec), "text/markdown")}
        >
          <Download className="size-4" /> Download brief
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            download(
              `${base}-${platform}-spec.json`,
              JSON.stringify(spec, null, 2),
              "application/json",
            )
          }
        >
          <Download className="size-4" /> Download JSON spec
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            download(
              `${base}-build-spec.json`,
              JSON.stringify(normalized, null, 2),
              "application/json",
            );
            toast.success(`Exported ${CONTENT_SCHEMA_VERSION} — import this into any builder.`);
          }}
        >
          <ClipboardCheck className="size-4" /> Export normalized build spec
        </Button>
        {onPublish ? (
          <Button
            type="button"
            variant="outline"
            disabled={!canManage || isPublishing || openBlockers.length > 0}
            onClick={onPublish}
          >
            {publishState === "published" ? "Republish this site" : "Finalize & publish"}
          </Button>
        ) : null}
      </div>
      {onPublish && openBlockers.length > 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Publishing from here stays disabled until the {openBlockers.length} blocker(s) above are
          checked off — the checklist is generated from your real content and this platform's
          limitations, not from a fixed template.
        </p>
      ) : null}
    </Panel>
  );
}
