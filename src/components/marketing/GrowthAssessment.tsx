/**
 * Free Growth Assessment / Website Audit funnel.
 *
 * A short, high-intent form that scores the visitor's current setup, shows the
 * revenue estimated to be leaking out of it, emails the report (lead capture +
 * nurture) and hands off to the free-access signup.
 *
 * All math is arithmetic on the visitor's own inputs — no Revora performance
 * promise anywhere.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Loader2, Mail, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, Pill } from "@/components/app/Bits";
import { FreeAccessButton } from "@/components/marketing/FreeAccess";
import { currency } from "@/lib/format";
import { INDUSTRIES } from "@/lib/domain";
import { trackConversion } from "@/lib/conversion";
import {
  CAPABILITY_QUESTIONS,
  DEFAULT_ANSWERS,
  scoreAssessment,
  type AssessmentAnswers,
} from "@/lib/assessment";
import { submitAssessment } from "@/lib/assessment.functions";

const SPEEDS: { value: AssessmentAnswers["replySpeed"]; label: string }[] = [
  { value: "minutes", label: "Within minutes" },
  { value: "hours", label: "A few hours" },
  { value: "same_day", label: "Same day" },
  { value: "days", label: "A day or more" },
];

const NUMBERS: {
  key: "leadsPerMonth" | "averageJobValue" | "closeRate";
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    key: "leadsPerMonth",
    label: "Leads per month",
    hint: "Calls, forms, DMs, referrals",
    min: 0,
    max: 500,
    step: 5,
  },
  {
    key: "averageJobValue",
    label: "Average job value ($)",
    hint: "What one customer is typically worth",
    min: 25,
    max: 20000,
    step: 25,
  },
  {
    key: "closeRate",
    label: "Booking rate (%)",
    hint: "Share of leads that become paying jobs",
    min: 1,
    max: 100,
    step: 1,
  },
];

export function GrowthAssessment({ mode = "assessment" }: { mode?: "assessment" | "audit" }) {
  const [answers, setAnswers] = useState<AssessmentAnswers>(DEFAULT_ANSWERS);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [emailed, setEmailed] = useState(false);

  const result = useMemo(() => scoreAssessment(answers), [answers]);
  const set = <K extends keyof AssessmentAnswers>(key: K, value: AssessmentAnswers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const response = await submitAssessment({
        data: {
          answers,
          source: mode === "audit" ? "website_audit" : "growth_assessment",
          websiteUrl: websiteUrl || null,
          landingPath: typeof window === "undefined" ? null : window.location.pathname,
        },
      });
      setEmailed(response.emailed);
      setStatus("done");
      trackConversion(mode === "audit" ? "audit_requested" : "assessment_submitted", {
        email: answers.email,
        metadata: { score: result.score, band: result.band, gaps: result.gaps.length },
      });
      document
        .getElementById("assessment-result")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
      );
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-8">
      <Panel className="min-w-0 p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-6">
          <div>
            <p className="eyebrow">Step 1 — your business</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ga-business">Business name</Label>
                <Input
                  id="ga-business"
                  name="business"
                  autoComplete="organization"
                  value={answers.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                  placeholder="Northside Plumbing"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="ga-industry">Industry</Label>
                <select
                  id="ga-industry"
                  name="industry"
                  value={answers.industry}
                  onChange={(e) => set("industry", e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                >
                  <option value="">Select your trade</option>
                  {INDUSTRIES.map((industry) => (
                    <option key={industry.name} value={industry.name}>
                      {industry.name}
                    </option>
                  ))}
                  <option value="Other local service">Other local service</option>
                </select>
              </div>
              {mode === "audit" ? (
                <div className="sm:col-span-2">
                  <Label htmlFor="ga-url">Current website (optional)</Label>
                  <Input
                    id="ga-url"
                    name="website"
                    inputMode="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="yourbusiness.com"
                    className="mt-1.5"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <p className="eyebrow">Step 2 — your numbers</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              {NUMBERS.map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`ga-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`ga-${field.key}`}
                    type="number"
                    inputMode="numeric"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={answers[field.key]}
                    onChange={(e) => set(field.key, Number(e.target.value) as never)}
                    className="tnum mt-1.5"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{field.hint}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="eyebrow">Step 3 — how fast do new leads get a reply?</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SPEEDS.map((speed) => {
                const selected = answers.replySpeed === speed.value;
                return (
                  <button
                    key={speed.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => set("replySpeed", speed.value)}
                    className={`min-h-11 cursor-pointer rounded-lg border px-3 py-2 text-[12.5px] transition-colors ${
                      selected
                        ? "gold-glow border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-background/40 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {speed.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="eyebrow">Step 4 — what do you already have running?</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {CAPABILITY_QUESTIONS.map(({ key, label }) => {
                const selected = answers[key] === true;
                return (
                  <button
                    key={String(key)}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => set(key, !selected as never)}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors ${
                      selected
                        ? "gold-glow border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-background/40 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <CheckCircle2
                      className={`size-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground/50"}`}
                      aria-hidden="true"
                    />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="eyebrow block" htmlFor="ga-email">
              Step 5 — where should we send the report?
            </label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                id="ga-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                aria-label="Your email address"
                value={answers.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@yourbusiness.com"
              />

              <Button
                type="submit"
                variant="signal"
                disabled={status === "sending"}
                className="h-auto shrink-0 py-2.5 leading-snug whitespace-normal"
              >
                {status === "sending" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Mail className="size-4" aria-hidden="true" />
                )}
                {mode === "audit" ? "Send my audit" : "Send my score"}
              </Button>
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              One report email, plus occasional Revora growth tips. Unsubscribe anytime. No card
              required, nothing to install.
            </p>
            {status === "error" ? (
              <p className="mt-2 text-[13px] text-destructive">{message}</p>
            ) : null}
            {status === "done" ? (
              <p className="mt-2 text-[13px] text-primary">
                {emailed
                  ? "Sent — check your inbox for the full report."
                  : "Saved. Your results are below."}
              </p>
            ) : null}
          </div>
        </form>
      </Panel>

      <div id="assessment-result" className="min-w-0 scroll-mt-24 space-y-4">
        <Panel className="gold-glow border-primary/35 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Your Revora Growth Score</p>
              <p className="tnum gold-text font-display text-[44px] leading-none font-semibold">
                {result.score}
                <span className="text-[16px] text-muted-foreground">/100</span>
              </p>
            </div>
            <Pill tone="signal">{result.band}</Pill>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${result.score}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">
            {result.headline}
          </p>
        </Panel>

        <Panel className="p-5 sm:p-6">
          <p className="eyebrow flex items-center gap-2">
            <TrendingDown className="size-3.5 text-primary" aria-hidden="true" /> Estimated lost
            revenue
          </p>
          <p className="tnum mt-3 font-display text-[30px] leading-none font-semibold">
            {currency(result.missedRevenueMonthly)}
            <span className="text-[14px] font-normal text-muted-foreground">/month</span>
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            About {currency(result.missedRevenueYearly)} a year — roughly{" "}
            <span className="text-foreground">{result.recoverableCustomers} customers/month</span>{" "}
            at your own job value and booking rate, based on the {result.leakagePercent}% of leads
            the gaps below tend to absorb.
          </p>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Arithmetic on the numbers you entered. An estimate for planning — not a guarantee of
            revenue.
          </p>
        </Panel>

        <Panel className="p-5 sm:p-6">
          <p className="eyebrow">
            {result.gaps.length > 0
              ? `${result.gaps.length} gap${result.gaps.length === 1 ? "" : "s"} costing you customers`
              : "No major gaps found"}
          </p>
          <ul className="mt-3 space-y-3">
            {result.gaps.slice(0, 6).map((gap) => (
              <li key={gap.key} className="border-b border-border/70 pb-3 last:border-0 last:pb-0">
                <p className="text-[13px] font-medium">{gap.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  {gap.cost}
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed">
                  <span className="gold-hl">Revora fixes it:</span> {gap.fix}
                </p>
              </li>
            ))}
            {result.gaps.length === 0 ? (
              <li className="text-[13px] text-muted-foreground">
                Your fundamentals are covered — Revora would consolidate them into one system and
                automate the follow-up so nothing depends on memory.
              </li>
            ) : null}
          </ul>
          {result.strengths.length > 0 ? (
            <p className="mt-4 text-[13px] text-muted-foreground">
              <span className="text-foreground">Already strong:</span>{" "}
              {result.strengths.slice(0, 4).join(" · ")}
            </p>
          ) : null}
        </Panel>

        <Panel className="p-5 sm:p-6">
          <p className="font-display text-[15px] font-semibold">
            Want Revora to close these gaps for you?
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Start with 3 free days of full access — build your site, capture leads and see the
            system running before you pay anything.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <FreeAccessButton size="default" />
            <Button asChild variant="outline">
              <Link to="/pricing">
                See pricing <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
