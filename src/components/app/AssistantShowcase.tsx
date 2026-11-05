/**
 * The gold headline of the builder: the Website Assistant. It tells the client,
 * from step one, that they can ask for anything in plain words — pages, copy,
 * offers, forms, SEO, colours, 3D sections, animated backgrounds — and shows
 * one-tap examples that hand the request straight to the assistant.
 */
import { Sparkle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askAssistant } from "@/lib/assistant-bridge";

const EXAMPLES = [
  {
    label: "Show off what you can do",
    prompt:
      "Give my site a premium upgrade: add a starfield background, put a 3D float effect on the hero, a gold glow on my offer section, and rewrite the headline so it sells the result I deliver.",
  },
  {
    label: "Build me more customers",
    prompt:
      "Add a page for my best-paying service with proof, pricing guidance, a quote form above the fold and a strong call to action.",
  },
  {
    label: "Make it feel expensive",
    prompt:
      "Make my website feel high-end: aurora background, frosted glass sections, gold shine on the reviews block, and tighter, more confident copy.",
  },
  {
    label: "Fix my weakest page",
    prompt:
      "Review my pages, tell me which one converts worst and why, then rewrite it and add the missing lead-capture blocks.",
  },
];

export function AssistantShowcase() {
  return (
    <section className="panel relative overflow-hidden border-gold/45 bg-gold/[0.06] p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-gold/15 blur-3xl"
      />
      <div className="relative">
        <p className="eyebrow text-gold">Start here · Website assistant</p>
        <h2 className="mt-2 flex items-center gap-2 font-display text-[22px] leading-tight font-semibold">
          <Wand2 className="size-5 text-gold" aria-hidden />
          Your whole build team, in one box
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Tell Revora what you want in your own words — it'll handle the rest. There is nothing to
          learn: describe the outcome and the assistant does the work — new pages and sections,
          sharper selling copy, quote and booking forms, search settings, colours and fonts, photos
          and video, plus premium visuals like{" "}
          <span className="text-gold">animated star backgrounds</span>,{" "}
          <span className="text-gold">3D floating sections</span>, frosted glass and gold glow. It
          always shows you the plan first, you approve it, and every change is saved as a version
          you can roll back.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <Button
              key={example.label}
              variant="outline"
              size="sm"
              className="border-gold/40 text-[12px] hover:border-gold/70"
              onClick={() => askAssistant(example.prompt)}
            >
              <Sparkle className="size-3.5 text-gold" aria-hidden />
              {example.label}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Tap an example or write your own words — any wording works, and nothing is applied until
          you approve it. Every change is previewed first and can be rolled back.
        </p>
      </div>
    </section>
  );
}
