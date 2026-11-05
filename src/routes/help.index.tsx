import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { HELP_ARTICLES } from "@/lib/help-articles";
import { canonicalLink, metaDescription, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/help/")({
  head: () => ({
    meta: [
      { title: "Help center — Revora" },
      { name: "description", content: metaDescription("Short how-to articles for Revora owners: pages, domains, leads, booking link, trial and billing.") },
      ogUrl("/help"),
    ],
    links: [canonicalLink("/help"), { rel: "alternate", type: "text/markdown", href: "/help.md" }],
  }),
  component: HelpIndex,
});

function HelpIndex() {
  return <div className="min-h-screen"><SiteHeader />
    <main className="mx-auto max-w-3xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
      <h1 className="font-editorial text-[28px] leading-tight sm:text-[36px]">Help center</h1>
      <p className="mt-3 text-[15px] text-muted-foreground">Short answers for running your Revora site. Each article is also available as plain markdown.</p>
      <ul className="mt-8 space-y-3">{HELP_ARTICLES.map(a => <li key={a.slug} className="rounded-xl border border-border/60 p-4"><Link to="/help/$slug" params={{ slug: a.slug }} className="font-display text-[16px] font-semibold hover:text-primary">{a.title}</Link><p className="mt-1 text-[14px] text-muted-foreground">{a.description}</p></li>)}</ul>
    </main><SiteFooter /></div>;
}
