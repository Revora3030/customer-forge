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
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Wrench } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import {
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
  const [busy, setBusy] = useState<null | "review" | "repair">(null);
  const [shot, setShot] = useState<string | null>(null);
  const [result, setResult] = useState<VisionReviewResult | null>(null);
  const [repairNote, setRepairNote] = useState<string | null>(null);

  const pages = (content ?? []).filter((page) => page.is_visible);

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
      const outcome = await applyVisionRepairs({
        data: { organizationId, pageSlug, findings: result.review.findings },
      });
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
  const fixable = (result?.repairs ?? []).length;

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
      </div>

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
