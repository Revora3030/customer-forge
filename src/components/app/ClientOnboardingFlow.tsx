/**
 * Client onboarding flow inside the builder.
 *
 * Four plain steps a client can finish end to end: choose the plan (setup +
 * monthly), build the site, publish it, then share their portal link. Each step
 * shows its real state from the workspace record — nothing is a checkbox the
 * client ticks themselves.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PortalAccess } from "@/components/app/PortalAccess";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { getPublicOfferRates } from "@/lib/offer.functions";
import { cn } from "@/lib/utils";

type Props = {
  organizationId: string | undefined;
  canManage: boolean;
  /** Real business phone + email are on file, so visitors can reach the client. */
  contactPhone?: string | null;
  contactEmail?: string | null;
  /** "paid" once the setup fee has cleared. */
  setupPaid: boolean;
  publishState: string;
  buildReady: boolean;
  requiredAnswers: number;
  isPublishing: boolean;
  onPublish: () => void;
  onGoTo: (section: string) => void;
};

export function ClientOnboardingFlow({
  organizationId,
  canManage,
  contactPhone,
  contactEmail,
  setupPaid,
  publishState,
  buildReady,
  requiredAnswers,
  isPublishing,
  onPublish,
  onGoTo,
}: Props) {
  const ratesFn = useServerFn(getPublicOfferRates);
  const rates = useQuery({
    queryKey: ["public-offer-rates"],
    queryFn: () => ratesFn({}),
    staleTime: 5 * 60 * 1000,
  });
  const setupPrice = rates.data?.setupPrice ?? GROWTH_SYSTEM.setupPrice;
  const monthlyPrice = rates.data?.monthlyPrice ?? GROWTH_SYSTEM.monthlyPrice;

  const published = publishState === "published";
  const phone = contactPhone?.trim() || "";
  const email = contactEmail?.trim() || "";
  const contactReady = !!phone && !!email;
  const steps = [
    { key: "account", title: "Set up your account & contact details", done: contactReady },
    { key: "plan", title: "Choose your plan", done: setupPaid },
    { key: "build", title: "Build your website", done: buildReady },
    { key: "publish", title: "Publish it", done: published },
    { key: "portal", title: "Walk your client portal", done: published && contactReady },
  ];
  const current = steps.find((step) => !step.done)?.key ?? "portal";
  const [open, setOpen] = React.useState<string>(current);

  React.useEffect(() => setOpen(current), [current]);

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Getting started</p>
          <h2 className="mt-1 font-display text-[16px] font-semibold">
            Five steps to a live growth system
          </h2>
        </div>
        <p className="text-[12px] text-muted-foreground">
          {steps.filter((s) => s.done).length} of {steps.length} done
        </p>
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => {
          const isOpen = open === step.key;
          return (
            <li
              key={step.key}
              className={cn(
                "rounded-lg border transition-colors",
                isOpen ? "border-primary/50 bg-primary/[0.03]" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? "" : step.key)}
                className="flex w-full items-center gap-3 p-3 text-left"
                aria-expanded={isOpen}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-[11px]",
                    step.done
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {step.done ? <Check className="size-3.5" aria-hidden /> : index + 1}
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-medium">{step.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {step.done ? "Done" : isOpen ? "Open" : "Next"}
                </span>
              </button>

              {isOpen ? (
                <div className="border-t border-border/70 p-3">
                  {step.key === "account" ? (
                    <div>
                      <p className="text-[12px] leading-relaxed text-muted-foreground">
                        Your account keeps everything you enter, so you can sign back in and pick up
                        where you left off. Your business phone and email are published on your
                        contact page and shown on your booking form, so visitors can reach you.
                      </p>
                      <ul className="mt-3 space-y-1 text-[12px]">
                        <li className={phone ? "text-primary" : "text-muted-foreground"}>
                          {phone ? `Phone: ${phone}` : "Phone: not added yet"}
                        </li>
                        <li className={email ? "text-primary" : "text-muted-foreground"}>
                          {email ? `Email: ${email}` : "Email: not added yet"}
                        </li>
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="signal" onClick={() => onGoTo("answers")}>
                          {contactReady ? "Review contact details" : "Add phone & email"}
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/app/settings">Account settings</Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {step.key === "plan" ? (
                    <div>
                      <p className="text-[13px]">
                        <span className="gold-text font-display text-[20px] font-semibold">
                          {usdExact(setupPrice)}
                        </span>{" "}
                        setup, then{" "}
                        <span className="gold-text font-medium">
                          {usdExact(monthlyPrice)}/month
                        </span>{" "}
                        — your first month is free.
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                        {setupPaid
                          ? "Your setup fee has cleared — production publishing and your custom domain are unlocked."
                          : "You can build and test everything during your free access. Paying the setup fee unlocks going live on your own domain."}
                      </p>
                      <Button asChild size="sm" variant="signal" className="mt-3">
                        <Link to="/app/billing">
                          {setupPaid ? "View billing" : "Pay setup & activate"}
                        </Link>
                      </Button>
                    </div>
                  ) : null}

                  {step.key === "build" ? (
                    <div>
                      <p className="text-[12px] leading-relaxed text-muted-foreground">
                        {requiredAnswers > 0
                          ? `Answer the ${requiredAnswers} remaining business question${requiredAnswers === 1 ? "" : "s"} — Revora writes your pages from them. Then edit anything visually on the canvas.`
                          : "Your answers are in. Edit any headline, paragraph or card directly on the visual canvas."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="signal" onClick={() => onGoTo("answers")}>
                          {requiredAnswers > 0 ? "Answer questions" : "Review answers"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onGoTo("canvas")}>
                          Open visual canvas
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {step.key === "publish" ? (
                    <div>
                      <p className="text-[12px] leading-relaxed text-muted-foreground">
                        {published
                          ? "Your site is live. Publish again any time you make changes."
                          : "Run the launch checks, then publish. Your site goes live on your Revora platform preview link, and on your own domain once it's connected."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="signal"
                          disabled={!canManage || isPublishing}
                          onClick={onPublish}
                        >
                          {isPublishing
                            ? "Publishing…"
                            : published
                              ? "Publish updates"
                              : "Publish site"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onGoTo("launch")}>
                          Launch checks
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {step.key === "portal" ? (
                    <div className="space-y-3">
                      <p className="text-[12px] leading-relaxed text-muted-foreground">
                        Finish the flow the way your client sees it: open the client portal, check
                        the dashboard, your pages and your live site, then confirm booking leads are
                        landing in your inbox.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="signal">
                          <Link to="/my/start">Open guided portal walkthrough</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/my">Portal dashboard</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/my/site">My live site</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/my/activity">Leads & bookings</Link>
                        </Button>
                      </div>
                      <PortalAccess organizationId={organizationId} canManage={canManage} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
