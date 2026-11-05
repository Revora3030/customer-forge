import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, History, Loader2, Plus, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_PAGE_POINTS,
  MAX_PLAN_PAGES,
  addPage,
  describeChange,
  diffPlans,
  editPage,
  latestVersion,
  movePage,
  removePage,
  samePlan,
  type PagePlan,
  type PlanTarget,
  type PlanVersion,
} from "@/lib/builder/page-plan";
import { usePagePlan, useRestorePagePlan, useRevisePlanPart, useSavePagePlan } from "@/lib/builder/page-plan.hooks";
import { dateShort } from "@/lib/format";

const SOURCE_LABEL: Record<PlanVersion["source"], string> = {
  brief: "From your brief",
  owner: "Your edit",
  ai: "Revised for you",
  restore: "Went back",
};

/** The list of what changed between two plans, in plain words. */
export function PlanChanges({ before, after, testId }: { before: PagePlan; after: PagePlan; testId?: string }) {
  const changes = useMemo(() => diffPlans(before, after), [before, after]);
  if (!changes.length) return <p className="text-[12px] text-muted-foreground">No differences.</p>;
  return (
    <ul className="space-y-1 text-[12px]" data-testid={testId}>
      {changes.map((c, i) => (
        <li key={`${c.kind}-${c.slug}-${i}`} className="flex gap-1.5">
          <span aria-hidden="true" className="text-primary">•</span>
          <span>{describeChange(c)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * CG-13: the page plan the owner reads and edits BEFORE the build. They can edit
 * it directly, highlight one page or one point and ask for a change (only that
 * part changes), see what changed since the last version, and go back to any
 * earlier version. Nothing here starts a build.
 */
export function PagePlanPanel({
  organizationId,
  hasBrief,
  canManage,
}: {
  organizationId: string | undefined;
  hasBrief: boolean;
  canManage: boolean;
}) {
  const query = usePagePlan(organizationId, hasBrief);
  const save = useSavePagePlan(organizationId);
  const revise = useRevisePlanPart(organizationId);
  const restore = useRestorePagePlan(organizationId);
  const state = query.data;
  const [draft, setDraft] = useState<PagePlan | null>(null);
  const [asking, setAsking] = useState<PlanTarget | null>(null);
  const [request, setRequest] = useState("");
  const [comparing, setComparing] = useState<number | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => setDraft(state?.plan ?? null), [state?.plan]);

  if (!hasBrief || !state || !draft) return null;

  const latest = latestVersion(state.history);
  const dirty = state.draft || !state.plan || !samePlan(draft, state.plan);
  const busy = save.isPending || revise.isPending || restore.isPending;
  const locked = state.locked;
  const editable = canManage && !locked;
  const versions = state.history.versions;
  const previous = latest ? versions[versions.length - 2] : undefined;
  const compareTo = comparing !== null ? versions.find((v) => v.version === comparing) : undefined;

  const isAsking = (slug: string, pointIndex?: number) =>
    asking?.slug === slug && asking.pointIndex === pointIndex;
  const startAsking = (target: PlanTarget) => {
    setAsking(target);
    setRequest("");
  };
  const send = () => {
    if (!asking || !request.trim()) return;
    revise.mutate(
      { slug: asking.slug, ...(asking.pointIndex === undefined ? {} : { pointIndex: asking.pointIndex }), request },
      {
        onSuccess: () => {
          setAsking(null);
          setRequest("");
        },
      },
    );
  };

  const askBox = (slug: string, pointIndex?: number) =>
    isAsking(slug, pointIndex) ? (
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2" data-testid="plan-ask">
        <Input
          aria-label="What should change in this part?"
          placeholder="What should change here?"
          value={request}
          maxLength={500}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          className="min-w-[200px] flex-1"
          autoFocus
        />
        <Button size="sm" variant="signal" disabled={busy || !request.trim()} onClick={send} data-testid="plan-ask-send">
          {revise.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Change it
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
          Cancel
        </Button>
      </div>
    ) : null;

  return (
    <Panel id="page-plan" className="scroll-mt-24 p-5" data-testid="page-plan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeading
            eyebrow="Before the build"
            title={state.approved ? "You approved this page plan" : "Your page plan"}
          />
          <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
            {state.draft
              ? "These are the pages Revora would build, taken from your brief. Change anything, or highlight one part and ask for a change. Only that part changes."
              : "Edit it, or highlight one part and ask for a change. Only that part changes. Your approved plan is what the build follows."}
          </p>
        </div>
        <Pill tone={state.approved ? "signal" : "attention"}>
          {state.approved ? `Approved · version ${state.history.approvedVersion}` : dirty ? "Not saved" : "Not approved yet"}
        </Pill>
      </div>

      {locked ? (
        <p className="mt-3 text-[12px] text-muted-foreground">Your website is being built right now. You can change the plan once it finishes.</p>
      ) : null}

      <ol className="mt-4 space-y-3">
        {draft.pages.map((page, pageIndex) => (
          <li key={page.slug} className="rounded-md border border-border p-3" data-testid={`plan-page-${page.slug}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-5 text-[12px] text-muted-foreground">{pageIndex + 1}</span>
              <Input
                aria-label={`Page ${pageIndex + 1} title`}
                value={page.title}
                disabled={!editable}
                maxLength={60}
                onChange={(e) => setDraft(editPage(draft, page.slug, { title: e.target.value }))}
                className="min-w-[160px] flex-1 font-medium"
              />
              {editable ? (
                <>
                  <Button size="icon" variant="ghost" aria-label={`Move ${page.title} up`} disabled={pageIndex <= 1} onClick={() => setDraft(movePage(draft, page.slug, -1))}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Move ${page.title} down`} disabled={page.slug === "home" || pageIndex === draft.pages.length - 1} onClick={() => setDraft(movePage(draft, page.slug, 1))}>
                    <ArrowDown className="size-4" />
                  </Button>
                  {page.slug !== "home" ? (
                    <Button size="icon" variant="ghost" aria-label={`Remove ${page.title}`} onClick={() => setDraft(removePage(draft, page.slug))}>
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={dirty || busy}
                    title={dirty ? "Save your edits first, then ask for a change." : undefined}
                    onClick={() => startAsking({ slug: page.slug })}
                    data-testid={`plan-ask-page-${page.slug}`}
                  >
                    <Sparkles className="size-4" /> Ask for a change
                  </Button>
                </>
              ) : null}
            </div>
            {askBox(page.slug)}
            <Textarea
              aria-label={`What ${page.title} is for`}
              placeholder="What is this page for?"
              rows={2}
              value={page.purpose}
              disabled={!editable}
              maxLength={240}
              onChange={(e) => setDraft(editPage(draft, page.slug, { purpose: e.target.value }))}
              className="mt-2"
            />
            <ul className="mt-2 space-y-1.5">
              {page.points.map((point, i) => (
                <li key={i}>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`${page.title} point ${i + 1}`}
                      value={point}
                      disabled={!editable}
                      maxLength={160}
                      onChange={(e) => setDraft(editPage(draft, page.slug, { points: page.points.map((p, j) => (j === i ? e.target.value : p)) }))}
                    />
                    {editable ? (
                      <>
                        <Button size="icon" variant="ghost" aria-label={`Ask for a change to point ${i + 1} on ${page.title}`} disabled={dirty || busy} onClick={() => startAsking({ slug: page.slug, pointIndex: i })}>
                          <Sparkles className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={`Remove point ${i + 1} on ${page.title}`} onClick={() => setDraft(editPage(draft, page.slug, { points: page.points.filter((_, j) => j !== i) }))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                  {askBox(page.slug, i)}
                </li>
              ))}
            </ul>
            {editable && page.points.length < MAX_PAGE_POINTS ? (
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => setDraft(editPage(draft, page.slug, { points: [...page.points, "New point"] }))}>
                <Plus className="size-4" /> Add a point
              </Button>
            ) : null}
          </li>
        ))}
      </ol>

      {editable && draft.pages.length < MAX_PLAN_PAGES ? (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => setDraft(addPage(draft, "New page"))}>
          <Plus className="size-4" /> Add a page
        </Button>
      ) : null}

      {state.plan && dirty && !state.draft ? (
        <div className="mt-4 rounded-md bg-elevated p-3">
          <p className="mb-1 text-[12px] font-medium">What you've changed since the last saved version</p>
          <PlanChanges before={state.plan} after={draft} testId="plan-unsaved-changes" />
        </div>
      ) : null}

      {latest && previous ? (
        <div className="mt-4 rounded-md bg-elevated p-3">
          <p className="mb-1 text-[12px] font-medium">What changed since version {previous.version}</p>
          <PlanChanges before={previous.plan} after={latest.plan} testId="plan-last-changes" />
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={busy || !dirty || locked} onClick={() => save.mutate({ plan: draft, approve: false })} data-testid="plan-save">
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Save plan
          </Button>
          <Button variant="signal" disabled={busy || locked || (!dirty && state.approved)} onClick={() => save.mutate({ plan: draft, approve: true })} data-testid="plan-approve">
            <Check className="size-4" /> Approve this plan
          </Button>
          {versions.length ? (
            <Button variant="ghost" onClick={() => setShowVersions((v) => !v)} data-testid="plan-versions-toggle">
              <History className="size-4" /> {versions.length} saved version{versions.length === 1 ? "" : "s"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {showVersions ? (
        <ul className="mt-3 space-y-2" data-testid="plan-versions">
          {[...versions].reverse().map((v) => (
            <li key={v.version} className="rounded-md border border-border p-2">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="font-medium">Version {v.version}</span>
                <span className="text-muted-foreground">
                  {SOURCE_LABEL[v.source]}
                  {v.createdAt ? ` · ${dateShort(v.createdAt)}` : ""}
                </span>
                {v.version === state.history.approvedVersion ? <Pill tone="signal">Approved</Pill> : null}
                {v.note ? <span className="text-muted-foreground">— {v.note}</span> : null}
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setComparing(comparing === v.version ? null : v.version)}>
                    {comparing === v.version ? "Hide" : "Compare with current"}
                  </Button>
                  {canManage && v.version !== latest?.version ? (
                    <Button size="sm" variant="outline" disabled={busy || locked} onClick={() => restore.mutate(v.version)}>
                      <Undo2 className="size-4" /> Go back to this
                    </Button>
                  ) : null}
                </span>
              </div>
              {compareTo && compareTo.version === v.version && latest ? (
                <div className="mt-2">
                  <PlanChanges before={compareTo.plan} after={latest.plan} testId="plan-compare" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
