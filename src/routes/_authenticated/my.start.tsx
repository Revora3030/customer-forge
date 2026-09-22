/**
 * Client portal — step-by-step onboarding.
 *
 * A brand new client's path in order: account, business details, build the
 * site, publish it, then use the portal. Each step reads real workspace data,
 * so a step only shows as done when it actually is.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, CircleDashed } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { useBusinessProfile, useServices, useWebsiteSettings } from "@/lib/queries";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { useWorkspace } from "@/lib/use-tenant";
import { liveAddressUrl } from "@/lib/revora-address";

export const Route = createFileRoute("/_authenticated/my/start")({
  head: () => ({
    meta: [
      { title: "Setup steps — get your website live" },
      {
        name: "description",
        content:
          "The exact steps to get your business online with Revora: add your details, build your site, publish it and start taking bookings.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyStart,
});

const has = (value: unknown) => typeof value === "string" && value.trim().length > 0;

function MyStart() {
  const { data: ws } = useWorkspace();
  const org = ws?.workspace?.organization;
  const orgId = ws?.workspace?.organizationId;
  const { data: profile } = useBusinessProfile(orgId);
  const { data: settings } = useWebsiteSettings(orgId);
  const { data: services } = useServices(orgId);
  const { data: pages } = useWebsiteContent(orgId);

  const sections = (pages ?? []).reduce(
    (total, page) => total + page.sections.filter((section) => section.is_visible).length,
    0,
  );
  const live = settings?.publish_state === "published";
  const liveAt = liveAddressUrl(settings ?? {}, org?.slug ?? null);
  const address = liveAt.url;

  const steps = [
    {
      title: "Create your account",
      body: "You're signed in — this portal is yours.",
      done: !!orgId,
      to: null as string | null,
      cta: null as string | null,
    },
    {
      title: "Add your business details",
      body: "Phone, city, service area and hours — these appear on your site and in Google.",
      done: has(profile?.phone) && has(profile?.city),
      to: "/app/settings",
      cta: "Add details",
    },
    {
      title: "List what you sell",
      body: "Your services and prices so visitors know what to book.",
      done: (services ?? []).length > 0,
      to: "/app/services",
      cta: "Add services",
    },
    {
      title: "Build your website",
      body: "Describe your business and Revora writes the pages — then tweak anything you like.",
      done: sections > 0,
      to: "/app/website",
      cta: "Open the builder",
    },
    {
      title: "Publish it",
      body: `Go live on your Revora share link${
        liveAt.label ? ` — ${liveAt.label}` : ""
      }. No domain purchase needed.`,

      done: live,
      to: "/app/launch",
      cta: "Publish",
    },
    {
      title: "Set your alert inbox",
      body: "Every lead and booking emails you instantly. Point it at the inbox you actually read.",
      done: has(profile?.notification_email) || has(profile?.email),
      to: "/app/settings",
      cta: "Set inbox",
    },
    {
      title: "Use your portal",
      body: "Check leads, bookings and visits here whenever you like.",
      done: live,
      to: "/my",
      cta: "Go to portal home",
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <div className="product-page">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            eyebrow="Getting started"
            title={`Welcome${org?.name ? `, ${org.name}` : ""}`}
            description="Work top to bottom. Each step takes a couple of minutes."
          />
          <Pill tone={doneCount === steps.length ? "signal" : "attention"}>
            {doneCount} of {steps.length} done
          </Pill>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }}
          />
        </div>
      </Panel>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Panel className="flex flex-wrap items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <CircleDashed className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">
                  <span className="text-muted-foreground">Step {index + 1} · </span>
                  {step.title}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
              {step.to && step.cta ? (
                <Button asChild size="sm" variant={step.done ? "outline" : "default"}>
                  <Link to={step.to as "/app"}>
                    {step.cta}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </Panel>
          </li>
        ))}
      </ol>

      {live && address ? (
        <Panel>
          <SectionHeading eyebrow="You're live" title="Your website is online" />
          <p className="mt-2 text-[13px] text-muted-foreground">
            Share this address with customers:{" "}
            <a
              href={address}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              {address.replace(/^https:\/\//, "")}
            </a>
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
