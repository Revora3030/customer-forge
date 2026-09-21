import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, ExternalLink, Link2, Loader2, Ban } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateShort } from "@/lib/format";
import {
  useCreatePreviewLink,
  usePreviewLinks,
  useRevokePreviewLink,
} from "@/lib/website-content.hooks";

const EXPIRY_CHOICES = [
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
];

/**
 * Header preview button. Published sites open the live public URL; drafts open a
 * private preview link instead, reusing the newest active link when one exists
 * so the client can always see their site before publishing.
 */
export function PreviewSiteButton({
  organizationId,
  slug,
  publishState,
}: {
  organizationId: string | undefined;
  slug: string;
  publishState: string | null | undefined;
}) {
  const { data: links } = usePreviewLinks(organizationId);
  const create = useCreatePreviewLink(organizationId);
  const [readyToken, setReadyToken] = useState<string | null>(null);

  if (publishState === "published") {
    return (
      <Button asChild variant="outline">
        <Link to="/s/$slug" params={{ slug }} target="_blank">
          Preview site <ExternalLink className="size-4" />
        </Link>
      </Button>
    );
  }

  const activeToken = (links ?? []).find(
    (link) => !link.revoked && new Date(link.expires_at).getTime() > Date.now(),
  )?.token;
  const token = activeToken ?? readyToken;

  // A ready link is a real anchor, so phones (and the editor preview frame)
  // open it on the tap itself. Opening a window after an await is blocked by
  // Safari's popup and cross-origin-opener rules, which showed clients an
  // error page instead of their website.
  if (token) {
    return (
      <Button asChild variant="outline">
        <a href={`/p/${token}`} target="_blank" rel="noopener noreferrer">
          Preview site (draft) <ExternalLink className="size-4" />
        </a>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      disabled={create.isPending}
      onClick={() => {
        create
          .mutateAsync({ label: "Builder preview", hours: 168 })
          .then((created) => {
            setReadyToken(created);
            toast.success("Preview ready — tap “Preview site (draft)” to open it.");
          })
          .catch(() => undefined);
      }}
    >
      {create.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ExternalLink className="size-4" />
      )}
      {create.isPending ? "Preparing preview" : "Get preview link"}
    </Button>
  );
}

/**
 * Time-limited share links so a partner or spouse can review the draft without
 * the website going live. Links can be switched off at any moment.
 */
export function PreviewLinks({
  organizationId,
  canManage,
}: {
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const { data: links, isLoading } = usePreviewLinks(organizationId);
  const create = useCreatePreviewLink(organizationId);
  const revoke = useRevokePreviewLink(organizationId);
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState(168);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const urlFor = (token: string) => `${origin}/p/${token}`;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      toast.success("Preview link copied.");
    } catch {
      toast.error("Copy failed — select the link and copy it manually.");
    }
  };

  const state = (link: { revoked: boolean; expires_at: string }) =>
    link.revoked ? "off" : new Date(link.expires_at).getTime() <= Date.now() ? "expired" : "active";

  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="Share for review" title="Private preview links" />
      <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">
        Send a link so someone can review the draft — including the latest AI changes — before you
        publish. Links stop working on their own, and you can switch one off instantly.
      </p>

      {canManage ? (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ label, hours }, { onSuccess: () => setLabel("") });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="preview-label">Who is this for?</Label>
            <Input
              id="preview-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Business partner"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preview-expiry">Expires in</Label>
            <select
              id="preview-expiry"
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
              className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-[13px]"
            >
              {EXPIRY_CHOICES.map((choice) => (
                <option key={choice.hours} value={choice.hours}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="signal" disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            Create link
          </Button>
        </form>
      ) : null}

      <div className="mt-5 space-y-2">
        {isLoading ? (
          <p className="text-[13px] text-muted-foreground">Loading links…</p>
        ) : !links?.length ? (
          <p className="text-[13px] text-muted-foreground">No preview links yet.</p>
        ) : (
          links.map((link) => {
            const status = state(link);
            return (
              <div
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Pill tone={status === "active" ? "signal" : "neutral"}>
                      {status === "active"
                        ? "Active"
                        : status === "off"
                          ? "Switched off"
                          : "Expired"}
                    </Pill>
                    <p className="truncate text-[13px]">{link.label ?? "Preview link"}</p>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    Expires {dateShort(link.expires_at)} · {link.views} view
                    {link.views === 1 ? "" : "s"}
                    {link.last_viewed_at ? ` · last opened ${dateShort(link.last_viewed_at)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {status === "active" ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={`/p/${link.token}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-4" /> Open
                      </a>
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => void copy(link.token)}>
                    <Copy className="size-4" /> Copy
                  </Button>
                  {canManage && status === "active" ? (
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate(link.id)}>
                      <Ban className="size-4" /> Switch off
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
