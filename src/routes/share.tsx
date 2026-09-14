import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";
import { trackConversion } from "@/lib/conversion";
import { buildChannelAssets, qrImageUrl, trackedLink } from "@/lib/distribution";

const TITLE = "Share Revora — free tools to spread the word";
const DESCRIPTION = `Grab ready-to-send messages, social posts, a QR code and tracked links for Revora. ${usdExact(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month.`;

export const Route = createFileRoute("/share")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/share"),
    ],
    links: [canonicalLink("/share")],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          breadcrumbSchema([
            { name: "Revora", path: "/" },
            { name: "Share Revora", path: "/share" },
          ]),
        ),
      },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const [audience, setAudience] = useState("local service business owners");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const campaign = useMemo(() => (name.trim() ? `share-${name.trim()}` : "share"), [name]);
  const assets = useMemo(() => buildChannelAssets({ campaign, audience }), [campaign, audience]);
  const mainLink = useMemo(
    () => trackedLink("/", { source: "referral", medium: "share", campaign }),
    [campaign],
  );

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast.success("Copied — paste it anywhere.");
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      toast.error("Your browser blocked the clipboard. Select the text and copy it manually.");
    }
  }

  async function nativeShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Revora Growth Systems", url: mainLink });
        trackConversion("cta_click", { metadata: { channel: "native_share" } });
        return;
      } catch {
        /* user dismissed the sheet */
      }
    }
    void copy("main", mainLink);
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Help a business owner get found
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Everything below is free and ready to send. Each link is tracked, so every visit, lead and
          signup it produces is measured — no guessing which channel worked.
        </p>

        <Panel className="mt-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="share-name">Your name or handle (optional)</Label>
              <Input
                id="share-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="jordan"
                className="mt-2"
              />
              <p className="mt-2 text-[13px] text-muted-foreground">
                Tags your links so you can see what your sharing brought in.
              </p>
            </div>
            <div>
              <Label htmlFor="share-audience">Who are you sending it to?</Label>
              <Input
                id="share-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="HVAC companies in Charlotte"
                className="mt-2"
              />
              <p className="mt-2 text-[13px] text-muted-foreground">
                The copy below rewrites itself for that audience.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
            <p className="eyebrow">Your tracked link</p>
            <p className="mt-2 break-all font-mono text-[13px] text-foreground">{mainLink}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={nativeShare}>
                <Share2 className="mr-2 size-4" aria-hidden="true" /> Share
              </Button>
              <Button size="sm" variant="outline" onClick={() => void copy("main", mainLink)}>
                {copied === "main" ? (
                  <Check className="mr-2 size-4" aria-hidden="true" />
                ) : (
                  <Copy className="mr-2 size-4" aria-hidden="true" />
                )}
                Copy link
              </Button>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <img
              src={qrImageUrl(mainLink, 320)}
              alt="QR code that opens the tracked Revora link"
              width={160}
              height={160}
              loading="lazy"
              className="rounded-lg border border-border bg-white p-2"
            />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Print this on flyers, truck decals, counter cards or job-site signs. Scans are tracked
              exactly like clicks.
            </p>
          </div>
        </Panel>

        <SectionHeading
          className="mt-12"
          title="Ready-to-send messages"
          description="Copy, paste, send. Each channel keeps its own honest rules."
        />

        <div className="mt-6 space-y-4">
          {assets.map((asset) => (
            <Panel key={asset.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{asset.label}</h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">{asset.why}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copy(asset.id, asset.message)}
                  >
                    {copied === asset.id ? (
                      <Check className="mr-2 size-4" aria-hidden="true" />
                    ) : (
                      <Copy className="mr-2 size-4" aria-hidden="true" />
                    )}
                    Copy
                  </Button>
                  {asset.intentUrl ? (
                    <Button size="sm" asChild>
                      <a
                        href={asset.intentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          trackConversion("cta_click", { metadata: { channel: asset.id } })
                        }
                      >
                        Open <ExternalLink className="ml-2 size-4" aria-hidden="true" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
              <pre className="mt-4 max-w-full overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground">
                {asset.message}
              </pre>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{asset.note}</p>
            </Panel>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
