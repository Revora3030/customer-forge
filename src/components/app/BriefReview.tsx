import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CircleDashed,
  Loader2,
  Pencil,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BusinessBriefPanel } from "@/components/app/BuildBrief";
import type { SiteBrief } from "@/lib/site-brief";
import type { FactGap } from "@/lib/launch-qa";
import {
  useAnalyzeBrief,
  useSaveBrief,
  useSaveMissingFacts,
  useSiteEngineCheck,
} from "@/lib/site-engine.hooks";
import { dateShort } from "@/lib/format";

/* ----------------------------- brief review ----------------------------- */

const LIST_FIELDS: {
  key: "objections" | "trustNeeds" | "qualifyingFields";
  label: string;
  help: string;
}[] = [
  {
    key: "objections",
    label: "Questions to answer",
    help: "One per line — what makes people hesitate.",
  },
  { key: "trustNeeds", label: "What the site must prove", help: "One per line." },
  {
    key: "qualifyingFields",
    label: "Lead form fields",
    help: "One per line — what you need to know to quote.",
  },
];

/**
 * The owner reads, corrects and approves Revora's understanding of the business
 * before any copy, design or pages are generated. Nothing is built from an
 * unapproved brief.
 */
export function BriefReviewPanel({
  organizationId,
  brief,
  canManage,
}: {
  organizationId: string | undefined;
  brief: SiteBrief | null;
  canManage: boolean;
}) {
  const analyze = useAnalyzeBrief(organizationId);
  const save = useSaveBrief(organizationId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SiteBrief | null>(brief);

  useEffect(() => setDraft(brief), [brief]);

  if (!brief)
    return (
      <Panel id="business-brief" className="scroll-mt-24 p-5">
        <SectionHeading eyebrow="Step one" title="Let Revora read your business first" />
        <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
          Before anything is written, Revora works out what you do, who buys from you and how they
          decide. You read it, correct anything that's wrong, and approve it — then the build uses
          exactly that.
        </p>
        {canManage ? (
          <Button
            className="mt-4"
            variant="signal"
            disabled={analyze.isPending}
            onClick={() => analyze.mutate()}
          >
            {analyze.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Analyse my business
          </Button>
        ) : null}
      </Panel>
    );

  const set = (patch: Partial<SiteBrief>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const lines = (value: string) =>
    value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  return (
    <div className="space-y-4">
      <Panel id="business-brief" className="scroll-mt-24 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionHeading
              eyebrow="Review before building"
              title={brief.approved ? "You approved this brief" : "Check this before Revora builds"}
            />
            <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
              {brief.approved
                ? "Your build reads this brief exactly as written below. Edit it and approve again to change direction."
                : "Read it, fix anything that isn't right, then approve. Generation stays locked until you do."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={brief.approved ? "signal" : "attention"}>
              {brief.approved ? "Approved" : "Needs your approval"}
            </Pill>
            {canManage ? (
              <>
                <Button variant="outline" onClick={() => setEditing((v) => !v)}>
                  {editing ? <X className="size-4" /> : <Pencil className="size-4" />}
                  {editing ? "Stop editing" : "Edit"}
                </Button>
                <Button
                  variant="outline"
                  disabled={analyze.isPending}
                  onClick={() => analyze.mutate()}
                >
                  {analyze.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Re-analyse
                </Button>
                {!brief.approved ? (
                  <Button
                    variant="signal"
                    disabled={save.isPending || !draft}
                    onClick={() => draft && save.mutate({ brief: draft, approved: true })}
                  >
                    <Check className="size-4" /> Approve and unlock build
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {editing && draft ? (
          <div className="mt-5 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="brief-positioning">What your business does</Label>
              <Textarea
                id="brief-positioning"
                rows={3}
                value={draft.positioning}
                onChange={(e) => set({ positioning: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="brief-buyer">Who the website talks to</Label>
                <Input
                  id="brief-buyer"
                  value={draft.buyer}
                  onChange={(e) => set({ buyer: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="brief-goal">What they want done</Label>
                <Input
                  id="brief-goal"
                  value={draft.buyerGoal}
                  onChange={(e) => set({ buyerGoal: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="brief-primary">Main action</Label>
                <Input
                  id="brief-primary"
                  value={draft.primaryAction}
                  onChange={(e) => set({ primaryAction: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="brief-secondary">Backup action</Label>
                <Input
                  id="brief-secondary"
                  value={draft.secondaryAction}
                  onChange={(e) => set({ secondaryAction: e.target.value })}
                />
              </div>
            </div>
            {LIST_FIELDS.map((field) => (
              <div key={field.key} className="grid gap-1.5">
                <Label htmlFor={`brief-${field.key}`}>{field.label}</Label>
                <Textarea
                  id={`brief-${field.key}`}
                  rows={4}
                  value={draft[field.key].join("\n")}
                  onChange={(e) =>
                    set({ [field.key]: lines(e.target.value) } as Partial<SiteBrief>)
                  }
                />
                <p className="text-xs text-muted-foreground">{field.help}</p>
              </div>
            ))}
            <div className="grid gap-1.5">
              <Label htmlFor="brief-tone">How the copy should sound</Label>
              <Input
                id="brief-tone"
                value={draft.toneNotes}
                onChange={(e) => set({ toneNotes: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() => save.mutate({ brief: draft, approved: false })}
              >
                Save without approving
              </Button>
              <Button
                variant="signal"
                disabled={save.isPending}
                onClick={() => {
                  save.mutate({ brief: draft, approved: true });
                  setEditing(false);
                }}
              >
                {save.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Save and approve
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>

      {!editing ? <BusinessBriefPanel brief={brief} /> : null}
    </div>
  );
}

/* ----------------------------- missing facts ----------------------------- */

/**
 * Asks for only the blanks Revora identified. Required blanks block the build,
 * because without them the website cannot honestly describe the business.
 */
export function MissingFactsPanel({
  organizationId,
  gaps,
  canManage,
}: {
  organizationId: string | undefined;
  gaps: FactGap[];
  canManage: boolean;
}) {
  const save = useSaveMissingFacts(organizationId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const required = gaps.filter((g) => g.required);
  const optional = gaps.filter((g) => !g.required);

  if (!gaps.length)
    return (
      <Panel id="required-answers" className="scroll-mt-24 p-5">
        <SectionHeading eyebrow="Your information" title="Nothing missing" />
        <p className="mt-2 text-[13px] text-muted-foreground">
          Revora has everything it needs from you. Anything else you add makes the site stronger,
          not possible.
        </p>
      </Panel>
    );

  const answerable = gaps.filter((g) => g.field);
  const advice = gaps.filter((g) => !g.field);

  return (
    <Panel id="required-answers" className="scroll-mt-24 p-5">
      <SectionHeading
        eyebrow="Only the blanks"
        title={
          required.length
            ? `${required.length} answer${required.length === 1 ? "" : "s"} needed to build`
            : "Optional detail Revora asked for"
        }
      />
      <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
        These are the only things Revora couldn't find in what you've already entered. Nothing here
        is guessed on your behalf. Answer the ones marked required and the build unlocks straight
        away — each answer is reused across your pages, buttons, forms and search settings.
      </p>

      {answerable.length ? (
        <div className="mt-5 grid gap-4">
          {answerable.map((gap) => (
            <div key={gap.key} className="grid gap-1.5">
              <Label htmlFor={`fact-${gap.key}`}>
                {gap.label} {gap.required ? <span className="text-accent">· required</span> : null}
              </Label>
              {gap.multiline ? (
                <Textarea
                  id={`fact-${gap.key}`}
                  rows={3}
                  value={answers[gap.key] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [gap.key]: e.target.value }))}
                />
              ) : (
                <Input
                  id={`fact-${gap.key}`}
                  value={answers[gap.key] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [gap.key]: e.target.value }))}
                />
              )}
              <p className="text-xs text-muted-foreground">{gap.prompt}</p>
            </div>
          ))}
          {canManage ? (
            <Button
              className="justify-self-start"
              variant="signal"
              disabled={save.isPending || !Object.values(answers).some((v) => v.trim())}
              onClick={() => save.mutate(answers)}
            >
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Save my answers
            </Button>
          ) : null}
        </div>
      ) : null}

      {advice.length ? (
        <ul className="mt-5 grid gap-2">
          {advice.map((gap) => (
            <li key={gap.key} className="flex gap-2 text-[12px] text-muted-foreground">
              {gap.required ? (
                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
              ) : (
                <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>
                <span className="text-foreground">{gap.label}</span> — {gap.prompt}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {optional.length && !required.length ? (
        <p className="mt-4 text-xs text-muted-foreground">None of these block your build.</p>
      ) : null}
    </Panel>
  );
}

/* ------------------------------- self-test ------------------------------- */

/** Runs the real pipeline checks from the signed-in session and reports facts. */
export function EngineSelfTestPanel({ organizationId }: { organizationId: string | undefined }) {
  const check = useSiteEngineCheck(organizationId);
  const result = check.data;

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeading eyebrow="System check" title="Test the whole pipeline for real" />
          <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
            Runs a live AI analysis call on your own business, checks your lead-capture and booking
            flow, and loads your public preview. Results below are what actually happened — nothing
            is simulated.
          </p>
        </div>
        <Button variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Stethoscope className="size-4" />
          )}
          Run system check
        </Button>
      </div>

      {result ? (
        <>
          <ul className="mt-5 grid gap-2.5">
            {result.steps.map((step) => (
              <li key={step.key} className="flex gap-2.5">
                {step.ok ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px]">{step.label}</p>
                  <p className="mt-0.5 break-words text-[12px] text-muted-foreground">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Checked {dateShort(result.ranAt)} —{" "}
            {result.passed ? "everything passed" : "see the failures above"}.
          </p>
        </>
      ) : null}
    </Panel>
  );
}
