/**
 * Search settings for a business website.
 *
 * Presentation only: it edits the four search/hero fields stored in
 * `website_settings.seo` and shows an honest preview of how the page can appear
 * in search results. Nothing here invents facts and nothing is scored as
 * "verified" — length guidance is a hint, not a promise about rankings.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SiteSeo } from "@/lib/site-seo";

const TITLE_IDEAL = { min: 20, max: 60 };
const DESCRIPTION_IDEAL = { min: 70, max: 155 };

function guidance(value: string, range: { min: number; max: number }) {
  const length = value.trim().length;
  if (length === 0) return { tone: "muted", text: "Not written yet" } as const;
  if (length < range.min) return { tone: "warn", text: `${length} characters — a little short` } as const;
  if (length > range.max)
    return { tone: "warn", text: `${length} characters — may be cut off in search` } as const;
  return { tone: "ok", text: `${length} characters — good length` } as const;
}

export function SearchSettings({
  seo,
  businessName,
  previewUrl,
  canManage,
  isSaving,
  onSave,
}: {
  seo: SiteSeo;
  businessName: string | null;
  previewUrl: string | null;
  canManage: boolean;
  isSaving: boolean;
  onSave: (next: SiteSeo) => void;
}) {
  const [headline, setHeadline] = useState(seo.headline ?? "");
  const [subheadline, setSubheadline] = useState(seo.subheadline ?? "");
  const [description, setDescription] = useState(seo.meta_description ?? "");
  const [ctaLabel, setCtaLabel] = useState(seo.primary_cta_label ?? "");

  // Keep the form in step with a change made elsewhere (assistant, rebuild).
  useEffect(() => {
    setHeadline(seo.headline ?? "");
    setSubheadline(seo.subheadline ?? "");
    setDescription(seo.meta_description ?? "");
    setCtaLabel(seo.primary_cta_label ?? "");
  }, [seo.headline, seo.subheadline, seo.meta_description, seo.primary_cta_label]);

  const dirty =
    headline !== (seo.headline ?? "") ||
    subheadline !== (seo.subheadline ?? "") ||
    description !== (seo.meta_description ?? "") ||
    ctaLabel !== (seo.primary_cta_label ?? "");

  const titleHint = guidance(headline, TITLE_IDEAL);
  const descriptionHint = guidance(description, DESCRIPTION_IDEAL);
  const tone = (value: "muted" | "warn" | "ok") =>
    value === "ok" ? "text-primary" : value === "warn" ? "text-amber-400" : "text-muted-foreground";

  return (
    <section className="panel space-y-4 p-4">
      <header>
        <h3 className="font-display text-[15px] font-semibold">How you appear in search</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          These words are used as your page title, your search description and your main heading.
          Write them the way a customer would search for you.
        </p>
      </header>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="seo-headline">Main heading and page title</Label>
          <Input
            id="seo-headline"
            value={headline}
            disabled={!canManage}
            placeholder={businessName ? `${businessName} — what you do, where` : "What you do, where"}
            onChange={(event) => setHeadline(event.target.value)}
          />
          <p className={`text-[11.5px] ${tone(titleHint.tone)}`}>{titleHint.text}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seo-subheadline">Supporting line</Label>
          <Input
            id="seo-subheadline"
            value={subheadline}
            disabled={!canManage}
            placeholder="One line that explains who you help"
            onChange={(event) => setSubheadline(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seo-description">Search description</Label>
          <Textarea
            id="seo-description"
            rows={3}
            value={description}
            disabled={!canManage}
            placeholder="The short paragraph shown under your name in search results."
            onChange={(event) => setDescription(event.target.value)}
          />
          <p className={`text-[11.5px] ${tone(descriptionHint.tone)}`}>{descriptionHint.text}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="seo-cta">Main button wording</Label>
          <Input
            id="seo-cta"
            value={ctaLabel}
            disabled={!canManage}
            placeholder="Get a quote"
            onChange={(event) => setCtaLabel(event.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-elevated/40 p-3">
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Search preview</p>
        <p className="mt-2 truncate text-[12px] text-muted-foreground">
          {previewUrl ?? "Your web address appears here once your site is live"}
        </p>
        <p className="mt-0.5 truncate text-[15px] text-primary">
          {headline.trim() || businessName || "Your page title"}
        </p>
        <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">
          {description.trim() || "Your search description appears here."}
        </p>
      </div>

      {canManage ? (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="signal"
            disabled={!dirty || isSaving}
            onClick={() =>
              onSave({
                ...seo,
                headline: headline.trim() || null,
                subheadline: subheadline.trim() || null,
                meta_description: description.trim() || null,
                primary_cta_label: ctaLabel.trim() || null,
              })
            }
          >
            {isSaving ? "Saving…" : "Save search words"}
          </Button>
          {dirty ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setHeadline(seo.headline ?? "");
                setSubheadline(seo.subheadline ?? "");
                setDescription(seo.meta_description ?? "");
                setCtaLabel(seo.primary_cta_label ?? "");
              }}
            >
              Cancel
            </Button>
          ) : (
            <span className="text-[11.5px] text-muted-foreground">Saved</span>
          )}
        </div>
      ) : (
        <p className="text-[11.5px] text-muted-foreground">
          You can view these words. Ask an owner or admin to change them.
        </p>
      )}
    </section>
  );
}
