import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitPublicLead } from "@/lib/public-site.functions";
import { INDUSTRIES } from "@/lib/domain";
import { canonicalLink, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/demo/")({
  head: () => ({
    meta: [
      { title: "See Revora for your business — live demo" },
      {
        name: "description",
        content:
          "Walk the real customer journey on a live business site: instant quote, lead capture, booking and pipeline. Then request a preview for your own business.",
      },
      { property: "og:title", content: "See Revora for your business" },
      {
        property: "og:description",
        content:
          "A live, interactive demo of the quote → lead → booking flow, plus a preview request for your business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/demo"),
    ],
    links: [canonicalLink("/demo")],
  }),
  component: DemoPage,
});

const FLOW = [
  "Open the demo business site",
  "Pick a service and run the instant quote",
  "See the estimated price range",
  "Leave your details — a real lead is created",
  "Continue into booking and pick a time",
  "The lead and appointment show up in the dashboard",
];

function DemoPage() {
  const submit = useServerFn(submitPublicLead);
  const [done, setDone] = useState<{ business: string } | null>(null);
  const [form, setForm] = useState({
    business: "",
    industry: INDUSTRIES[0]?.name ?? "",
    city: "",
    state: "",
    url: "",
    phone: "",
    email: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const message = [
        `Preview request for ${form.business}`,
        `Industry: ${form.industry}`,
        form.state ? `State: ${form.state}` : "",
        form.url ? `Website/social: ${form.url}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return submit({
        data: {
          slug: "elite-mobile-detailing",
          name: form.business,
          email: form.email,
          phone: form.phone,
          city: form.city,
          message,
          serviceInterest: form.industry,
          source: "preview_request",
          kind: "consultation",
        },
      });
    },
    onSuccess: () => {
      setDone({ business: form.business });
      toast.success("Preview request received.");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Something went wrong. Try again.");
    },
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <Pill tone="attention">DEMO ACCOUNT</Pill>
            <h1 className="mt-5 max-w-3xl font-display text-[clamp(1.9rem,4.5vw,3rem)] leading-[1.06] font-semibold tracking-tight">
              Walk the customer journey yourself.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              Elite Mobile Detailing is a sample business dashboard. Illustrative data — not client
              results. Every quote and booking you submit creates records inside this demo workspace
              only.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="signal" size="lg">
                <Link to="/s/$slug" params={{ slug: "elite-mobile-detailing" }}>
                  Open the demo business site <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/demo/dashboard">Open the demo dashboard</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link to="/get-started">Build my growth system</Link>
              </Button>
            </div>
            <ol className="mt-10 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FLOW.map((step, index) => (
                <li key={step} className="panel flex gap-3 p-4">
                  <span className="tnum font-display text-[13px] font-semibold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-card">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <SectionHeading
                eyebrow="See it for your business"
                title="See what your business could look like"
              />
              <p className="mt-4 max-w-md text-[14px] leading-relaxed text-muted-foreground">
                Enter a few details and we'll show you how Revora would turn your online presence
                into a customer-acquisition system. No card, no obligation.
              </p>
            </div>

            <Panel className="p-5">
              {done ? (
                <div>
                  <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
                  <h2 className="mt-3 font-display text-[17px] font-semibold">
                    Thanks — we have your details for {done.business}.
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    Your request was saved as a real lead. Nothing has been generated for your
                    business yet — while you wait, walk the same journey your customers would on the
                    demo site.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button asChild variant="signal">
                      <Link to="/s/$slug" params={{ slug: "elite-mobile-detailing" }}>
                        Open the demo site
                      </Link>
                    </Button>
                    <Button variant="outline" onClick={() => setDone(null)}>
                      Send another
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate();
                  }}
                >
                  <div className="sm:col-span-2">
                    <Label htmlFor="business">Business name</Label>
                    <Input
                      id="business"
                      required
                      maxLength={120}
                      value={form.business}
                      onChange={(e) => set("business")(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="industry">Industry</Label>
                    <select
                      id="industry"
                      value={form.industry}
                      onChange={(e) => set("industry")(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {INDUSTRIES.map((industry) => (
                        <option key={industry.name} value={industry.name}>
                          {industry.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      maxLength={120}
                      value={form.city}
                      onChange={(e) => set("city")(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      maxLength={40}
                      value={form.state}
                      onChange={(e) => set("state")(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="url">Website or social link</Label>
                    <Input
                      id="url"
                      maxLength={200}
                      value={form.url}
                      onChange={(e) => set("url")(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      maxLength={40}
                      value={form.phone}
                      onChange={(e) => set("phone")(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      maxLength={160}
                      value={form.email}
                      onChange={(e) => set("email")(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      type="submit"
                      variant="signal"
                      className="w-full"
                      disabled={mutation.isPending}
                    >
                      {mutation.isPending ? "Sending…" : "Create my preview"}
                    </Button>
                    <p className="mt-2 text-[11.5px] text-muted-foreground">
                      Add an email or phone number so we can reach you.
                    </p>
                  </div>
                </form>
              )}
            </Panel>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
