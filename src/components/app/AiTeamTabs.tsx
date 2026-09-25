/**
 * All settings → Pages and Images, routed to the AI team.
 * Every action here sends a real request into the builder chat; nothing edits
 * the site directly. Service pages are listed from the owner's real services.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { askAssistant } from "@/lib/assistant-bridge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type PageRow = { slug?: string | null; title?: string | null };

const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function Ask({ placeholder, onSent, canManage }: { placeholder: string; onSent: () => void; canManage: boolean }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <Textarea rows={2} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      <Button
        size="sm"
        disabled={!canManage || text.trim().length < 4}
        onClick={() => {
          askAssistant(text.trim());
          setText("");
          onSent();
        }}
      >
        Send to my AI team
      </Button>
    </div>
  );
}

export function AiTeamPages({
  organizationId,
  pages,
  canManage,
  onSent,
}: {
  organizationId: string | undefined;
  pages: PageRow[];
  canManage: boolean;
  onSent: () => void;
}) {
  const services = useQuery({
    queryKey: ["services", organizationId, "ai-pages"],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, price, starting_price")
        .eq("organization_id", organizationId!)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const built = pages.length > 0;
  const send = (prompt: string) => {
    askAssistant(prompt);
    onSent();
  };

  return (
    <div className="space-y-4">
      {!built ? (
        <p className="text-sm text-muted-foreground">
          Service pages open up once your first website is built.
        </p>
      ) : null}
      <ul className="space-y-2">
        {(services.data ?? []).map((s) => {
          const has = pages.some((p) => {
            const key = norm(s.name);
            return key.length > 0 && (norm(p.slug).includes(key) || norm(p.title).includes(key));
          });
          return (
            <li key={s.id} className="panel flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{has ? "Has a page" : "No page yet"}</p>
              </div>
              <Button
                size="sm"
                variant={has ? "outline" : "default"}
                disabled={!built || !canManage}
                onClick={() =>
                  send(
                    has
                      ? `Improve the "${s.name}" service page so it converts better. Use only facts I've given (service details and price); don't invent anything.`
                      : `Write a dedicated page for my "${s.name}" service and link it from the site navigation and services section. Use only facts I've given (service details and price); don't invent anything.`,
                  )
                }
              >
                {has ? "Improve page" : "Write page"}
              </Button>
            </li>
          );
        })}
        {services.data && services.data.length === 0 ? (
          <li className="text-sm text-muted-foreground">Add your services first so your AI team can write their pages.</li>
        ) : null}
      </ul>
      {built ? (
        <Ask canManage={canManage} onSent={onSent} placeholder="Ask for any page change, e.g. add an FAQ page from my answers" />
      ) : null}
    </div>
  );
}

export function AiTeamImages({ canManage, onSent }: { canManage: boolean; onSent: () => void }) {
  const send = (prompt: string) => {
    askAssistant(prompt);
    onSent();
  };
  const quick = [
    ["Review my images", "Review every image on my website and replace or re-place any that look weak, off-brand or badly cropped on phones. Never show made-up work as mine."],
    ["Make a new main image", "Create a new main (top of page) image that fits my business and brand. It must not pretend to be a photo of my real work or staff."],
    ["Fix image descriptions", "Write accurate descriptions for every image on my site for accessibility and search."],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {quick.map(([label, prompt]) => (
          <Button key={label} size="sm" variant="outline" disabled={!canManage} onClick={() => send(prompt)}>
            {label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        To use your own photos, attach them in the chat and your AI team will place them.
      </p>
      <Ask canManage={canManage} onSent={onSent} placeholder="Describe the image change you want" />
    </div>
  );
}
