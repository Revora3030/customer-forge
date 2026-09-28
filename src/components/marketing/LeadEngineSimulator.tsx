/**
 * Pillar 2 — Tactile Live Lead Engine Simulator.
 *
 * An interactive widget that demonstrates what happens when a customer submits
 * a lead: the visitor types a sample name and phone, and within ~1.2 seconds a
 * simulated smartphone renders an incoming SMS from Revora Growth AI, then the
 * CRM stage updates Visitor -> Lead -> Booking Sent in real time.
 *
 * All data is illustrative and clearly labelled as such. No fabricated reviews,
 * awards, stats, or certifications.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowRight, MessageSquare, Phone, Smartphone, UserPlus, CalendarCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/app/Bits";

type Stage = "idle" | "submitting" | "sms" | "lead" | "booking";

const STAGE_LABELS: { stage: Stage; label: string; icon: typeof UserPlus }[] = [
  { stage: "idle", label: "Visitor", icon: Smartphone },
  { stage: "submitting", label: "Submitting", icon: UserPlus },
  { stage: "sms", label: "SMS Sent", icon: MessageSquare },
  { stage: "lead", label: "Lead", icon: UserPlus },
  { stage: "booking", label: "Booking Sent", icon: CalendarCheck },
];

export function LeadEngineSimulator() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [smsVisible, setSmsVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStage("submitting");
    setSmsVisible(false);
    // Step 2: SMS arrives within 1.2 seconds
    timers.current.push(setTimeout(() => {
      setStage("sms");
      setSmsVisible(true);
    }, 1200));
    // Step 3: CRM stage updates to Lead
    timers.current.push(setTimeout(() => {
      setStage("lead");
    }, 2600));
    // Step 4: CRM stage updates to Booking Sent
    timers.current.push(setTimeout(() => {
      setStage("booking");
    }, 4000));
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStage("idle");
    setSmsVisible(false);
    setName("");
    setPhone("");
  };

  const activeIndex = STAGE_LABELS.findIndex((s) => s.stage === stage);
  const customerName = name.trim() || "the customer";

  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-5 shadow-lg backdrop-blur-md sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Live Lead Engine</p>
          <h3 className="mt-2 font-display text-[clamp(1.15rem,2.2vw,1.4rem)] leading-tight font-semibold">
            See what happens when a customer <span className="gold-text">submits a lead</span>
          </h3>
        </div>
        <Pill tone="attention">Illustrative demo</Pill>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr] lg:items-start">
        {/* Step 1: Mini lead form */}
        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
            Step 1 — Customer submits
          </p>
          <form onSubmit={run} className="mt-3 space-y-2.5">
            <div>
              <label className="sr-only" htmlFor="lead-name">Name</label>
              <Input
                id="lead-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name (e.g. Dana Reyes)"
                maxLength={80}
                disabled={stage !== "idle" && stage !== "booking"}
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="lead-phone">Phone</label>
              <Input
                id="lead-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (e.g. 555-0142)"
                maxLength={20}
                disabled={stage !== "idle" && stage !== "booking"}
              />
            </div>
            <Button
              type="submit"
              variant="signal"
              className="w-full"
              disabled={!name.trim() || !phone.trim() || (stage !== "idle" && stage !== "booking")}
            >
              Submit lead <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            {stage === "booking" ? (
              <Button type="button" variant="outline" className="mt-2 w-full" onClick={reset}>
                Run again
              </Button>
            ) : null}
          </form>
        </div>

        {/* Step 2: Smartphone SMS simulation */}
        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
            Step 2 — SMS arrives in ~1.2s
          </p>
          <div className="mt-3 flex justify-center">
            <div className="relative w-full max-w-[220px] rounded-[1.5rem] border-[6px] border-foreground/80 bg-background p-2 shadow-xl">
              {/* Phone notch */}
              <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-foreground/40" />
              {/* Screen */}
              <div className="flex h-[200px] flex-col overflow-hidden rounded-[1rem] bg-gradient-to-b from-primary/5 to-background">
                <div className="flex items-center justify-between border-b border-border/40 px-3 py-1.5">
                  <span className="text-[9px] font-medium text-muted-foreground">9:41 AM</span>
                  <Phone className="size-2.5 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="flex-1 overflow-y-auto p-2.5">
                  {smsVisible ? (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <div className="mb-1 flex items-center gap-1">
                        <div className="flex size-5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                          R
                        </div>
                        <span className="text-[9.5px] font-semibold text-foreground">Revora Growth AI</span>
                        <span className="text-[8px] text-muted-foreground">now</span>
                      </div>
                      <div className="ml-6 rounded-2xl rounded-tl-sm bg-primary/10 px-2.5 py-1.5 text-[10px] leading-snug text-foreground">
                        Hi {customerName}, this is Revora Growth AI. We saw you requested a quote —
                        here's your instant estimate and next available slot.
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="text-[10px] text-muted-foreground">
                        {stage === "submitting" ? "Sending SMS…" : "Waiting for a lead…"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step 3: CRM stage tracker */}
      <div className="mt-5 rounded-xl border border-border/60 bg-card/60 p-4">
        <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
          Step 3 — CRM stage updates in real time
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {STAGE_LABELS.map((entry, i) => {
            const Icon = entry.icon;
            const isActive = i <= activeIndex && stage !== "idle";
            const isCurrent = i === activeIndex && stage !== "idle";
            return (
              <div key={entry.stage} className="flex items-center gap-1.5">
                <div
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    isCurrent
                      ? "border-primary bg-primary/15 text-primary"
                      : isActive
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {isActive && !isCurrent ? (
                    <CheckCircle2 className="size-3" aria-hidden="true" />
                  ) : (
                    <Icon className="size-3" aria-hidden="true" />
                  )}
                  {entry.label}
                </div>
                {i < STAGE_LABELS.length - 1 ? (
                  <span
                    className={`h-px w-3 ${i < activeIndex ? "bg-success/60" : "bg-border"}`}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
