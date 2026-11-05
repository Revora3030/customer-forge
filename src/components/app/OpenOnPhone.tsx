/**
 * "Open on your phone": a QR code and the link as text, so an owner can check
 * their site on the device their customers use. Reuses the browser-side QR
 * path from the review kit (the link is never sent to an image service).
 */
import { useEffect, useState } from "react";
import { Copy, QrCode, Smartphone } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { phoneQrAlt, type PhoneLink } from "@/lib/builder/open-on-phone";
import { reviewQrPng } from "@/lib/review-kit";

export function QrStatus({ state }: { state: "loading" | "error" }) {
  return (
    <div
      role="status"
      className="flex size-40 items-center justify-center rounded-md border border-border bg-muted px-3 text-center text-[12px] text-muted-foreground"
      data-testid="open-on-phone-status"
    >
      {state === "error" ? "The QR code couldn't be made. Use the link below." : "Making your QR code…"}
    </div>
  );
}

export function OpenOnPhoneQr({ link }: { link: PhoneLink }) {
  const [png, setPng] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPng(null);
    setFailed(false);
    let active = true;
    reviewQrPng(link.url, 640)
      .then((value) => active && setPng(value))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [link.url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy that. Select the link and copy it by hand.");
    }
  };

  return (
    <div className="flex flex-col items-center gap-3" data-testid="open-on-phone">
      {png ? (
        <img
          src={png}
          alt={phoneQrAlt(link)}
          width={160}
          height={160}
          className="size-40 rounded-md border border-border bg-white"
        />
      ) : (
        <QrStatus state={failed ? "error" : "loading"} />
      )}
      <p className="max-w-full break-all text-center text-[12px] text-muted-foreground" data-testid="open-on-phone-url">
        {link.url}
      </p>
      <Button size="sm" variant="outline" onClick={() => void copy()}>
        <Copy className="size-4" /> Copy link
      </Button>
    </div>
  );
}

/** Preview-toolbar button: opens a small card with the QR for the live or draft address. */
export function OpenOnPhoneButton({ link }: { link: PhoneLink | null }) {
  if (!link) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="outline" aria-label="Open on your phone" title="Open on your phone">
          <QrCode className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <p className="mb-3 flex items-center gap-1.5 text-[13px] font-medium">
          <Smartphone className="size-4" aria-hidden /> Open on your phone
        </p>
        <OpenOnPhoneQr link={link} />
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Point your phone camera at the code to see {link.label}.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** Shown right after a successful publish. */
export function OpenOnPhoneDialog({
  open,
  onOpenChange,
  link,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: PhoneLink | null;
}) {
  if (!link) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Your website is live</DialogTitle>
          <DialogDescription>
            Scan this with your phone camera to see {link.label} the way your customers will.
          </DialogDescription>
        </DialogHeader>
        <OpenOnPhoneQr link={link} />
      </DialogContent>
    </Dialog>
  );
}
