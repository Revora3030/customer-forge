import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  Check,
  Compass,
  Gauge,
  Palette,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { LOVABLE_CONVERSATION_MODELS } from "@/lib/ai/lovable-models";

type Persona = "sol" | "terra" | "luna" | "bench";
type Filter = "all" | Persona;
type ModelCard = {
  id: string;
  family: "OpenAI" | "Anthropic" | "Google Gemini";
  persona: Persona;
  role: string;
  taskProfile: string;
  summary: string;
  tasks: string[];
};

const CONFIGURED_MODEL_CARDS: ModelCard[] = [
  {
    id: "openai/gpt-6.1-sol",
    family: "OpenAI",
    persona: "sol",
    role: "Creative Director & Visual Authority",
    taskProfile: "Creative reasoning",
    summary: "Design direction, layout architecture and brand expression.",
    tasks: [
      "Page architecture and visual hierarchy",
      "Typography, spacing and design-language synthesis",
      "Brand-led composition choices",
    ],
  },
  {
    id: "openai/gpt-6-sol",
    family: "OpenAI",
    persona: "sol",
    role: "Creative Systems Specialist",
    taskProfile: "Design and composition",
    summary: "A second creative option within the configured conversation roster.",
    tasks: [
      "Section rhythm and content balance",
      "Consistent component and spacing decisions",
      "Bespoke visual direction from supplied business facts",
    ],
  },
  {
    id: "openai/gpt-5.6-terra",
    family: "OpenAI",
    persona: "terra",
    role: "Structural QA & Reviewer",
    taskProfile: "Structural review",
    summary: "A review-oriented model for layout integrity and implementation quality.",
    tasks: [
      "Responsive wrapping and overflow review",
      "Contrast, focus and keyboard-accessibility checks",
      "Markup hierarchy and layout consistency",
    ],
  },
  {
    id: "anthropic/claude-opus-5-5",
    family: "Anthropic",
    persona: "terra",
    role: "Deep Review Specialist",
    taskProfile: "Adversarial review",
    summary: "A second perspective for complex structure and cross-checking.",
    tasks: [
      "Second-pass critique of component decisions",
      "Review of edge cases and failure paths",
      "Accessibility and usability issues to investigate",
    ],
  },
  {
    id: "openai/gpt-5.6-luna",
    family: "OpenAI",
    persona: "luna",
    role: "Conversion & SEO Intelligence",
    taskProfile: "Growth analysis",
    summary: "A growth-focused model option for page clarity and discoverability.",
    tasks: [
      "Metadata and content-structure review",
      "FAQ and LocalBusiness structured-data support",
      "Call-to-action hierarchy and conversion paths",
    ],
  },
  {
    id: "openai/gpt-6-luna",
    family: "OpenAI",
    persona: "luna",
    role: "Conversion Strategy Specialist",
    taskProfile: "Conversion reasoning",
    summary: "Supports growth workflow decisions when selected by the router.",
    tasks: [
      "Visitor intent and next-step clarity",
      "SEO-friendly page organization",
      "Review of friction in lead-capture journeys",
    ],
  },
  {
    id: "openai/gpt-6-astra",
    family: "OpenAI",
    persona: "bench",
    role: "Astra · Specialist Bench",
    taskProfile: "Flexible reasoning",
    summary: "A specialist option for flexible planning and task expansion.",
    tasks: [
      "Rapid ideation and implementation planning",
      "Component expansion from a clear specification",
      "Synthesis across task requirements",
    ],
  },
  {
    id: "anthropic/claude-sonnet-5",
    family: "Anthropic",
    persona: "bench",
    role: "Sonnet · Specialist Bench",
    taskProfile: "Balanced reasoning",
    summary: "A configured general-purpose specialist for writing and review tasks.",
    tasks: [
      "Copy and content refinement",
      "Code synthesis and second-pass review",
      "Cross-checking long task specifications",
    ],
  },
  {
    id: "google/gemini-3.8-flash",
    family: "Google Gemini",
    persona: "bench",
    role: "Gemini · Fast Specialist",
    taskProfile: "Fast synthesis",
    summary: "A fast model option for eligible high-throughput and visual workflows.",
    tasks: [
      "Rapid synthesis and iteration",
      "Visual-input review when the workflow supports it",
      "Focused follow-up on bounded tasks",
    ],
  },
];

const MODEL_CARDS = CONFIGURED_MODEL_CARDS.filter((model) =>
  (LOVABLE_CONVERSATION_MODELS as readonly string[]).includes(model.id),
);

const PERSONA_META: Record<Persona, { label: string; icon: typeof Sparkles }> = {
  sol: { label: "Creative authority", icon: Palette },
  terra: { label: "Structural QA", icon: ShieldCheck },
  luna: { label: "Conversion & SEO", icon: TrendingUp },
  bench: { label: "High-throughput bench", icon: Gauge },
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All Models" },
  { id: "sol", label: "Creative Authority (Sol)" },
  { id: "terra", label: "Structural QA (Terra)" },
  { id: "luna", label: "Conversion & SEO (Luna)" },
  { id: "bench", label: "High-Throughput Bench" },
];

export function AiModelShowcase() {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const visibleModels =
    activeFilter === "all"
      ? MODEL_CARDS
      : MODEL_CARDS.filter((model) => model.persona === activeFilter);

  return (
    <section id="ai-workforce" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
        <div className="max-w-3xl">
          <p className="eyebrow">The intelligence behind your growth system</p>
          <h2 className="mt-3 font-editorial text-balance text-[clamp(1.8rem,4.2vw,3.15rem)] leading-[1.05]">
            A specialist AI workforce. One connected growth system.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Creative planning, structural review, conversion thinking and rapid synthesis each have
            different strengths. Revora routes work by task instead of assuming one model is best
            for everything.
          </p>
        </div>

        <div
          className="mt-7 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
          role="group"
          aria-label="Filter AI specialist cards"
        >
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              aria-pressed={activeFilter === filter.id}
              className={
                "min-h-11 min-w-0 rounded-full border px-3 py-2 text-left text-xs font-medium leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-sm " +
                (activeFilter === filter.id
                  ? "border-primary/55 bg-primary/10 text-primary"
                  : "border-border bg-card/60 text-muted-foreground hover:border-primary/35 hover:text-foreground")
              }
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div
          className="mt-5 flex flex-col gap-3 rounded-xl border border-primary/25 bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
          aria-label="AI model pool summary"
        >
          <div className="flex min-w-0 gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <BrainCircuit className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground sm:text-base">
                44-Model Collective Orchestration
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Sol, Terra and Luna represent creative, review and growth-focused workflows—not a
                promise that every model runs on every request.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-primary sm:max-w-48 sm:justify-end sm:text-right">
            <Activity className="size-4 shrink-0" aria-hidden="true" />
            <span>Live catalogue and task-based routing</span>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          The showcase reflects configured model options. The router filters by current catalogue
          eligibility, task compatibility and budget; availability can change between requests.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
          {visibleModels.map((model) => {
            const Icon = PERSONA_META[model.persona].icon;
            return (
              <article
                key={model.id}
                className="group flex min-w-0 flex-col rounded-xl border border-border/80 bg-card/65 p-4 transition-colors hover:border-primary/35 hover:bg-card/90 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold leading-snug text-foreground">
                        {model.role}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {PERSONA_META[model.persona].label}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground">
                    {model.family}
                  </span>
                </div>

                <p className="mt-4 break-words rounded-md border border-border/70 bg-background/65 px-3 py-2 font-mono text-[11px] leading-relaxed text-primary">
                  {model.id}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{model.summary}</p>

                <div className="mt-4 flex items-center gap-2 text-xs font-medium text-foreground">
                  <Compass className="size-4 text-primary" aria-hidden="true" />
                  <span>Task focus: {model.taskProfile}</span>
                </div>
                <ul className="mt-3 grid gap-2 border-t border-border/70 pt-3">
                  {model.tasks.map((task) => (
                    <li
                      key={task}
                      className="flex min-w-0 items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                    >
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0">{task}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex items-center gap-2 border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
                  <SearchCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>Selected when compatible with the task and live roster</span>
                  <ArrowUpRight className="ml-auto size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
