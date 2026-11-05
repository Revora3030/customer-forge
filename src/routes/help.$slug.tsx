import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { findHelpArticle, type HelpArticle } from "@/lib/help-articles";
import { canonicalLink, metaDescription, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/help/$slug")({
  beforeLoad: ({ params }) => {
    const article = findHelpArticle(params.slug);
    if (!article) throw notFound();
    return { article };
  },
  head: ({ match }) => {
    const article = (match.context as { article?: HelpArticle }).article;
    if (!article) return { meta: [{ title: "Page not found — Revora" }, { name: "robots", content: "noindex" }] };
    const path = `/help/${article.slug}`;
    return {
      meta: [{ title: `${article.title} — Revora help` }, { name: "description", content: metaDescription(article.metaDescription) }, ogUrl(path)],
      links: [canonicalLink(path), { rel: "alternate", type: "text/markdown", href: `${path}.md` }],
    };
  },
  component: HelpArticlePage,
});

function HelpArticlePage() {
  const { article } = Route.useRouteContext() as { article: HelpArticle };
  return <div className="min-h-dvh"><SiteHeader />
    <main className="mx-auto max-w-3xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground"><Link to="/help" className="inline-flex min-h-11 items-center hover:text-primary">Help center</Link><span aria-hidden> / </span><span className="text-foreground">{article.title}</span></nav>
      <h1 className="mt-4 font-editorial text-[26px] leading-tight sm:text-[36px]">{article.title}</h1>
      <p className="mt-3 text-[15px] text-muted-foreground">{article.description}</p>
      <ol className="mt-8 list-decimal space-y-3 pl-5 text-[15px] leading-relaxed">{article.steps.map(s => <li key={s}>{s}</li>)}</ol>
      <p className="mt-8 text-xs text-muted-foreground">Updated {article.updated} · <a href={`/help/${article.slug}.md`} className="hover:text-primary">Markdown version</a></p>
    </main><SiteFooter /></div>;
}
