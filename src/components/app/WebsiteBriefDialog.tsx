import { useState } from "react";
import { ArrowUp, FilePenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { websiteRequestInstruction, type WebsiteRequest } from "@/lib/builder/website-request";

export function WebsiteBriefDialog({ businessName, disabled, onUse }: { businessName: string | null; disabled: boolean; onUse: (instruction: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WebsiteRequest>({ businessName: businessName ?? "", industry: "", services: "", serviceArea: "", brandPreferences: "", referenceUrl: "" });
  const [error, setError] = useState<string | null>(null);
  const field = (key: keyof WebsiteRequest, value: string) => { setDraft((prior) => ({ ...prior, [key]: value })); setError(null); };
  return <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label="Website brief" title="Website brief"><FilePenLine className="size-4" aria-hidden /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Your website brief</DialogTitle><DialogDescription>Your business, your brand, your next website.</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => {
          event.preventDefault();
          // The dialog is portalled, but React still bubbles its submit up to
          // the chat composer's form, which then sent whatever half-typed
          // message was in the box (e.g. "Build m"). This submit is the brief's alone.
          event.stopPropagation();
          try { onUse(websiteRequestInstruction(draft)); setOpen(false); } catch (err) { setError(err instanceof Error ? err.message : "Check your brief."); }
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="request-business">Business name</Label><Input id="request-business" required maxLength={100} value={draft.businessName} onChange={(e) => field("businessName", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="request-industry">Industry <span className="text-muted-foreground">(optional)</span></Label><Input id="request-industry" maxLength={80} value={draft.industry} onChange={(e) => field("industry", e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="request-services">Services or products</Label><Textarea id="request-services" required maxLength={350} rows={3} value={draft.services} onChange={(e) => field("services", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="request-area">Service area <span className="text-muted-foreground">(optional)</span></Label><Input id="request-area" maxLength={100} value={draft.serviceArea} onChange={(e) => field("serviceArea", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="request-brand">Brand preferences <span className="text-muted-foreground">(optional)</span></Label><Textarea id="request-brand" maxLength={250} rows={2} value={draft.brandPreferences} onChange={(e) => field("brandPreferences", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="request-reference">Reference website <span className="text-muted-foreground">(optional)</span></Label><Input id="request-reference" type="url" maxLength={250} placeholder="https://" value={draft.referenceUrl} onChange={(e) => field("referenceUrl", e.target.value)} /></div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" variant="signal" disabled={disabled}><ArrowUp className="size-4" aria-hidden />Use this brief</Button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}