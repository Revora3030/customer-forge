import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "@/lib/ui/notify";

import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DAILY_ROUTINE,
  FREE_LISTINGS,
  buildChannelAssets,
  qrImageUrl,
  routineMinutes,
  trackedLink,
} from "@/lib/distribution";

const DONE_KEY = "revora.outreach.done";

export const Route = createFileRoute("/_authenticated/admin/outreach")({
  head: () => ({
    meta: [{ title: "Outreach — Revora admin" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminOutreach,
});

function AdminOutreach() {
  const [audience, setAudience] = useState("local service business owners");
  const [campaign, setCampaign] = useState("nationwide");
  const [done, setDone] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DONE_KEY);
      if (raw) setDone(JSON.parse(raw) as string[]);
    } catch {
      /* private mode simply loses progress */
    }
  }, []);

  function toggle(id: string) {
    setDone((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        window.localStorage.setItem(DONE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const assets = useMemo(() => buildChannelAssets({ campaign, audience }), [campaign, audience]);
  const homeLink = useMemo(
    () => trackedLink("/", { source: "outreach", medium: "direct", campaign }),
    [campaign],
  );

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast.success("Copied.");
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      toast.error("Clipboard blocked — select the text and copy it manually.");
    }
  }

  return (
    <div className="product-page">
      <SectionHeading
        title="Outreach console"
        description="Every free channel, with tracked links and honest rules. Paid ads, bulk SMS and broadcast placement are bought outside Revora — the assets are ready here."
      />

      <Panel>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="campaign">Campaign name</Label>
            <Input
              id="campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="audience">Audience</Label>
            <Input
              id="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="mt-2"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="break-all font-mono text-[12px] text-muted-foreground">{homeLink}</p>
          <Button size="sm" variant="outline" onClick={() => void copy("home", homeLink)}>
            {copied === "home" ? (
              <Check className="mr-2 size-4" aria-hidden="true" />
            ) : (
              <Copy className="mr-2 size-4" aria-hidden="true" />
            )}
            Copy
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={qrImageUrl(homeLink, 800)} target="_blank" rel="noopener noreferrer">
              QR image <ExternalLink className="ml-2 size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Results appear in{" "}
          <a className="text-primary underline" href="/admin/analytics">
            Analytics
          </a>{" "}
          by source and campaign as soon as the first visit lands.
        </p>
      </Panel>

      <div>
        <SectionHeading
          title="Daily routine"
          description={`About ${routineMinutes()} minutes a day. This is the part that compounds — reach comes from repetition, not one blast.`}
        />
        <Panel className="mt-4">
          <ul className="space-y-3">
            {DAILY_ROUTINE.map((item) => {
              const id = `routine:${item.task}`;
              const isDone = done.includes(id);
              return (
                <li key={id} className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-pressed={isDone}
                    className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border ${
                      isDone
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-transparent"
                    }`}
                  >
                    <Check className="size-4" aria-hidden="true" />
                    <span className="sr-only">{isDone ? "Mark not done" : "Mark done"}</span>
                  </button>
                  <div>
                    <p
                      className={`text-[13px] ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}
                    >
                      {item.task}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.minutes} min · {item.channel}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div>
        <SectionHeading
          title="Free listings"
          description="Each one is free to submit and puts Revora in front of owners who are already searching."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FREE_LISTINGS.map((listing) => {
            const id = `listing:${listing.label}`;
            const isDone = done.includes(id);
            return (
              <Panel key={id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{listing.label}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">{listing.why}</p>
                  </div>
                  {isDone ? <Pill tone="signal">Submitted</Pill> : <Pill>Free</Pill>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" asChild>
                    <a href={listing.url} target="_blank" rel="noopener noreferrer">
                      Open <ExternalLink className="ml-2 size-4" aria-hidden="true" />
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggle(id)}>
                    {isDone ? "Mark not done" : "Mark submitted"}
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>

      <div>
        <SectionHeading
          title="Channel assets"
          description="Copy-ready messages with tracked links, including the 30-second radio/TV read."
        />
        <div className="mt-4 space-y-3">
          {assets.map((asset) => (
            <Panel key={asset.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{asset.label}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{asset.why}</p>
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
                      <a href={asset.intentUrl} target="_blank" rel="noopener noreferrer">
                        Open <ExternalLink className="ml-2 size-4" aria-hidden="true" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
              <pre className="mt-3 max-w-full overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-[12px] leading-relaxed whitespace-pre-wrap text-foreground">
                {asset.message}
              </pre>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{asset.note}</p>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}
