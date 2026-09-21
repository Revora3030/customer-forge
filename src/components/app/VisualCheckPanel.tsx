/**
 * LAYER 2 in the builder: the "Run visual check" control.
 *
 * The website is loaded in a hidden frame on the owner's own browser, resized
 * through eight required phone and desktop widths, and measured for real — sideways
 * scrolling, broken pictures, cut-off text, buttons a thumb can't hit. The raw
 * measurements go to the server, which grades them itself and stores the
 * verdict the launch gate reads.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MonitorCheck } from "lucide-react";
import { toast } from "sonner";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { measureSitePages } from "@/lib/builder/visual-measure";
import type { VisualReport } from "@/lib/builder/visual";
import { recordVisualCheck } from "@/lib/visual-check.functions";
import {
  useCreatePreviewLink,
  usePreviewLinks,
  useWebsiteContent,
} from "@/lib/website-content.hooks";
import { friendlyError } from "@/lib/user-error";
import { useLatestGenerationJob } from "@/lib/site-engine.hooks";

export function VisualCheckPanel({
  organizationId,
  slug,
  publishState,
  canManage,
}: {
  organizationId: string | undefined;
  slug: string | undefined;
  publishState: string | null | undefined;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: links } = usePreviewLinks(organizationId);
  const { data: content } = useWebsiteContent(organizationId);
  const createLink = useCreatePreviewLink(organizationId);
  const { data: latestJob } = useLatestGenerationJob(organizationId);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(
    null,
  );
  const [result, setResult] = useState<VisualReport | null>(null);
  const autoRunRef = useRef<string | null>(null);

  const run = useCallback(async (automatic = false): Promise<boolean> => {
    if (!organizationId || !slug || running) return false;
    const visible = (content ?? []).filter((page) => page.is_visible);
    if (!visible.length) {
      toast.error("Add a page first — there is nothing to check yet.");
      return false;
    }
    setRunning(true);
    setResult(null);
    try {
      // Published sites are measured at their public address; drafts through a
      // private preview link, reusing an active one when it exists.
      let base = `/s/${slug}`;
      if (publishState !== "published") {
        const active = (links ?? []).find(
          (link) => !link.revoked && new Date(link.expires_at).getTime() > Date.now(),
        );
        const token =
          active?.token ?? (await createLink.mutateAsync({ label: "Visual check", hours: 24 }));
        base = `/p/${token}`;
      }
      // EVERY visitor-visible page is measured, not just the home page.
      const targets = visible.map((page) => {
        const clean = page.slug.replace(/^\//, "");
        const home = !clean || clean === "home" || page.kind === "home";
        return { page: clean || "home", url: home ? base : `${base}/${clean}`, title: page.title };
      });
      const measured = await measureSitePages(
        targets.map(({ page, url }) => ({ page, url })),
        (label, done, total) => setProgress({ label, done, total }),
      );
      const saved = await recordVisualCheck({
        data: {
          organizationId,
          expectedPages: targets.map((target) => target.page),
          pages: measured.map((entry) => ({
            pageSlug: entry.page,
            pageUrl: targets.find((target) => target.page === entry.page)?.url ?? base,
            measurements: entry.measurements,
          })),
        },
      });
      setResult(saved.report);
      if (saved.report.passed) {
        toast.success(`Visual check passed — score ${saved.report.score}/100.`);
      } else if (!automatic) {
        toast.error("The visual check found problems that must be fixed before launch.");
      }
      void queryClient.invalidateQueries({ queryKey: ["production-readiness"] });
      void queryClient.invalidateQueries({ queryKey: ["production-status"] });
      void queryClient.invalidateQueries({ queryKey: ["build_readiness"] });
      return true;
    } catch (error) {
      if (!automatic) {
        toast.error(friendlyError(error, "The visual check couldn't run. Please try again."));
      }
      return false;
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [content, createLink, links, organizationId, publishState, queryClient, running, slug]);

  useEffect(() => {
    const job = latestJob as { id?: string; status?: string } | null | undefined;
    if (
      !canManage ||
      !organizationId ||
      !slug ||
      job?.status !== "completed" ||
      !job.id ||
      running ||
      document.visibilityState !== "visible"
    ) return;
    const key = `revora:visual-check:${organizationId}:${job.id}`;
    if (autoRunRef.current === key || window.localStorage.getItem(key)) return;
    autoRunRef.current = key;
    void run(true).then((completed) => {
      if (completed) window.localStorage.setItem(key, new Date().toISOString());
      else autoRunRef.current = null;
    });
  }, [canManage, latestJob, organizationId, run, running, slug]);

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeading eyebrow="Real-browser check" title="See it the way visitors do" />
          <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
            Revora opens your website on this device and measures it at eight required phone and desktop
            widths, on every page — checking for sideways scrolling, broken pictures, cut-off text
            and buttons that are hard to tap. Publishing stays locked until this passes at 95 or
            better.
          </p>
          {result ? (
            <div className="mt-3 space-y-1.5">
              <Pill tone={result.passed ? "signal" : "attention"}>
                Score {result.score}/100 — {result.passed ? "passed" : "needs fixes"}
              </Pill>
              {result.findings.slice(0, 5).map((finding, index) => (
                <p key={index} className="text-[12px] text-muted-foreground">
                  {finding.page ? <span className="font-medium">{finding.page}: </span> : null}
                  {finding.detail} {finding.fix}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-muted-foreground">
              Not measured in this browser yet. Revora runs this check while the builder is open.
            </p>
          )}
          {progress ? (
            <p className="mt-2 text-[12px] text-muted-foreground" role="status">
              Measuring {progress.label} — step {progress.done} of {progress.total}…
            </p>
          ) : null}
        </div>
        {canManage ? (
          <Button variant="outline" onClick={() => void run(false)} disabled={running || !slug}>
            {running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MonitorCheck className="size-4" />
            )}
            {running ? "Checking…" : "Run visual check"}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
