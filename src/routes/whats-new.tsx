import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { WHATS_NEW_SEEN_KEY, formatEntryDate, latestEntryDate, publishedEntries } from "@/lib/whats-new";
import { canonicalLink, metaDescription, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/whats-new")({
  head: () => ({
    meta: [
      { title: "What's new — Revora" },
      { name: "description", content: metaDescription("Recent improvements to Revora that are live now for local business owners.") },
      ogUrl("/whats-new"),
    ],
    links: [canonicalLink("/whats-new")],
  }),
  component: WhatsNewPage,
});

function WhatsNewPage() {
  const entries = publishedEntries();
  useEffect(() => {
    const latest = latestEntryDate();
    try { if (latest) window.localStorage.setItem(WHATS_NEW_SEEN_KEY, latest); } catch { /* storage blocked */ }
  }, []);
  const dates = [...new Set(entries.map((e) => e.date))];
  return <div className="min-h-dvh"><SiteHeader />
    <main className="mx-auto max-w-3xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
      <h1 className="font-editorial text-[28px] leading-tight sm:text-[36px]">What's new</h1>
      <p className="mt-3 text-[15px] text-muted-foreground">Improvements that are live in Revora now. Dates are US Eastern time.</p>
      {dates.map((date) => <section key={date} className="mt-10">
        <h2 className="font-display text-[16px] font-semibold"><time dateTime={date}>{formatEntryDate(date)}</time></h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px]">{entries.filter((e) => e.date === date).map((e) => <li key={e.id}>{e.text}</li>)}</ul>
      </section>)}
    </main><SiteFooter /></div>;
}
