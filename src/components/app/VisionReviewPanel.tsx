/**
 * PAGE REVIEW BY A PICTURE-READING MODEL
 * ======================================
 *
 * Revora loads the real page in a hidden frame on the owner's own device,
 * takes a genuine picture of what rendered, and sends that picture to a free
 * picture-reading model for an opinion on how it looks.
 *
 * Everything the model says is checked on the server against a fixed list of
 * visual problems; anything outside that list — and anything that reads like a
 * claim about the business — is thrown away. The owner sees the picture that
 * was reviewed next to the findings, and can repair the ones Revora can fix
 * safely. A restore point is always saved first.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Wrench } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { AI_DESIGN_FINDINGS, aiDesignInstruction } from "@/lib/builder/vision-review";
import {
  applySiteWideRedesign,
  applyVisionRepairs,
  reviewPageScreenshot,
  type VisionReviewResult,
} from "@/lib/site-upgrade.functions";
import {
  useCreatePreviewLink,
  usePreviewLinks,
  useWebsiteContent,
} from "@/lib/website-content.hooks";
import { friendlyError } from "@/lib/user-error";

const WIDTHS = [
  { id: 390, label: "Phone" },
  { id: 1280, label: "Desktop" },
] as const;

/** Every screen width the full review covers: small phone, phone, tablet, laptop, desktop. */
export const FULL_REVIEW_WIDTHS = [320, 390, 768, 1024, 1440] as const;

type SweepRow = { page: string; width: number; score: number | null; note: string; fixed?: string };

/** Loads the page in a hidden frame and captures what actually rendered. */
async function capturePage(url: string, width: number): Promise<{ dataUrl: string; height: number }> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.border = "0";
  frame.style.width = `${width}px`;
  frame.style.height = "1400px";
  frame.src = url;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("The page took too long to load.")), 30_000);
      frame.addEventListener("load", () => {
        window.clearTimeout(timer);
        resolve();
      });
      frame.addEventListener("error", () => {
        window.clearTimeout(timer);
        reject(new Error("The page could not be opened."));
      });
    });
    // Give fonts, pictures and entrance animations a moment to settle so the
    // picture shows what a visitor really sees.
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    const doc = frame.contentDocument;
    if (!doc?.documentElement) throw new Error("The page could not be read on this device.");
    const height = Math.min(Math.max(doc.documentElement.scrollHeight, 600), 2600);
    frame.style.height = `${height}px`;
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    const { domToJpeg } = await import("modern-screenshot");
    const dataUrl = await domToJpeg(doc.documentElement, {
      width,
      height,
      quality: 0.82,
      scale: 0.75,
      backgroundColor: "#ffffff",
    });
    if (!dataUrl.startsWith("data:image/jpeg")) throw new Error("The picture of the page came back empty.");
    return { dataUrl, height };
  } finally {
    frame.remove();
  }
}

export function VisionReviewPanel({
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
  const [width, setWidth] = useState<number>(1280);
  const [pageSlug, setPageSlug] = useState<string>("home");
  const [busy, setBusy] = useState<null | "review" | "repair" | "sweep">(null);
  const [sweep, setSweep] = useState<SweepRow[]>([]);
  const [sweepStatus, setSweepStatus] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [result, setResult] = useState<VisionReviewResult | null>(null);
  const [repairNote, setRepairNote] = useState<string | null>(null);
  const [autoReview, setAutoReview] = useState(true);
  const sweepingRef = useRef(false);
  const settleUntilRef = useRef(0);
  const baselineRef = useRef<Map<string, string> | null>(null);

  const pages = useMemo(() => (content ?? []).filter((page) => page.is_visible), [content]);

  const pageBase = async () => {
    if (!slug) throw new Error("This site has no address yet.");
    if (publishState === "published") return `/s/${slug}`;
    const active = (links ?? []).find(
      (link) => !link.revoked && new Date(link.expires_at).getTime() > Date.now(),
    );
    const token = active?.token ?? (await createLink.mutateAsync({ label: "Page review", hours: 24 }));
    return `/p/${token}`;
  };

  /**
   * Look-and-fix loop: every visible page at every width is photographed and
   * reviewed. When safe repairs exist, they are applied (restore point first,
   * inside applyVisionRepairs) and that same page and width is photographed
   * and reviewed again so the result is proven, not assumed.
   */
  const runSweep = async (only?: typeof pages, automatic = false) => {
    const targets = only ?? pages;
    if (!organizationId || !slug || busy || sweepingRef.current) return;
    if (targets.length === 0) {
      if (!automatic) toast.error("Add a page first — there is nothing to review yet.");
      return;
    }
    sweepingRef.current = true;
    setBusy("sweep");
    setSweep([]);
    setResult(null);
    const rows: SweepRow[] = [];
    const push = (row: SweepRow) => { rows.push(row); setSweep([...rows]); };
    try {
      const base = await pageBase();
      const total = targets.length * FULL_REVIEW_WIDTHS.length;
      let step = 0;
      let stop = false;
      if (automatic) setSweepStatus(`A change was made — checking ${targets.length === 1 ? "that page" : `${targets.length} changed pages`} at 5 sizes.`);
      for (const page of targets) {
        if (stop) break;
        const clean = page.slug.replace(/^\//, "");
        const home = !clean || clean === "home" || page.kind === "home";
        const url = home ? base : `${base}/${clean}`;
        const label = page.title || clean || "Home";
        for (const w of FULL_REVIEW_WIDTHS) {
          step += 1;
          setSweepStatus(`Checking ${label} at ${w}px (${step} of ${total})`);
          const review = async () => {
            const captured = await capturePage(url, w);
            setShot(captured.dataUrl);
            return reviewPageScreenshot({
              data: { organizationId, pageUrl: url, pageSlug: clean || "home", pageTitle: page.title ?? null, viewportWidth: w, screenshotDataUrl: captured.dataUrl },
            });
          };
          try {
            const first = await review();
            if (first.code !== "REVIEWED" || !first.review) {
              push({ page: label, width: w, score: null, note: first.reason ?? "Not reviewed" });
              if (first.code === "VISION_UNAVAILABLE") { stop = true; break; }
              continue;
            }
            const row: SweepRow = { page: label, width: w, score: first.review.score, note: first.summary ?? "" };
            const designAsk = aiDesignInstruction(first.review.findings, label, w);
            if (canManage && ((first.repairs ?? []).length > 0 || designAsk)) {
              const notes: string[] = [];
              if ((first.repairs ?? []).length > 0) {
                const repaired = await applyVisionRepairs({
                  data: { organizationId, pageSlug: clean || "home", findings: first.review.findings },
                });
                notes.push(repaired.summary);
              }
              // Design problems are redesigned by the AI team, not patched by a rule.
              if (designAsk) {
                const redesign = await applySiteWideRedesign({ data: { organizationId, instruction: designAsk } });
                notes.push(redesign.summary);
              }
              const outcome = { summary: notes.join(" ") };
              const again = await review();
              row.fixed = again.code === "REVIEWED" && again.review
                ? `${outcome.summary} Re-checked: ${again.review.score}/100.`
                : `${outcome.summary} The re-check could not run.`;
              if (again.review) row.score = again.review.score;
            }
            push(row);
          } catch (error) {
            push({ page: label, width: w, score: null, note: friendlyError(error, "This check could not run.") });
          }
        }
      }
      setSweepStatus(`Done: ${rows.filter((r) => r.score !== null).length} of ${total} checks reviewed.`);
      void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website_versions", organizationId] });
    } catch (error) {
      setSweepStatus(friendlyError(error, "The full review stopped."));
    } finally {
      setBusy(null);
      sweepingRef.current = false;
      // Repairs made by this review must not trigger another review.
      settleUntilRef.current = Date.now() + 8000;
    }
  };

  // Automatic look-and-fix after every change: when a page's saved content
  // changes (an AI edit, a build, a manual edit), only the changed pages are
  // photographed at all five sizes and repaired. Changes made by the review's
  // own repairs are absorbed into the baseline, so it never loops.
  const fingerprints = useMemo(
    () => new Map(pages.map((page) => [page.id, JSON.stringify([page.slug, page.title, page.sections])])),
    [pages],
  );
  useEffect(() => {
    const previous = baselineRef.current;
    baselineRef.current = fingerprints;
    if (!previous || !autoReview || !canManage) return;
    if (sweepingRef.current || Date.now() < settleUntilRef.current) return;
    const changed = pages.filter((page) => previous.get(page.id) !== fingerprints.get(page.id));
    if (changed.length === 0) return;
    const timer = window.setTimeout(() => void runSweep(changed, true), 3000);
    return () => window.clearTimeout(timer);
    // runSweep is recreated each render; the fingerprint change is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprints, autoReview, canManage]);

  const run = async () => {
    if (!organizationId || !slug || busy) return;
    if (pages.length === 0) {
      toast.error("Add a page first — there is nothing to review yet.");
      return;
    }
    setBusy("review");
    setResult(null);
    setRepairNote(null);
    try {
      let base = `/s/${slug}`;
      if (publishState !== "published") {
        const active = (links ?? []).find(
          (link) => !link.revoked && new Date(link.expires_at).getTime() > Date.now(),
        );
        const token =
          active?.token ?? (await createLink.mutateAsync({ label: "Page review", hours: 24 }));
        base = `/p/${token}`;
      }
      const chosen = pages.find((page) => (page.slug.replace(/^\//, "") || "home") === pageSlug) ?? pages[0];
      const clean = (chosen?.slug ?? "").replace(/^\//, "");
      const home = !clean || clean === "home" || chosen?.kind === "home";
      const url = home ? base : `${base}/${clean}`;

      const captured = await capturePage(url, width);
      setShot(captured.dataUrl);

      const review = await reviewPageScreenshot({
        data: {
          organizationId,
          pageUrl: url,
          pageSlug: clean || "home",
          pageTitle: chosen?.title ?? null,
          viewportWidth: width,
          screenshotDataUrl: captured.dataUrl,
        },
      });
      setResult(review);
      if (review.code === "REVIEWED") {
        toast.success(review.summary ?? "The page was reviewed.");
      } else {
        toast.error(review.reason ?? "The page could not be reviewed.");
      }
    } catch (error) {
      toast.error(friendlyError(error, "The page couldn't be reviewed on this device."));
    } finally {
      setBusy(null);
    }
  };

  const repair = async () => {
    if (!organizationId || !result?.review || busy) return;
    setBusy("repair");
    try {
      const notes: string[] = [];
      if ((result.repairs ?? []).length > 0) {
        const repaired = await applyVisionRepairs({
          data: { organizationId, pageSlug, findings: result.review.findings },
        });
        notes.push(repaired.summary);
      }
      const designAsk = aiDesignInstruction(result.review.findings, pageSlug, width);
      if (designAsk) {
        const redesign = await applySiteWideRedesign({ data: { organizationId, instruction: designAsk } });
        notes.push(redesign.summary);
      }
      const outcome = { summary: notes.join(" ") || "Nothing needed changing." };
      setRepairNote(outcome.summary);
      void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website_settings", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website_versions", organizationId] });
      toast.success(outcome.summary);
    } catch (error) {
      toast.error(friendlyError(error, "The repairs couldn't be applied."));
    } finally {
      setBusy(null);
    }
  };

  const review = result?.review ?? null;
  const fixable = (result?.repairs ?? []).length + (result?.review ? result.review.findings.filter((f) => AI_DESIGN_FINDINGS.has(f.kind)).length : 0);

  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="Page review" title="Have Revora look at the page" />
      <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
        Revora opens the real page on this device, takes a picture of what rendered, and has a free
        picture-reading model say what looks wrong. Only visual problems are reported — never your
        wording, prices or claims.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Screen size">
          {WIDTHS.map((entry) => (
            <Button
              key={entry.id}
              size="sm"
              variant={width === entry.id ? "default" : "outline"}
              aria-pressed={width === entry.id}
              disabled={busy !== null}
              onClick={() => setWidth(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <select
          aria-label="Page to review"
          className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
          value={pageSlug}
          disabled={busy !== null}
          onChange={(event) => setPageSlug(event.target.value)}
        >
          {pages.map((page) => {
            const value = page.slug.replace(/^\//, "") || "home";
            return (
              <option key={page.id} value={value}>
                {page.title || value}
              </option>
            );
          })}
        </select>
        <Button size="sm" variant="outline" disabled={busy !== null || !slug} onClick={() => void run()}>
          {busy === "review" ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          Review this page
        </Button>
        <Button size="sm" disabled={busy !== null || !slug} onClick={() => void runSweep()}>
          {busy === "sweep" ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          Review every page at 5 sizes
        </Button>
        {canManage ? (
          <label className="flex min-h-[36px] items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={autoReview}
              onChange={(event) => setAutoReview(event.target.checked)}
            />
            Check and fix automatically after every change
          </label>
        ) : null}
      </div>

      {sweepStatus ? <p className="mt-3 text-[12px] text-muted-foreground" role="status">{sweepStatus}</p> : null}
      {sweep.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[12px]">
          {sweep.map((row, i) => (
            <li key={i}>
              <span className="font-medium">{row.page}</span> · {row.width}px ·{" "}
              {row.score === null ? "not reviewed" : `${row.score}/100`} — {row.fixed ?? row.note}
            </li>
          ))}
        </ul>
      ) : null}

      {(shot || review) ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[12px] font-medium text-muted-foreground">
              The picture that was reviewed
            </p>
            {shot ? (
              <img
                src={shot}
                alt="The page as it rendered during the review"
                className="w-full rounded-lg border border-border"
              />
            ) : null}
          </div>
          <div className="space-y-2">
            {result?.code === "REVIEWED" && review ? (
              <>
                <Pill tone={review.verdict === "good" ? "signal" : review.verdict === "poor" ? "attention" : "neutral"}>
                  {review.score}/100 — {review.verdict === "good" ? "looks good" : review.verdict === "poor" ? "needs work" : "some issues"}
                </Pill>
                <p className="text-[13px]">{result.summary}</p>
                {review.findings.map((finding, index) => (
                  <p key={index} className="text-[12px] text-muted-foreground">
                    • <span className="font-medium text-foreground">{finding.where}</span> — {finding.detail}
                  </p>
                ))}
                {result.unfixable && result.unfixable.length > 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    {result.unfixable.length} of these need your eye — Revora won't change them on its own.
                  </p>
                ) : null}
                {result.model ? (
                  <p className="text-[11px] text-muted-foreground">Reviewed by {result.model}.</p>
                ) : null}
                {canManage && fixable > 0 ? (
                  <Button size="sm" disabled={busy !== null} onClick={() => void repair()}>
                    {busy === "repair" ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
                    Repair {fixable} of these
                  </Button>
                ) : null}
                {repairNote ? <p className="text-[12px] text-muted-foreground">{repairNote}</p> : null}
              </>
            ) : result ? (
              <Pill tone="attention">{result.reason ?? "Not reviewed"}</Pill>
            ) : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
