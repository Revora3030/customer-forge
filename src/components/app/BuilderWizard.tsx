import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, ImageUp, Loader2, Sparkles } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MediaLibrary } from "@/components/app/MediaLibrary";

import { useAutosaveOrganization, useAutosaveProfile } from "@/lib/website-content.hooks";
import {
  useExtractScreenshotReference,
  useGenerateSectionsFromText,
  useSaveScreenshotReference,
} from "@/lib/site-engine.hooks";
import { WIZARD_STEPS, type WizardStepKey } from "@/lib/website-content";
import { WEBSITE_GOALS, type GoalKey } from "@/lib/website-plan";
import { cn } from "@/lib/utils";
import { focusAndScrollToId, useStepScroll } from "@/lib/use-step-scroll";

type ProfileRow = Record<string, unknown> | null | undefined;

type ScreenshotReferenceSummary = {
  applied?: boolean;
  source?: string | null;
  model?: string | null;
  fingerprint?: {
    family?: string;
    heroComposition?: string;
    colorSystem?: string;
    typeSystem?: string;
    density?: string;
  } | null;
  warnings?: string[];
} | null;

type ScreenshotObservations = Partial<Record<
  "layout" | "hierarchy" | "typography" | "spacing" | "color" | "interactions" | "components",
  string[]
>>;

type Props = {
  organizationId: string | undefined;
  org: { id?: string; name?: string | null; industry?: string | null } | null | undefined;
  profile: ProfileRow;
  servicesCount: number;
  pricedCount: number;
  canManage: boolean;
  structureSlot: ReactNode;
  launchSlot: ReactNode;
  screenshotReference?: ScreenshotReferenceSummary;
  screenshotReferenceObservations?: ScreenshotObservations | null;
  /** Set by the page to send the owner straight to a step (and an anchor inside it). */
  jumpTo?: { step: WizardStepKey; anchor?: string; nonce: number } | null;
};

const text = (profile: ProfileRow, key: string) => {
  const value = profile?.[key];
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
};

/**
 * Eight-step guided builder. Every field autosaves as it's edited, so moving
 * between steps — or leaving the page — never loses an answer.
 */
export function BuilderWizard({
  organizationId,
  org,
  profile,
  servicesCount,
  pricedCount,
  canManage,
  structureSlot,
  launchSlot,
  screenshotReference = null,
  screenshotReferenceObservations = null,
  jumpTo = null,
}: Props) {
  const [step, setStep] = useState<WizardStepKey>("business");
  const stepRef = useStepScroll<HTMLElement>(step);
  const saveProfile = useAutosaveProfile(organizationId);
  const saveOrg = useAutosaveOrganization(organizationId);
  const saveReference = useSaveScreenshotReference(organizationId);
  const extractReference = useExtractScreenshotReference(organizationId);
  const generateFromText = useGenerateSectionsFromText(organizationId);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [referenceNotes, setReferenceNotes] = useState("");
  const [referenceFileName, setReferenceFileName] = useState<string | null>(null);
  const busy = saveProfile.isPending || saveOrg.isPending || saveReference.isPending || extractReference.isPending;

  useEffect(() => {
    if (!busy && (saveProfile.isSuccess || saveOrg.isSuccess)) setSavedAt(Date.now());
  }, [busy, saveProfile.isSuccess, saveOrg.isSuccess]);

  // The page can send the owner directly to the step (and the question) that is
  // blocking their build, instead of leaving them to hunt for it.
  useEffect(() => {
    if (!jumpTo) return;
    setStep(jumpTo.step);
    if (!jumpTo.anchor) return;
    const timer = setTimeout(() => focusAndScrollToId(jumpTo.anchor!), 120);
    return () => clearTimeout(timer);
  }, [jumpTo]);

  const goals = Array.isArray(profile?.["website_goals"])
    ? (profile?.["website_goals"] as string[])
    : [];

  const done: Record<WizardStepKey, boolean> = {
    business: !!org?.name && !!text(profile, "description"),
    services: servicesCount > 0,
    brand: !!text(profile, "primary_color") || !!text(profile, "hero_image_url"),
    contact: !!(text(profile, "phone") || text(profile, "email")),
    proof: !!(
      text(profile, "years_in_business") ||
      text(profile, "certifications") ||
      text(profile, "review_link")
    ),
    goals: goals.length > 0,
    structure: true,
    launch: true,
  };

  const completion = Math.round(
    (Object.values(done).filter(Boolean).length / Object.keys(done).length) * 100,
  );

  const index = WIZARD_STEPS.findIndex((s) => s.key === step);
  const current = WIZARD_STEPS[index]!;
  const previous = index > 0 ? WIZARD_STEPS[index - 1] : null;
  const next = index < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[index + 1] : null;

  const field = (key: string, value: string) => saveProfile.mutate({ [key]: value || null });

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">
            Step {index + 1} of {WIZARD_STEPS.length}
          </p>
          <span
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            aria-live="polite"
          >
            {busy ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Saving…
              </>
            ) : savedAt ? (
              <>
                <Check className="size-3 text-primary" /> All changes saved
              </>
            ) : (
              "Changes save automatically"
            )}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated"
            role="presentation"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${completion}%` }}
            />
          </div>
          <span className="tnum text-[11px] text-muted-foreground">{completion}% ready</span>
        </div>
        <ol className="mt-3 flex flex-wrap gap-1.5">
          {WIZARD_STEPS.map((item, i) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setStep(item.key)}
                aria-current={item.key === step ? "step" : undefined}
                className={cn(
                  "cursor-pointer rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
                  item.key === step
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-elevated",
                )}
              >
                <span className="tnum mr-1.5 opacity-60">{i + 1}</span>
                {item.title}
                {done[item.key] && item.key !== step ? (
                  <Check className="ml-1.5 inline size-3 text-primary" aria-label="complete" />
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel ref={stepRef} className="p-5">
        <SectionHeading
          eyebrow={current.help}
          title={current.title}
          action={
            done[step] ? (
              <Pill tone="signal">Complete</Pill>
            ) : (
              <Pill tone="neutral">In progress</Pill>
            )
          }
        />

        <div className="mt-5 space-y-4">
          {step === "business" ? (
            <>
              <AutoField
                label="Business name"
                value={org?.name ?? ""}
                disabled={!canManage}
                onCommit={(value) => saveOrg.mutate({ name: value })}
              />
              <AutoField
                label="What you do (trade or category)"
                placeholder="Mobile car detailing"
                value={org?.industry ?? ""}
                disabled={!canManage}
                onCommit={(value) => saveOrg.mutate({ industry: value || null })}
              />
              <AutoField
                label="Tagline"
                value={text(profile, "tagline")}
                disabled={!canManage}
                onCommit={(value) => field("tagline", value)}
              />
              <AutoField
                label="Describe your business in your own words"
                help="Revora writes your website from this — it never invents claims."
                multiline
                value={text(profile, "description")}
                disabled={!canManage}
                onCommit={(value) => field("description", value)}
                actionLabel="Generate sections from my text"
                actionPending={generateFromText.isPending}
                onAction={async (value) => {
                  await saveProfile.mutateAsync({ description: value.trim() });
                  await generateFromText.mutateAsync();
                }}
              />
            </>
          ) : null}

          {step === "services" ? (
            <div className="space-y-3">
              <p className="text-[13px] text-muted-foreground">
                You have {servicesCount} service{servicesCount === 1 ? "" : "s"} listed
                {servicesCount ? `, ${pricedCount} with a price` : ""}. Services become cards on
                your website and options in your quote calculator.
              </p>
              <Button asChild variant="outline">
                <a href="/app/services">Manage my services</a>
              </Button>
            </div>
          ) : null}

          {step === "brand" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <AutoField
                  label="Main colour"
                  placeholder="#C8A24B"
                  value={text(profile, "primary_color")}
                  disabled={!canManage}
                  onCommit={(value) => field("primary_color", value)}
                />
                <AutoField
                  label="Second colour"
                  value={text(profile, "secondary_color")}
                  disabled={!canManage}
                  onCommit={(value) => field("secondary_color", value)}
                />
                <AutoField
                  label="Style"
                  placeholder="Clean and modern"
                  value={text(profile, "font_preference")}
                  disabled={!canManage}
                  onCommit={(value) => field("font_preference", value)}
                />
              </div>
              <MediaLibrary
                organizationId={organizationId}
                canManage={canManage}
                heroUrl={text(profile, "hero_image_url") || null}
                onSetHero={(value) => saveProfile.mutate({ hero_image_url: value })}
              />
              <DesignReferenceBox
                canManage={canManage}
                notes={referenceNotes}
                fileName={referenceFileName}
                reference={screenshotReference}
                observations={screenshotReferenceObservations}
                isSaving={saveReference.isPending}
                isExtracting={extractReference.isPending}
                onNotesChange={setReferenceNotes}
                onSaveNotes={() => {
                  const observations = observationsFromNotes(referenceNotes);
                  if (Object.values(observations).some((items) => items.length))
                    saveReference.mutate(observations);
                }}
                onFile={(file) => {
                  if (!file) return;
                  setReferenceFileName(file.name);
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string")
                      extractReference.mutate({ screenshotDataUrl: reader.result, notes: referenceNotes });
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </>
          ) : null}

          {step === "contact" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <AutoField
                  label="Phone"
                  value={text(profile, "phone")}
                  disabled={!canManage}
                  onCommit={(value) => field("phone", value)}
                />
                <AutoField
                  label="Email"
                  value={text(profile, "email")}
                  disabled={!canManage}
                  onCommit={(value) => field("email", value)}
                />
                <AutoField
                  label="City"
                  value={text(profile, "city")}
                  disabled={!canManage}
                  onCommit={(value) => field("city", value)}
                />
                <AutoField
                  label="State / region"
                  value={text(profile, "state")}
                  disabled={!canManage}
                  onCommit={(value) => field("state", value)}
                />
                <AutoField
                  label="Areas you serve"
                  help="Used for local search."
                  value={text(profile, "service_area")}
                  disabled={!canManage}
                  onCommit={(value) => field("service_area", value)}
                />
                <AutoField
                  label="Address (optional)"
                  value={text(profile, "address")}
                  disabled={!canManage}
                  onCommit={(value) => field("address", value)}
                />
              </div>
            </>
          ) : null}

          {step === "proof" ? (
            <>
              <p className="text-[13px] text-muted-foreground">
                Only enter things that are true — Revora will never claim awards, licences or
                ratings you haven&apos;t supplied.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <AutoField
                  label="Years in business"
                  value={text(profile, "years_in_business")}
                  disabled={!canManage}
                  onCommit={(value) =>
                    saveProfile.mutate({ years_in_business: value ? Number(value) || null : null })
                  }
                />
                <AutoField
                  label="Review link (Google, Facebook)"
                  value={text(profile, "review_link")}
                  disabled={!canManage}
                  onCommit={(value) => field("review_link", value)}
                />
              </div>
              <AutoField
                label="Certifications or licences"
                multiline
                value={text(profile, "certifications")}
                disabled={!canManage}
                onCommit={(value) => field("certifications", value)}
              />
              <AutoField
                label="Awards or recognition"
                multiline
                value={text(profile, "awards")}
                disabled={!canManage}
                onCommit={(value) => field("awards", value)}
              />
            </>
          ) : null}

          {step === "goals" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {WEBSITE_GOALS.map((goal) => {
                const active = goals.includes(goal.value);
                return (
                  <button
                    key={goal.value}
                    type="button"
                    disabled={!canManage}
                    onClick={() => {
                      const nextGoals = active
                        ? goals.filter((g) => g !== goal.value)
                        : [...goals, goal.value as GoalKey];
                      saveProfile.mutate({ website_goals: nextGoals });
                    }}
                    className={cn(
                      "cursor-pointer rounded-md border p-3.5 text-left transition-colors",
                      active ? "border-primary bg-primary/5" : "border-border hover:bg-elevated",
                    )}
                  >
                    <p className="text-[14px] font-medium">{goal.label}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Main button: {goal.cta}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === "structure" ? structureSlot : null}
          {step === "launch" ? launchSlot : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            variant="outline"
            disabled={!previous}
            onClick={() => previous && setStep(previous.key)}
          >
            <ChevronLeft className="size-4" /> Back
          </Button>
          {next ? (
            <Button variant="signal" onClick={() => setStep(next.key)}>
              Save &amp; continue <ChevronRight className="size-4" />
            </Button>
          ) : (
            <span className="text-[12px] text-muted-foreground">Last step</span>
          )}
        </div>
      </Panel>
    </div>
  );
}

const REFERENCE_KEYS = [
  "layout",
  "hierarchy",
  "typography",
  "spacing",
  "color",
  "interactions",
  "components",
] as const;

function observationsFromNotes(notes: string): Record<(typeof REFERENCE_KEYS)[number], string[]> {
  const out = Object.fromEntries(REFERENCE_KEYS.map((key) => [key, [] as string[]])) as Record<
    (typeof REFERENCE_KEYS)[number],
    string[]
  >;
  const lines = notes
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 24);
  for (const line of lines) {
    const match = line.match(/^(layout|hierarchy|typography|spacing|color|interactions|components)\s*:\s*(.+)$/i);
    const key = (match?.[1]?.toLowerCase() as (typeof REFERENCE_KEYS)[number] | undefined) ?? "layout";
    const value = (match?.[2] ?? line).trim();
    if (value && out[key].length < 8) out[key].push(value.slice(0, 140));
  }
  return out;
}

function DesignReferenceBox({
  canManage,
  notes,
  fileName,
  reference,
  observations,
  isSaving,
  isExtracting,
  onNotesChange,
  onSaveNotes,
  onFile,
}: {
  canManage: boolean;
  notes: string;
  fileName: string | null;
  reference: ScreenshotReferenceSummary;
  observations: ScreenshotObservations | null;
  isSaving: boolean;
  isExtracting: boolean;
  onNotesChange: (value: string) => void;
  onSaveNotes: () => void;
  onFile: (file: File | null) => void;
}) {
  const fingerprint = reference?.fingerprint ?? null;
  const applied = reference?.applied === true;
  const savedSignals = observations
    ? Object.entries(observations).flatMap(([key, values]) =>
        (values ?? []).slice(0, 2).map((value) => `${key}: ${value}`),
      )
    : [];
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Screenshot design reference</p>
          <p className="mt-1 max-w-2xl text-[12px] text-muted-foreground">
            Upload an inspiration screenshot or describe reusable patterns. Revora extracts layout,
            hierarchy, typography, spacing, colour and interaction ideas only — it will not copy logos,
            exact wording, claims, brand assets or colours.
          </p>
        </div>
        <Pill tone={applied ? "signal" : savedSignals.length ? "attention" : "neutral"}>
          {applied ? "Will shape next build" : savedSignals.length ? "Saved" : "Optional"}
        </Pill>
      </div>
      {fingerprint ? (
        <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Family", fingerprint.family],
            ["Hero", fingerprint.heroComposition],
            ["Colour", fingerprint.colorSystem],
            ["Type", fingerprint.typeSystem],
            ["Density", fingerprint.density],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border bg-background/60 p-2">
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
              <span className="font-medium">{value ?? "default"}</span>
            </div>
          ))}
        </div>
      ) : null}
      {savedSignals.length ? (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {savedSignals.slice(0, 6).map((signal) => (
            <li key={signal} className="text-[12px] text-muted-foreground">
              <span className="text-primary">•</span> {signal}
            </li>
          ))}
        </ul>
      ) : null}
      <Textarea
        className="mt-3"
        rows={4}
        value={notes}
        disabled={!canManage}
        onChange={(event) => onNotesChange(event.target.value)}
        placeholder="Example: layout: split hero with bento proof cards&#10;typography: large headline, modern sans&#10;spacing: airy sections&#10;color: dark canvas with warm gold accents"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canManage || isSaving || !notes.trim()}
          onClick={onSaveNotes}
        >
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save pattern notes
        </Button>
        <Label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-elevated">
          {isExtracting ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
          {fileName ? `Reading ${fileName}` : "Upload screenshot"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={!canManage || isExtracting}
            onChange={(event) => onFile(event.currentTarget.files?.[0] ?? null)}
          />
        </Label>
        <span className="text-[11px] text-muted-foreground">Free vision only; no paid fallback.</span>
      </div>
      {reference?.warnings?.length ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Ignored unsafe reference details: {reference.warnings.slice(0, 2).join(" ")}
        </p>
      ) : null}
    </div>
  );
}

/** Debounced autosaving input — the value is written ~800ms after typing stops. */
function AutoField({
  label,
  help,
  value,
  placeholder,
  multiline,
  disabled,
  onCommit,
  actionLabel,
  actionPending = false,
  onAction,
}: {
  label: string;
  help?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
  actionLabel?: string;
  actionPending?: boolean;
  onAction?: (value: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const schedule = (nextValue: string) => {
    setDraft(nextValue);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (nextValue.trim() !== value.trim()) onCommit(nextValue.trim());
    }, 800);
  };

  const commitNow = () => {
    if (timer.current) clearTimeout(timer.current);
    if (draft.trim() !== value.trim()) onCommit(draft.trim());
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          rows={4}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => schedule(event.target.value)}
          onBlur={commitNow}
        />
      ) : (
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => schedule(event.target.value)}
          onBlur={commitNow}
        />
      )}
      {help ? <p className="text-[12px] text-muted-foreground">{help}</p> : null}
      {actionLabel && onAction ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="signal"
            size="sm"
            disabled={disabled || actionPending || draft.trim().length < 20}
            onClick={() => void onAction(draft.trim())}
          >
            {actionPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {actionPending ? "Preparing your website…" : actionLabel}
          </Button>
          <span className="text-[11px] text-muted-foreground" aria-live="polite">
            {actionPending
              ? "Sol plans · Terra reviews · images and copy follow"
              : draft.trim().length < 20
                ? "Add a little more detail to begin."
                : "Uses this saved description across your full website."}
          </span>
        </div>
      ) : null}
    </div>
  );
}
