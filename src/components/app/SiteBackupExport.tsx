/**
 * Settings card: download a JSON copy of the website (pages, settings,
 * business details, services, media list). Owners and admins only; the
 * server checks that again. Leads and customers are not included.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/ui/notify";
import { exportSiteBackup } from "@/lib/backup.functions";
import { siteBackupFileName } from "@/lib/site-backup-file";

export function SiteBackupExport({
  organizationId,
  slug,
  canManage,
}: {
  organizationId: string | undefined;
  slug: string | null | undefined;
  canManage: boolean;
}) {
  const run = useServerFn(exportSiteBackup);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (!organizationId) return;
    setBusy(true);
    try {
      const data = await run({ data: { organizationId } });
      const blob = new Blob([data.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = siteBackupFileName(slug, data.takenAt);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Site backup downloaded.");
    } catch {
      toast.error("Couldn't export your site. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-5" data-testid="site-backup-export">
      <SectionHeading eyebrow="Backup" title="Export site backup" />
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        Download a copy of your website as a JSON file: pages, site settings, business details,
        services and your media list. Leads and customers aren't included (export leads from the
        Leads page).
      </p>
      <div className="mt-4">
        {canManage ? (
          <Button variant="outline" onClick={download} disabled={busy || !organizationId}>
            {busy ? "Preparing…" : "Export site backup"}
          </Button>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Only owners and admins can export the site.
          </p>
        )}
      </div>
    </Panel>
  );
}
