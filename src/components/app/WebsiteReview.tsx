import { useState } from "react";
import { Loader2, Monitor, RefreshCw, Smartphone, Tablet, CheckCircle2 } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateWebsiteRequest,
  useSetWebsiteReviewState,
  useWebsiteRequests,
} from "@/lib/queries";
import { runSiteGeneration } from "@/lib/site-engine.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import {
  REQUEST_KINDS,
  requestStatusMeta,
  reviewStateMeta,
  revoraShareAddress,
} from "@/lib/website-plan";
import { previewPath } from "@/lib/builder-preview";
import { cn } from "@/lib/utils";

const DEVICES = [
  { key: "desktop", label: "Desktop", width: "100%", icon: Monitor },
  { key: "laptop", label: "Laptop", width: "1280px", icon: Monitor },
  { key: "tablet", label: "Tablet", width: "820px", icon: Tablet },
  { key: "tablet-small", label: "Small tablet", width: "600px", icon: Tablet },
  { key: "mobile", label: "Mobile", width: "390px", icon: Smartphone },
  { key: "mobile-small", label: "Small phone", width: "320px", icon: Smartphone },
] as const;

type Props = {
  organizationId: string | undefined;
  slug: string | undefined;
  settings:
    | {
        review_state?: string | null;
        publish_state?: string | null;
        generation?: unknown;
        generated_at?: string | null;
      }
    | null
    | undefined;
  canManage: boolean;
};

export function WebsiteReview({ organizationId, slug, settings, canManage }: Props) {
  const [device, setDevice] = useState<(typeof DEVICES)[number]["key"]>("desktop");
  const [showRequest, setShowRequest] = useState(false);
  const runGeneration = useServerFn(runSiteGeneration);
  const [generating, setGenerating] = useState(false);
  const setState = useSetWebsiteReviewState(organizationId);
  const createRequest = useCreateWebsiteRequest(organizationId);
  const { data: requests } = useWebsiteRequests(organizationId);

  const state = reviewStateMeta(settings?.review_state);
  const previewUrl = slug
    ? settings?.publish_state === "published"
      ? `/s/${encodeURIComponent(slug)}`
      : previewPath(slug, "home")
    : null;
  const frameWidth = DEVICES.find((d) => d.key === device)!.width;

  return (
    <div className="space-y-6">
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionHeading eyebrow="Website status" title={state.label} />
            <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">{state.help}</p>
            {slug ? (
              <p className="mt-2 text-[12px] text-muted-foreground">
                Revora share link: {revoraShareAddress(slug)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={state.tone}>{state.label}</Pill>
            {canManage ? (
              <Button
                variant="outline"
                onClick={async () => {
                  if (!organizationId) return;
                  setGenerating(true);
                  try {
                    await runGeneration({ data: { organizationId } });
                    toast.success("AI website build queued.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Couldn't queue the AI website build.");
                  } finally {
                    setGenerating(false);
                  }
                }}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Regenerate from my info
              </Button>
            ) : null}
          </div>
        </div>

        {canManage ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="signal"
              disabled={setState.isPending || settings?.review_state === "approved"}
              onClick={() =>
                setState.mutate({
                  state: "approved",
                  message: "Website approved. Next: choose your web address.",
                })
              }
            >
              <CheckCircle2 className="size-4" /> Approve website
            </Button>
            <Button variant="outline" onClick={() => setShowRequest((s) => !s)}>
              Request changes
            </Button>
          </div>
        ) : null}

        {showRequest ? (
          <form
            className="mt-5 space-y-3 rounded-md border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const title = String(form.get("title") ?? "").trim();
              if (!title) return;
              createRequest.mutate(
                {
                  title,
                  details: String(form.get("details") ?? "") || null,
                  kind: String(form.get("kind") ?? "change"),
                  priority: String(form.get("priority") ?? "normal"),
                },
                {
                  onSuccess: () => {
                    setShowRequest(false);
                    setState.mutate({
                      state: "changes_requested",
                      message: "Change request sent to the Revora team.",
                    });
                  },
                },
              );
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="req-title">What should change?</Label>
              <Input id="req-title" name="title" placeholder="Swap the hero photo" required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="req-kind">Type</Label>
                <select
                  id="req-kind"
                  name="kind"
                  className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                >
                  {REQUEST_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-priority">Priority</Label>
                <select
                  id="req-priority"
                  name="priority"
                  className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-details">Details</Label>
              <Textarea id="req-details" name="details" rows={3} />
            </div>
            <Button type="submit" variant="signal" disabled={createRequest.isPending}>
              Send request
            </Button>
            <p className="text-[12px] text-muted-foreground">
              Requests are reviewed by the Revora team — they are not applied automatically.
            </p>
          </form>
        ) : null}
      </Panel>



      {previewUrl ? (
        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading eyebrow="Preview" title="See it as your customers will" />
            <div className="flex items-center gap-1 rounded-md border border-border p-1">
              {DEVICES.map((d) => {
                const Icon = d.icon;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDevice(d.key)}
                    aria-pressed={device === d.key}
                    aria-label={d.label}
                    className={cn(
                      "cursor-pointer rounded px-2.5 py-1.5 text-[12px]",
                      device === d.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-elevated",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex justify-center overflow-hidden rounded-md border border-border bg-elevated p-3">
            <iframe
              key={device}
              title="Website preview"
              src={previewUrl}
              className="h-[620px] rounded bg-background"
              style={{ width: frameWidth, maxWidth: "100%" }}
            />
          </div>
        </Panel>
      ) : null}

      {(requests ?? []).length ? (
        <Panel className="p-5">
          <SectionHeading eyebrow="Change requests" title="Your requests" />
          <ul className="mt-4 space-y-2">
            {(requests ?? []).map((r) => {
              const meta = requestStatusMeta(r.status as string);
              return (
                <li
                  key={r.id as string}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="text-[13px] font-medium">{r.title as string}</p>
                    {r.details ? (
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {r.details as string}
                      </p>
                    ) : null}
                    {r.admin_notes ? (
                      <p className="mt-1 text-[12px] text-primary">
                        Revora: {r.admin_notes as string}
                      </p>
                    ) : null}
                  </div>
                  <Pill tone={meta.tone}>{meta.label}</Pill>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
