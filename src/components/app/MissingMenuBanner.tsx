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

export function MissingMenuBanner({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await designSiteChrome({ data: { organizationId } });
      toast.success(result.summary);
      void queryClient.invalidateQueries({ queryKey: ["website_settings", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
    } catch (error) {
      toast.error(friendlyError(error, "The menu bar couldn't be designed just now. Please try again."));
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
      <span>Your site has no menu bar yet, so visitors can&apos;t move between pages or reach your main button.</span>
      {canManage ? (
        <Button size="sm" onClick={() => void run()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Design my menu &amp; footer
        </Button>
      ) : null}
    </div>
  );
}
