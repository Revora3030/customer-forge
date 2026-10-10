/**
 * Shown in the builder when a site with pages has no AI-designed menu bar or
 * footer (sites built before the AI menu existed, or a build that stopped
 * before the menu stage). One tap asks the design team to design them now.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { designSiteChrome } from "@/lib/site-upgrade.functions";
import { announceDraftChange } from "@/lib/builder/preview-bridge";

export function MissingMenuBanner({ organizationId, canManage, hasHeader = false, hasFooter = false }: {
  organizationId: string;
  canManage: boolean;
  hasHeader?: boolean;
  hasFooter?: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await designSiteChrome({ data: { organizationId } });
      toast.success(result.summary);
      void queryClient.invalidateQueries({ queryKey: ["website_settings", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
      announceDraftChange(organizationId);
    } catch (error) {
      const message = friendlyError(error, "The missing site navigation couldn't be designed just now. Please try again.");
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      role="status"
      data-testid="missing-menu-banner"
      className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-[13px] text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <div>
        <span>{hasHeader
          ? "Your draft is missing its footer. Repair it without rebuilding your pages."
          : "Your draft is missing its menu bar. Add navigation without rebuilding your pages."}</span>
        {errorMessage ? <p role="alert" className="mt-1 text-destructive">{errorMessage}</p> : null}
      </div>
      {canManage ? (
        <Button size="sm" data-testid="repair-site-navigation" onClick={() => void run()} disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {busy ? "Generating navigation…" : hasHeader ? "Generate Footer" : hasFooter ? "Generate Menu Bar" : "Generate Menu Bar & Footer"}
        </Button>
      ) : null}
    </div>
  );
}
