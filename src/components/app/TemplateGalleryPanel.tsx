import { useMemo, useState } from "react";
import { Layers, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { askAssistant } from "@/lib/assistant-bridge";
import {
  searchTemplates,
  suggestTemplates,
  templateInstruction,
  type SiteTemplate,
} from "@/lib/builder/template-gallery";

/**
 * Starting points the owner can browse. A template only decides structure —
 * which pages exist and what the home page carries — so choosing one can never
 * put a claim on the site that the business did not write.
 */
export function TemplateGalleryPanel({
  canManage,
  industry,
  description,
  businessName,
}: {
  canManage: boolean;
  industry: string | null;
  description: string | null;
  businessName: string | null;
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const suggested = useMemo(
    () => suggestTemplates({ industry, description, name: businessName }, 3),
    [industry, description, businessName],
  );
  const results = useMemo(
    () => (query.trim() ? searchTemplates(query, 12) : suggested),
    [query, suggested],
  );

  if (!canManage) return null;

  return (
    <Panel>
      <SectionHeading
        title="Start from a layout"
        hint="Layouts for different kinds of business. They set the pages and the order of the home page — all the words still come from your own details."
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={60}
            placeholder="Search layouts, e.g. restaurant, clinic, salon"
            className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm outline-none focus:border-white/30"
          />
        </div>
      </div>

      {!query.trim() ? (
        <p className="text-sm text-muted-foreground">Closest matches for your business first.</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing matched “{query.trim()}”. Try the kind of business instead, like “clinic” or “cafe”.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {results.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            open={openId === template.id}
            onToggle={() => setOpenId(openId === template.id ? null : template.id)}
          />
        ))}
      </div>
    </Panel>
  );
}

function TemplateCard({
  template,
  open,
  onToggle,
}: {
  template: SiteTemplate;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Layers className="size-4 text-muted-foreground" />
            {template.name}
          </p>
          <p className="text-xs text-muted-foreground">{template.summary}</p>
        </div>
        <Pill>{template.goalLabel}</Pill>
      </div>

      <p className="text-xs text-muted-foreground">
        {template.pages.length} pages · {template.homeBlocks.length} blocks on the home page
      </p>

      {open ? (
        <div className="space-y-2 rounded-lg bg-black/20 p-2 text-xs text-muted-foreground">
          <p>
            <span className="text-foreground">Pages:</span> {template.pages.join(", ")}
          </p>
          <p>
            <span className="text-foreground">Home page, in order:</span>{" "}
            {template.homeBlocks.join(" → ")}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onToggle}>
          {open ? "Hide details" : "See what's in it"}
        </Button>
        <Button size="sm" onClick={() => askAssistant(templateInstruction(template))}>
          Use this layout
        </Button>
      </div>
    </div>
  );
}
