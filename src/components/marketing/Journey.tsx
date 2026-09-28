import { ArrowDown, Check, X } from "lucide-react";
import { Panel } from "@/components/app/Bits";

const JOURNEY = [
  { step: "Local search", body: "Someone nearby searches for what you do." },
  { step: "Business website", body: "They land on a fast, credible site built to sell the job." },
  { step: "Quote, book or call", body: "Three obvious next steps on every screen." },
  { step: "Lead capture", body: "Their details and answers are saved the moment they act." },
  { step: "Your pipeline", body: "Every lead in one board — nothing lost in DMs." },
  { step: "Follow-up", body: "Nudges go out before the customer moves on." },
  { step: "Booking", body: "The job lands on your calendar with the details attached." },
  { step: "Customer", body: "Contact history, value and next visit in one profile." },
  { step: "Review", body: "Happy customers get asked publicly. Unhappy ones privately." },
  { step: "Repeat business", body: "Quiet customers get reactivated instead of forgotten." },
];

export function CustomerJourney() {
  return (
    <ol className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {JOURNEY.map((item, index) => (
        <li key={item.step} className="relative">
          <Panel className="h-full p-4">
            <span className="tnum font-display text-[13px] font-semibold text-primary">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-2 font-display text-[14px] leading-snug font-semibold">
              {item.step}
            </h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </Panel>
          {index < JOURNEY.length - 1 ? (
            <ArrowDown
              aria-hidden="true"
              className="mx-auto my-1 size-3.5 text-muted-foreground/60 lg:hidden"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

const WITHOUT = [
  "Instagram DMs as your inbox",
  "Missed calls while you work",
  "Manual quotes every evening",
  "Customer info scattered across your phone",
  "No automated follow-up",
  "No online booking",
  "No lead tracking",
  "No idea what's actually working",
];

const WITH = [
  "A website built to convert",
  "Local SEO foundation",
  "Instant quote system",
  "Online booking",
  "One lead pipeline",
  "Automated follow-up",
  "Customer management",
  "Review requests",
  "Analytics by source",
  "Monthly growth reporting",
];

export function WithoutWith() {
  return (
    <div className="mt-8 grid gap-3 md:grid-cols-2">
      <Panel className="overflow-hidden p-5">
        <h3 className="font-display text-[15px] font-semibold text-muted-foreground">
          Without Revora
        </h3>
        <ul className="mt-4 space-y-2.5">
          {WITHOUT.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[13px] text-muted-foreground">
              <X aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              {item}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="overflow-hidden border-primary/40 p-5">
        <h3 className="font-display text-[15px] font-semibold">With Revora</h3>
        <ul className="mt-4 space-y-2.5">
          {WITH.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[13px] text-foreground">
              <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {item}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export const TRUST_INDUSTRIES = [
  "Detailing",
  "Hair",
  "Barber",
  "Cleaning",
  "Landscaping",
  "Pressure Washing",
  "HVAC",
  "Plumbing",
  "Roofing",
  "Contractors",
  "Beauty",
  "Photography",
  "Fitness",
  "Real Estate",
];
