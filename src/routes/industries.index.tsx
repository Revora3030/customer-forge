import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { INDUSTRIES, TEMPLATES, industrySlug } from "@/lib/domain";
import { canonicalLink, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/industries/")({
  head: () => ({
    meta: [
      { title: "Industries we build for — Revora" },
      {
        name: "description",
        content:
          "Templates and quote calculators tuned for auto detailing, beauty, landscaping, cleaning, contracting, HVAC, roofing and more local trades.",
      },
      { property: "og:title", content: "Industries we build for — Revora" },
      {
        property: "og:description",
        content: "Every trade sells differently. Pick your industry and get a site tuned to it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/industries"),
    ],
    links: [canonicalLink("/industries")],
  }),
  component: Industries,
});

function Industries() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="hero-aura mx-auto max-w-6xl px-4 py-16">
        <p className="eyebrow">Industries</p>
        <h1 className="mt-2 font-display text-[clamp(2rem,4vw,2.8rem)] leading-tight font-semibold">
          Every trade sells differently
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          A detailer sells with before-and-after proof. A stylist sells with a portfolio and an open
          calendar. A roofer sells with trust and a fast quote. Your template starts where your
          trade actually converts.
        </p>

        <section className="mt-12">
          <h2 className="font-display text-[19px] font-semibold">Templates</h2>
          <div className="mt-4 grid items-stretch gap-3 md:grid-cols-3">
            {TEMPLATES.filter((t) => t.id !== "default").map((t) => (
              <div key={t.id} className="panel card-lift flex h-full flex-col p-5">
                <h3 className="font-display text-[15px] font-semibold">{t.name}</h3>
                <p className="mt-2 text-[13px] text-muted-foreground">{t.focus}</p>
                <p className="mt-3 text-[11px] tracking-wider uppercase text-primary">
                  Primary action: {t.primary === "book" ? "Book now" : "Get a quote"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-[19px] font-semibold">Trades we cover</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIES.map((i) => (
              <li key={i.name}>
                <Link
                  to="/industries/$slug"
                  params={{ slug: industrySlug(i.name) }}
                  className="panel card-lift block h-full p-4 transition-colors hover:border-primary/40"
                >
                  <p className="font-display text-[14px] font-semibold">{i.name}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {i.emphasis}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-6 text-[13px] text-muted-foreground">
          Contractors, HVAC, plumbing and roofing crews: see how the{" "}
          <Link
            to="/crm-for-contractors"
            className="text-primary underline-offset-4 hover:underline"
          >
            CRM for contractors
          </Link>{" "}
          runs leads, quotes, follow-ups and reviews in one place.
        </p>

        <div className="panel mt-14 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-[17px] font-semibold">Don't see your trade?</h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              The universal template covers any local service business — you keep full control of
              services, pricing and quoting.
            </p>
          </div>
          <Button asChild variant="signal">
            <Link to="/get-started">Get started</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
