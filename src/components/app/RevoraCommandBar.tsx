/**
 * REVORA COMMAND BAR — one box for everything.
 *
 * The owner types a normal sentence. The router decides which part of Revora
 * owns that work, then this component either hands the request to the website
 * assistant or navigates to the panel where the work actually happens. It never
 * says the work is done — it takes you to where it happens.
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askAssistant } from "@/lib/assistant-bridge";
import { COMMAND_EXAMPLES, routeCommand, type RoutedCommand } from "@/lib/command-router";
import { scrollElementIntoView } from "@/lib/use-step-scroll";

export function RevoraCommandBar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [last, setLast] = useState<RoutedCommand | null>(null);

  const run = (text: string) => {
    const routed = routeCommand(text);
    setLast(routed);
    if (routed.instruction) {
      askAssistant(routed.instruction);
      return;
    }
    if (routed.route) {
      void navigate({ to: routed.route }).then(() => {
        if (routed.anchor) {
          window.setTimeout(
            () => scrollElementIntoView(document.getElementById(routed.anchor!)),
            250,
          );
        }
      });
      return;
    }
    if (routed.anchor) scrollElementIntoView(document.getElementById(routed.anchor));
  };

  return (
    <section
      id="revora-command"
      className={`rounded-xl border border-primary/40 bg-card/60 p-4 ${className ?? ""}`}
      aria-label="Ask Revora"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-primary" aria-hidden />
        Tell Revora what you want
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Tell Revora what you want in your own words — it'll handle the rest. No special wording, no
        menus to learn.
      </p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) run(value.trim());
        }}
      >
        <label className="sr-only" htmlFor="revora-command-input">
          What would you like Revora to do?
        </label>
        <Input
          id="revora-command-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="e.g. I want more emergency callouts from my home page"
          autoComplete="off"
        />
        <Button type="submit" disabled={!value.trim()} className="shrink-0 whitespace-nowrap">
          Go <ArrowRight className="ml-2 size-4" aria-hidden />
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {COMMAND_EXAMPLES.slice(0, 6).map((example) => (
          <button
            key={example}
            type="button"
            className="rounded-full border border-border/70 px-3 py-1 text-[12px] text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
            onClick={() => {
              setValue(example);
              run(example);
            }}
          >
            {example}
          </button>
        ))}
      </div>
      {last ? (
        <p className="mt-3 text-[12px]" role="status">
          {`${last.action}${last.action.endsWith(".") ? "" : "."}`}
        </p>
      ) : null}
    </section>
  );
}
