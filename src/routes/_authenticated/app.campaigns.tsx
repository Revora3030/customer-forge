import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Plus, QrCode, Trash2 } from "lucide-react";
import { EmptyState, LoadingRows, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/ui/notify";
import { useWorkspace } from "@/lib/use-tenant";
import { useWebsiteSettings } from "@/lib/queries";
import {
  useCampaignLeads,
  useCampaigns,
  useDeleteCampaign,
  useSaveCampaign,
} from "@/lib/growth-hooks";
import { currency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns & QR codes — Revora" },
      {
        name: "description",
        content:
          "Create tracked campaign links and printable QR codes, then see which ones produce leads.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CampaignsPage,
});

type Editing = {
  id?: string;
  name: string;
  source: string;
  medium: string;
  code: string;
  target_path: string;
};

const blank: Editing = { name: "", source: "qr", medium: "print", code: "", target_path: "/" };

function slugifyCode(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function CampaignQr({ url, name }: { url: string; name: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, {
      width: 512,
      margin: 1,
      color: { dark: "#0b0d10", light: "#ffffff" },
    })
      .then((value) => {
        if (active) setDataUrl(value);
      })
      .catch(() => setDataUrl(null));
    return () => {
      active = false;
    };
  }, [url]);

  if (!dataUrl) {
    return (
      <div className="grid size-[104px] place-items-center rounded-lg border border-border bg-elevated text-muted-foreground">
        <QrCode className="size-5" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <img
        src={dataUrl}
        alt={`QR code linking to the ${name} campaign`}
        className="size-[104px] rounded-lg border border-border bg-white p-1"
      />
      <Button asChild variant="ghost" size="sm">
        <a href={dataUrl} download={`${slugifyCode(name) || "campaign"}-qr.png`}>
          <Download className="size-3.5" /> PNG
        </a>
      </Button>
    </div>
  );
}

function CampaignsPage() {
  const { data } = useWorkspace();
  const orgId = data?.workspace?.organizationId;
  const org = data?.workspace?.organization;
  const settings = useWebsiteSettings(orgId);
  const campaigns = useCampaigns(orgId);
  const leads = useCampaignLeads(orgId);
  const save = useSaveCampaign(orgId);
  const remove = useDeleteCampaign(orgId);
  const [editing, setEditing] = useState<Editing | null>(null);

  const siteOrigin = useMemo(() => {
    const custom = settings.data?.custom_domain;
    if (custom && settings.data?.domain_verified) return `https://${custom}`;
    if (typeof window !== "undefined" && org?.slug)
      return `${window.location.origin}/s/${org.slug}`;
    return org?.slug ? `/s/${org.slug}` : "";
  }, [settings.data, org?.slug]);

  const linkFor = (campaign: { code: string; source: string; target_path: string | null }) => {
    const path = campaign.target_path && campaign.target_path !== "/" ? campaign.target_path : "";
    const base = `${siteOrigin}${path.startsWith("/") ? path : path ? `/${path}` : ""}`;
    const params = new URLSearchParams({
      utm_source: campaign.source,
      utm_campaign: campaign.code,
    });
    return `${base}?${params.toString()}`;
  };

  const leadsByCampaign = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const lead of leads.data ?? []) {
      if (!lead.campaign) continue;
      const row = map.get(lead.campaign) ?? { count: 0, value: 0 };
      row.count += 1;
      row.value += Number(lead.estimated_value ?? 0);
      map.set(lead.campaign, row);
    }
    return map;
  }, [leads.data]);

  const copy = (value: string) => {
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success("Campaign link copied."))
      .catch(() => toast.error("Couldn't copy that link."));
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Attribution"
        title="Campaigns & QR codes"
        action={
          <Button variant="signal" size="sm" onClick={() => setEditing({ ...blank })}>
            <Plus className="size-4" /> New campaign
          </Button>
        }
      />

      <Panel>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Every campaign gets a tracked link and a printable QR code. Visitors who arrive through
          one are tagged for their whole session, so the leads, quotes and bookings they submit are
          attributed back here — even if they submit several pages later.
        </p>
      </Panel>

      {campaigns.isLoading ? (
        <LoadingRows rows={3} />
      ) : (campaigns.data ?? []).length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create one for each flyer, vehicle wrap, yard sign or paid ad so you can see exactly what brings in work."
          action={
            <Button variant="signal" size="sm" onClick={() => setEditing({ ...blank })}>
              <Plus className="size-4" /> New campaign
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(campaigns.data ?? []).map((campaign) => {
            const url = linkFor(campaign);
            const attributed = leadsByCampaign.get(campaign.code);
            return (
              <Panel key={campaign.id} className="flex gap-4">
                <CampaignQr url={url} name={campaign.name} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-display text-[15px] font-semibold">
                        {campaign.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {campaign.source}
                        {campaign.medium ? ` · ${campaign.medium}` : ""} · {campaign.code}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copy(url)}
                        aria-label="Copy campaign link"
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${campaign.name}`}
                        onClick={() => remove.mutate(campaign.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{url}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Pill tone="info">{campaign.views} visits</Pill>
                    <Pill tone="attention">{campaign.conversions} actions</Pill>
                    <Pill tone="signal">{attributed?.count ?? 0} leads</Pill>
                    {attributed?.value ? <Pill>{currency(attributed.value)} pipeline</Pill> : null}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit campaign" : "New campaign"}</DialogTitle>
            <DialogDescription>
              The tracking code is what appears in your reports, so keep it short and recognisable.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const code = slugifyCode(editing.code || editing.name);
                if (!editing.name.trim() || !code) {
                  toast.error("Give the campaign a name.");
                  return;
                }
                save.mutate(
                  {
                    ...(editing.id ? { id: editing.id } : {}),
                    name: editing.name.trim(),
                    source: slugifyCode(editing.source) || "qr",
                    medium: editing.medium.trim() || null,
                    code,
                    target_path: editing.target_path.trim() || "/",
                  },
                  { onSuccess: () => setEditing(null) },
                );
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Campaign name</Label>
                <Input
                  id="c-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Spring flyer drop"
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-source">Source</Label>
                  <Input
                    id="c-source"
                    value={editing.source}
                    onChange={(e) => setEditing({ ...editing, source: e.target.value })}
                    placeholder="qr, facebook, google"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-medium">Medium</Label>
                  <Input
                    id="c-medium"
                    value={editing.medium}
                    onChange={(e) => setEditing({ ...editing, medium: e.target.value })}
                    placeholder="print, social, paid"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-code">Tracking code</Label>
                  <Input
                    id="c-code"
                    value={editing.code}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                    placeholder="spring-flyer"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-path">Landing page</Label>
                  <Input
                    id="c-path"
                    value={editing.target_path}
                    onChange={(e) => setEditing({ ...editing, target_path: e.target.value })}
                    placeholder="/"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="signal" disabled={save.isPending}>
                  Save campaign
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
