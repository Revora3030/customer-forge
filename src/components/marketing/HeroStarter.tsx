import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth-session";
import { SIGN_UP_SEARCH } from "@/components/marketing/AuthButtons";

/** Browser-only hand-off from the homepage to onboarding. Only the visitor's own words. */
export const STARTER_KEY = "revora:starter";
export type Starter = { businessName: string; about: string };

export function readStarter(): Starter | null {
  try {
    const raw = window.localStorage.getItem(STARTER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Starter>;
    const businessName = typeof v.businessName === "string" ? v.businessName.slice(0, 120) : "";
    const about = typeof v.about === "string" ? v.about.slice(0, 1000) : "";
    return businessName || about ? { businessName, about } : null;
  } catch {
    return null;
  }
}

export function clearStarter() {
  try {
    window.localStorage.removeItem(STARTER_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/**
 * The homepage's first action: describe the business, then sign up with those
 * words already carried into onboarding so the AI team can start building.
 */
export function HeroStarter({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const { user } = useSession();
  const [businessName, setBusinessName] = useState("");
  const [about, setAbout] = useState("");
  const ready = about.trim().length >= 10;

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    try {
      window.localStorage.setItem(
        STARTER_KEY,
        JSON.stringify({ businessName: businessName.trim(), about: about.trim() }),
      );
    } catch {
      /* private mode — onboarding simply asks again */
    }
    if (user) void navigate({ to: "/get-started" });
    else void navigate({ to: "/auth", search: SIGN_UP_SEARCH });
  };

  return (
    <form
      onSubmit={start}
      className={`rounded-2xl border border-primary/30 bg-card/80 p-4 shadow-lg backdrop-blur ${className}`}
      aria-label="Start building your website"
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <Wand2 className="size-4 text-primary" aria-hidden="true" />
        Tell the AI about your business — it starts building right after sign-up
      </p>
      <label className="sr-only" htmlFor="starter-name">Business name</label>
      <Input
        id="starter-name"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        placeholder="Business name (optional)"
        maxLength={120}
        className="mt-3"
        autoComplete="organization"
      />
      <label className="sr-only" htmlFor="starter-about">What your business does</label>
      <Textarea
        id="starter-about"
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        placeholder="What you do, who you serve and where — e.g. a family dental clinic in Austin taking new patients"
        maxLength={1000}
        rows={3}
        className="mt-2 resize-none"
      />
      <Button type="submit" variant="signal" size="lg" className="mt-3 w-full" disabled={!ready}>
        Build my website free <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
      <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
        No card to start · you review everything before it goes live
      </p>
    </form>
  );
}
