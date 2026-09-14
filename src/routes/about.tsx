import { loadTenantPage, tenantPageHead, TenantOrMarketing } from "@/lib/tenant-page";
import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { SalesCTA } from "@/components/marketing/SalesCTA";
import { Panel } from "@/components/app/Bits";
import { REVORA } from "@/lib/brand";
import { canonicalLink, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  // On a client's own web address this path is THEIR page, not Revora's.
  loader: () => loadTenantPage("about"),
  head: ({ loaderData }) =>
    tenantPageHead(loaderData ?? null) ?? {
      meta: [
        { title: "About Revora — Built to help businesses grow" },
        {
          name: "description",
          content:
            "Revora is a business growth platform that helps companies get discovered, capture opportunities, convert leads, manage customers and automate follow-up.",
        },
        { property: "og:title", content: "About Revora" },
        {
          property: "og:description",
          content: `Revora is a business growth platform founded by ${REVORA.founder.name}.`,
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ogUrl("/about"),
      ],
      links: [canonicalLink("/about")],
    },
  component: AboutRoute,
});

/** Revora's page on Revora's address; the client's page on a client address. */
function AboutRoute() {
  const tenant = Route.useLoaderData();
  return (
    <TenantOrMarketing tenant={tenant}>
      <About />
    </TenantOrMarketing>
  );
}

const PILLARS = [
  {
    title: "Get discovered",
    body: "A fast, conversion-first website with local service and city pages, structured data and a health score that says what to fix next.",
  },
  {
    title: "Capture every opportunity",
    body: "Quote calculators, booking forms and call buttons on every screen, with each submission landing in one pipeline.",
  },
  {
    title: "Follow up automatically",
    body: "Automations chase quiet leads, request reviews after completed jobs and keep the calendar full without manual reminders.",
  },
  {
    title: "Know what's working",
    body: "Traffic, leads, bookings and conversion rate by source — reported in plain language, not vanity charts.",
  },
];

function About() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="hero-aura border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
            <p className="eyebrow">About Revora</p>
            <h1 className="mt-2 max-w-3xl font-display text-[clamp(2rem,4vw,2.8rem)] leading-tight font-semibold">
              Built to help businesses <span className="gold-text">grow</span>.
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Revora is a business growth platform designed to help companies get discovered,
              capture opportunities, convert leads, manage customers, automate follow-up, and
              understand what's driving their growth.
            </p>
            <dl className="mt-10 grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
              {[
                ["One system", "Site, quotes, bookings, CRM and analytics together"],
                ["1 day", "From signup to a live website address"],
                ["Every trade", "Templates tuned to how each business sells"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="font-display text-[17px] leading-tight font-semibold">{value}</dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <p className="eyebrow">What Revora does</p>
            <h2 className="mt-2 max-w-2xl font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-tight font-semibold">
              Four jobs, one operating system.
            </h2>
            <div className="mt-8 grid gap-3 md:grid-cols-2">
              {PILLARS.map((p) => (
                <Panel key={p.title} className="card-lift p-5">
                  <h3 className="font-display text-[15px] font-semibold">{p.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{p.body}</p>
                </Panel>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <p className="eyebrow text-center">Founder</p>
            <Panel className="mx-auto mt-5 max-w-2xl p-6 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/15 font-display text-[17px] font-semibold text-primary">
                A
              </span>
              <p className="mt-4 font-display text-[17px] font-semibold">{REVORA.founder.name}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{REVORA.founder.role}</p>
              <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
                Revora was created with a simple goal: give businesses a better system for turning
                online attention into real customers — without stitching five subscriptions
                together.
              </p>
            </Panel>
          </div>
        </section>

        <section className="hero-aura bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SalesCTA />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
