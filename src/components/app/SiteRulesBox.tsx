/**
 * "Rules for my site" — the owner's own standing rules for the AI (words never
 * to use, tone, service area). Always applied; editable and deletable.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SITE_RULES_LIMIT, checkSiteRules } from "@/lib/builder/site-rules";
import { deleteSiteRulesFn, getSiteRules, saveSiteRulesFn } from "@/lib/site-rules.functions";

export function SiteRulesBox({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const load = useServerFn(getSiteRules);
  const save = useServerFn(saveSiteRulesFn);
  const remove = useServerFn(deleteSiteRulesFn);
  const queryClient = useQueryClient();
  const key = ["site-rules", organizationId];

  const stored = useQuery({
    queryKey: key,
    enabled: Boolean(organizationId),
    queryFn: () => load({ data: { organizationId: organizationId as string } }),
  });
  const saved = stored.data?.rules ?? "";
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(saved), [saved]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { organizationId: organizationId as string, rules: draft } }),
    onSuccess: () => {
      toast.success("Saved — Revora will follow these on every change.");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Your rules couldn't be saved."),
  });
  const deleteMutation = useMutation({
    mutationFn: () => remove({ data: { organizationId: organizationId as string } }),
    onSuccess: () => {
      toast.success("Rules deleted.");
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.error("Your rules couldn't be deleted. Try again."),
  });

  const problem = draft.trim() ? checkSiteRules(draft) : null;
  const tooLong = problem && !problem.ok ? problem.message : null;
  const dirty = draft.trim() !== saved.trim();

  return (
    <section className="panel space-y-3 p-5" aria-labelledby="site-rules-title">
      <div>
        <h3 id="site-rules-title" className="text-sm font-semibold">
          Rules for my site
        </h3>
        <p className="text-muted-foreground text-xs">
          Write your own rules — words never to use, your tone, where you work. Revora follows them
          on every change until you edit or delete them.
        </p>
      </div>
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={!canManage || stored.isLoading}
        rows={5}
        aria-label="Rules for my site"
        placeholder="e.g. Never say “cheap”. Friendly, plain tone. We only serve Tampa Bay."
      />
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}
          role={tooLong ? "alert" : undefined}
        >
          {tooLong ??
            `${draft.length.toLocaleString("en-US")} / ${SITE_RULES_LIMIT.toLocaleString("en-US")}`}
        </span>
        {canManage ? (
          <div className="flex gap-2">
            {saved ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                Delete
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={!dirty || !draft.trim() || Boolean(tooLong) || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save rules
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
