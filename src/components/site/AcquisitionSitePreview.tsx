import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Clock, Send, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import type { CompositionTree } from "@/lib/builder/composition-tree";
import { recordAcquisitionSiteInterest, type PublicAcquisitionSite } from "@/lib/jarvis-acquisition-studio.functions";

export function AcquisitionSitePreview({ token, site }: { token: string; site: PublicAcquisitionSite }) {
  const submit = useServerFn(recordAcquisitionSiteInterest);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const interest = useMutation({
    mutationFn: () => submit({ data: { token, contactName: name, email, phone, notes } }),
    onSuccess: (result) => {
      toast.success(result.message);
      setName("");
      setEmail("");
      setPhone("");
      setNotes("");
    },
    onError: (error: Error) => toast.error(error.message || "Your request could not be saved."),
  });
  const expires = new Date(site.expiresAt);
  const expiresLabel = Number.isNaN(expires.getTime())
    ? "time-limited"
    : expires.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-muted/70 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="size-4" aria-hidden /></span>
            <div>
              <p className="text-sm font-semibold">A website concept prepared by Revora</p>
              <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">This is a private, unapproved concept—not a live business website. Business facts and suggested services need owner confirmation before launch.</p>
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3.5" aria-hidden /> Preview expires {expiresLabel}</p>
        </div>
      </div>

      <div id="top" className="mx-auto max-w-7xl px-3 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold">{site.title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{site.description}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs"><ShieldCheck className="size-3.5" aria-hidden /> Safety-checked concept</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <CompositionRenderer
            tree={site.tree as CompositionTree}
            scope={"acquisition-" + token.slice(0, 8)}
            resolveHref={(href) => /^#[a-z0-9_-]{1,60}$/i.test(href) ? href : "#contact"}
          />
        </div>

        <section id="contact" className="mx-auto grid max-w-5xl gap-6 py-12 lg:grid-cols-[1fr_0.9fr] lg:items-start">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Next step</p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Make this concept accurate to your business.</h2>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">Request a conversation about the draft. Revora will confirm your services, contact details, service area, branding, domain, and any facts before a final website is launched.</p>
            <div className="space-y-3">
              {site.factsToConfirm.slice(0, 8).map((fact, index) => (
                <div key={fact + index} className="flex items-start gap-2 text-sm">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{fact}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium">Suggested services for review</p>
              {site.proposedServices.length ? (
                <ul className="mt-2 flex flex-wrap gap-2">{site.proposedServices.slice(0, 10).map((service) => <li key={service} className="rounded-full border border-border bg-card px-3 py-1 text-xs">{service} · proposed</li>)}</ul>
              ) : <p className="mt-2 text-xs text-muted-foreground">No service list was guessed. We will add your verified services after confirmation.</p>}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{site.designNotes}</p>
            </div>
          </div>

          <form
            className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
            onSubmit={(event) => { event.preventDefault(); if (!interest.isPending) interest.mutate(); }}
          >
            <div>
              <h3 className="text-lg font-semibold">Discuss this website</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Submitting this form only sends your request to Revora's review queue. It does not publish a site, sign you up, or charge you.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acquisition-contact-name">Your name</Label>
              <Input id="acquisition-contact-name" autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acquisition-contact-email">Email</Label>
              <Input id="acquisition-contact-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acquisition-contact-phone">Phone (optional)</Label>
              <Input id="acquisition-contact-phone" type="tel" autoComplete="tel" maxLength={50} value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acquisition-contact-notes">What would you change? (optional)</Label>
              <Textarea id="acquisition-contact-notes" rows={3} maxLength={1400} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Services to add, brand colors, or information we should verify…" />
            </div>
            <Button type="submit" className="w-full" disabled={interest.isPending}>
              <Send className="mr-2 size-4" aria-hidden />{interest.isPending ? "Sending request…" : "Request changes and next steps"}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">No automatic follow-up or marketing subscription is created by this form. Your request is reviewed before contact.</p>
          </form>
        </section>
        <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">Private draft preview · Noindex · Revora Growth Systems</footer>
      </div>
    </main>
  );
}
