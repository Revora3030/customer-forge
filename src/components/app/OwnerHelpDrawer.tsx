/**
 * LOV-8 closeout — owner in-app help drawer that links into /help articles.
 *
 * B13-9's visitor SiteHelpDrawer stays call/quote-only on public customer
 * sites; owners use this drawer (and /help) for Revora product help.
 */
import { useMemo, useState } from "react";
import { BookOpen, ExternalLink, HelpCircle, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { HELP_ARTICLES, matchHelpArticles, type HelpArticleCitation } from "@/lib/help-articles";
import { cn } from "@/lib/utils";

function ArticleRow({ article }: { article: HelpArticleCitation }) {
  return (
    <Link
      to="/help/$slug"
      params={{ slug: article.slug }}
      className="block rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:border-primary/40 hover:bg-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{article.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{article.description}</p>
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
      </div>
      <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">{article.path}</p>
    </Link>
  );
}

export function OwnerHelpDrawer({
  triggerClassName,
  label = "Help",
}: {
  triggerClassName?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => (query.trim() ? matchHelpArticles(query, 8) : HELP_ARTICLES.map((a) => ({
      slug: a.slug,
      title: a.title,
      description: a.description,
      path: `/help/${a.slug}`,
      markdownPath: `/help/${a.slug}.md`,
    }))),
    [query],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("gap-1.5 text-muted-foreground hover:text-foreground", triggerClassName)}
          aria-label="Open owner help"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border/60 px-4 py-3 text-left space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary" />
            Owner help
          </SheetTitle>
          <SheetDescription className="text-xs">
            Short guides for running Revora. Each row opens the matching /help article.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 py-3 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help (billing, domain, trial…)"
              className="pl-8 h-9 text-sm"
              aria-label="Search owner help articles"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No articles matched. Try “billing”, “domain”, or “trial”.
            </p>
          ) : (
            results.map((a) => <ArticleRow key={a.slug} article={a} />)
          )}
        </div>
        <div className="border-t border-border/60 px-4 py-3 flex items-center justify-between gap-2">
          <Link
            to="/help"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            Open full help center →
          </Link>
          <a
            href="/help.md"
            className="text-[10px] font-mono text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            /help.md
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
