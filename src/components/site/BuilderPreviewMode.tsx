import { useEffect, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { PreviewModeContext } from "@/components/site/preview-mode-context";
import { DRAFT_CHANNEL } from "@/lib/builder/preview-bridge";
import { shouldRefreshDraft } from "@/lib/builder/draft-refresh";

/**
 * Builder mode of a `/p/:token` preview (the builder's own link, see
 * src/lib/builder/builder-preview-link.ts): the same behaviour the signed-in
 * `/draft` page had — forms are simulated so the owner's own test clicks never
 * send a real enquiry, parts of the page can be picked, and a change saved in
 * another tab reloads this one. Inside the builder frame the builder reloads it.
 */
export function BuilderPreviewMode({ organizationId, children }: { organizationId: string | null | undefined; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined" || window.parent !== window) return;
    const channel = new BroadcastChannel(DRAFT_CHANNEL);
    channel.onmessage = (event) => {
      if (shouldRefreshDraft(event.data, organizationId ?? undefined)) void router.invalidate().catch(() => undefined);
    };
    return () => channel.close();
  }, [router, organizationId]);
  return <PreviewModeContext.Provider value={true}>{children}</PreviewModeContext.Provider>;
}
