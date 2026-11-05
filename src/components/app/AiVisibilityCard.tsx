/**
 * COMP-12 (free part): "Do AI assistants mention you?" Five prompts built from
 * the business's trade and place, to paste into any AI assistant, and a monthly
 * log the owner fills in. Counts are only what the owner recorded; no AI is
 * queried and no ranking is claimed.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { buildPromptPack, monthKey, monthlyTrend, type VisibilityRow } from "@/lib/ai-visibility";
import { useBusinessProfile } from "@/lib/queries";

// The table is newer than the generated Supabase types.
const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function AiVisibilityCard({ organizationId, industry }: { organizationId: string | undefined; industry: string | null | undefined }) {
  const { data: profile } = useBusinessProfile(organizationId);
  const qc = useQueryClient();
  const [copied, setCopied] = useState<number | null>(null);
  const month = monthKey(new Date());
  const pack = buildPromptPack({
    industry,
    city: profile?.city ?? null,
    state: profile?.state ?? null,
    serviceArea: (profile as { service_area?: string | null } | null | undefined)?.service_area ?? null,
  });

  const key = ["ai_visibility_checks", organizationId];
  const rows = useQuery({
    queryKey: key,
    enabled: !!organizationId,
    queryFn: async (): Promise<VisibilityRow[]> => {
      const { data, error } = await db
        .from("ai_visibility_checks")
        .select("month, prompt_index, mentioned")
        .eq("organization_id", organizationId!)
        .order("month", { ascending: true })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as VisibilityRow[];
    },
  });

  const record = useMutation({
    mutationFn: async (input: { index: number; prompt: string; mentioned: boolean }) => {
      const { error } = await db.from("ai_visibility_checks").upsert(
        { organization_id: organizationId, month, prompt_index: input.index, prompt: input.prompt, mentioned: input.mentioned },
        { onConflict: "organization_id,month,prompt_index" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const thisMonth = new Map((rows.data ?? []).filter((r) => r.month === month).map((r) => [r.prompt_index, r.mentioned]));
  const trend = monthlyTrend(rows.data ?? []).slice(-6);

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="ai-visibility-heading">
      <p className="eyebrow">SEO & AI search</p>
      <h2 id="ai-visibility-heading" className="mt-1 text-[15px] font-medium">Do AI assistants mention you?</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Paste each question into any AI assistant (free) and mark whether your business came up. Check once a month. Answers vary between assistants and over time, so treat this as a rough trend you record yourself.
      </p>

      {!pack ? (
        <p className="mt-3 text-[13px]">
          Add your city or service area in{" "}
          <Link to="/app/settings" className="underline">Settings</Link> to get your questions.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {pack.map((prompt, index) => {
            const answer = thisMonth.get(index);
            return (
              <li key={index} className="rounded-lg border border-border/60 p-3">
                <p className="text-[13px]">{prompt}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard?.writeText(prompt).then(() => setCopied(index), () => undefined);
                    }}
                  >
                    {copied === index ? "Copied" : "Copy"}
                  </Button>
                  <Button size="sm" variant={answer === true ? "default" : "outline"} aria-pressed={answer === true} disabled={record.isPending} onClick={() => record.mutate({ index, prompt, mentioned: true })}>
                    Mentioned
                  </Button>
                  <Button size="sm" variant={answer === false ? "default" : "outline"} aria-pressed={answer === false} disabled={record.isPending} onClick={() => record.mutate({ index, prompt, mentioned: false })}>
                    Not mentioned
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {record.isError ? <p className="mt-2 text-[12px] text-destructive" role="alert">Could not save. Try again.</p> : null}

      {trend.length ? (
        <div className="mt-4" aria-label="Times mentioned per month">
          <p className="text-[12px] text-muted-foreground">Times mentioned, by month (what you recorded)</p>
          <ul className="mt-2 flex items-end gap-3">
            {trend.map((m) => (
              <li key={m.month} className="flex flex-col items-center gap-1 text-[11px]">
                <span>{m.mentioned}/{m.checked}</span>
                <span className="w-6 rounded-sm bg-primary" style={{ height: `${Math.max(4, (m.mentioned / Math.max(1, m.checked)) * 48)}px` }} aria-hidden />
                <span className="text-muted-foreground">{m.month.slice(0, 7)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
