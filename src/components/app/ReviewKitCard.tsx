/**
 * "Get more reviews" card for the client dashboard. The owner pastes a Google
 * Place ID or review link, sees the link it builds, copies it, downloads a QR
 * code (PNG or SVG) and copies a message to send to their own customers.
 * Nothing is sent by Revora. The link is saved to the existing business
 * profile review_link field (the one Settings and review requests already use).
 */
import { useEffect, useMemo, useState } from "react";
import { Copy, Download, QrCode, Save } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSaveBusinessProfile } from "@/lib/queries";
import { parseReviewInput, qrFileName, reviewQrPng, reviewQrSvg, reviewRequestTemplate } from "@/lib/review-kit";

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn't copy that. Select the text and copy it by hand.");
  }
}

export function ReviewKitCard({
  organizationId,
  businessName,
  savedLink,
  canManage,
}: {
  organizationId: string | undefined;
  businessName: string;
  savedLink: string | null;
  canManage: boolean;
}) {
  const save = useSaveBusinessProfile(organizationId);
  const [input, setInput] = useState(savedLink ?? "");
  const [touched, setTouched] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  // Follow the saved value until the owner starts typing.
  useEffect(() => {
    if (!touched) setInput(savedLink ?? "");
  }, [savedLink, touched]);

  const parsed = useMemo(() => (input.trim() ? parseReviewInput(input) : null), [input]);
  const url = parsed?.ok ? parsed.url : null;
  const template = url ? reviewRequestTemplate(businessName, url) : "";
  const unsaved = Boolean(url) && url !== (savedLink ?? "").trim();

  useEffect(() => {
    setPng(null);
    setQrError(false);
    if (!showQr || !url) return;
    let active = true;
    reviewQrPng(url)
      .then((value) => active && setPng(value))
      .catch(() => active && setQrError(true));
    return () => {
      active = false;
    };
  }, [showQr, url]);

  const downloadSvg = async () => {
    if (!url) return;
    try {
      const svg = await reviewQrSvg(url);
      const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      download(blobUrl, qrFileName(businessName, "svg"));
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      toast.error("Couldn't make the SVG just now. Try the PNG.");
    }
  };

  return (
    <Panel className="space-y-4">
      <div>
        <p className="text-[13px] font-medium">Get more reviews</p>
        <p className="text-[12px] text-muted-foreground">
          Paste your Google Place ID or review link. We build the link, a QR code and a message you can send to your own customers. We never send anything for you.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-kit-input">Google Place ID or review link</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="review-kit-input"
            className="min-w-60 flex-1"
            placeholder="ChIJ… or https://g.page/r/…/review"
            value={input}
            disabled={!canManage}
            onChange={(event) => {
              setTouched(true);
              setInput(event.target.value);
            }}
            aria-invalid={parsed?.ok === false}
            aria-describedby="review-kit-note"
          />
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!unsaved || save.isPending}
              onClick={() =>
                save.mutate(
                  { review_link: url },
                  { onSuccess: () => setTouched(false) },
                )
              }
            >
              <Save className="size-4" /> {save.isPending ? "Saving…" : "Save link"}
            </Button>
          ) : null}
        </div>
        <p id="review-kit-note" className="text-[12px] text-muted-foreground" role="status">
          {parsed?.ok === false
            ? parsed.message
            : url
              ? unsaved
                ? "Link built. Save it so review requests use it too."
                : "Saved. Review requests use this link."
              : "Find your Place ID in Google's free Place ID Finder, or copy your review link from your Google Business Profile."}
        </p>
        {url ? <p className="break-all text-[12px]">{url}</p> : null}
      </div>

      {url ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copy(url, "Review link copied.")}>
              <Copy className="size-4" /> Copy link
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
              <QrCode className="size-4" /> {showQr ? "Hide QR code" : "Create QR code"}
            </Button>
          </div>

          {showQr ? (
            <div className="flex flex-wrap items-center gap-4">
              {png ? (
                <img src={png} alt={`QR code that opens the review page for ${businessName || "your business"}`} width={160} height={160} className="rounded-md border border-border bg-white" />
              ) : (
                <div className="grid size-40 place-items-center rounded-md border border-border bg-elevated text-[12px] text-muted-foreground">
                  {qrError ? "QR code failed" : "Making QR…"}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!png} onClick={() => png && download(png, qrFileName(businessName, "png"))}>
                  <Download className="size-4" /> Download PNG
                </Button>
                <Button size="sm" variant="outline" onClick={() => void downloadSvg()}>
                  <Download className="size-4" /> Download SVG
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="review-kit-template">Message to send your customers</Label>
            <Textarea id="review-kit-template" readOnly rows={8} value={template} />
            <Button size="sm" variant="outline" onClick={() => void copy(template, "Message copied.")}>
              <Copy className="size-4" /> Copy message
            </Button>
            <p className="text-[12px] text-muted-foreground">Replace [first name], then send it yourself by text or email. Only message customers who expect to hear from you.</p>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
