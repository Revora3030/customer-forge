import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "@/lib/ui/notify";
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { seedQuoteCalculator } from "@/lib/quote-seed";
import { newTrialEndsAt } from "@/lib/trial";
import { assertNoError, supabaseErrorMessage } from "@/lib/supabase-error";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNote } from "@/components/app/Bits";
import { INDUSTRIES } from "@/lib/domain";
import { useWorkspace } from "@/lib/use-tenant";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useStepScroll } from "@/lib/use-step-scroll";
import { useServerFn } from "@tanstack/react-start";
import { runSiteGeneration } from "@/lib/site-engine.functions";

import {
  WEBSITE_GOALS,
  revoraShareAddress,
  safeSlug,
  type GoalKey,
} from "@/lib/website-plan";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Build your website — Revora" },
      {
        name: "description",
        content:
          "Answer six short steps. Revora builds your website and connects it to your growth system.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

type ServiceDraft = { name: string; description: string; price: string };
type TestimonialDraft = { name: string; text: string };

type Draft = {
  businessName: string;
  industry: string;
  city: string;
  state: string;
  serviceArea: string;
  about: string;
  services: ServiceDraft[];
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  heroImageUrl: string;
  phone: string;
  email: string;
  address: string;
  hours: string;
  website: string;
  instagram: string;
  facebook: string;
  google: string;
  yearsInBusiness: string;
  certifications: string;
  awards: string;
  testimonials: TestimonialDraft[];
  goals: GoalKey[];
};

const STEPS = ["Business", "Services", "Brand", "Contact", "Proof", "Goals"] as const;

const emptyService = (): ServiceDraft => ({ name: "", description: "", price: "" });

function Onboarding() {
  const navigate = useNavigate();
  const { data: ws } = useWorkspace();
  const queryClient = useQueryClient();
  // The final onboarding step queues the canonical Sol → Terra website build.
  const queueBuild = useServerFn(runSiteGeneration);

  const [step, setStep] = useState(0);
  const stepRef = useStepScroll<HTMLDivElement>(step);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    businessName: "",
    industry: INDUSTRIES[0]!.name,
    city: "",
    state: "",
    serviceArea: "",
    about: "",
    services: [emptyService()],
    primaryColor: "#0B0B0C",
    accentColor: "#C9A227",
    logoUrl: "",
    heroImageUrl: "",
    phone: "",
    email: "",
    address: "",
    hours: "",
    website: "",
    instagram: "",
    facebook: "",
    google: "",
    yearsInBusiness: "",
    certifications: "",
    awards: "",
    testimonials: [],
    goals: ["quote"],
  });

  // Signup answers are saved to the user's account, so signing out (or losing
  // the tab) never loses progress — they sign back in and resume where they were.
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        if (!cancelled) setRestored(true);
        return;
      }
      const { data: row } = await supabase
        .from("onboarding_drafts")
        .select("step, data, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (row?.data && typeof row.data === "object") {
        setDraft((prev) => ({ ...prev, ...(row.data as Partial<Draft>) }));
        setStep(Math.min(Math.max(row.step ?? 0, 0), STEPS.length - 1));
        setSavedAt(row.updated_at ?? null);
      }

      // Anything already answered at signup is on the account, so never ask for
      // it a second time: fill every blank box from the saved business details.
      const { data: membership } = await supabase
        .from("memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      const orgId = membership?.organization_id ?? null;
      if (cancelled || !orgId) {
        if (!cancelled) setRestored(true);
        return;
      }
      const [orgRes, profileRes, servicesRes, socialRes] = await Promise.all([
        supabase.from("organizations").select("name, industry").eq("id", orgId).maybeSingle(),
        supabase
          .from("business_profiles")
          .select(
            "phone, email, address, city, state, service_area, description, hours, website, logo_url, hero_image_url, primary_color, accent_color, years_in_business, certifications, awards",
          )
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("services")
          .select("name, description, price, sort_order")
          .eq("organization_id", orgId)
          .order("sort_order"),
        supabase
          .from("social_profiles")
          .select("instagram, facebook, google_business")
          .eq("organization_id", orgId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const org = orgRes.data;
      const profile = profileRes.data as Record<string, unknown> | null;
      const social = socialRes.data;
      const savedServices = (servicesRes.data ?? []).filter((s) => s.name?.trim());
      const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
      const hoursText = (() => {
        const hours = profile?.["hours"];
        if (typeof hours === "string") return hours;
        if (hours && typeof hours === "object") {
          const summary = (hours as Record<string, unknown>)["summary"];
          if (typeof summary === "string") return summary;
        }
        return "";
      })();
      const knownIndustry = INDUSTRIES.find(
        (i) => i.name.toLowerCase() === text(org?.industry).toLowerCase(),
      );

      setDraft((prev) => {
        const keep = (current: string, saved: string) => (current.trim() ? current : saved);
        return {
          ...prev,
          businessName: keep(prev.businessName, text(org?.name)),
          industry:
            prev.industry === INDUSTRIES[0]!.name && knownIndustry
              ? knownIndustry.name
              : prev.industry,
          city: keep(prev.city, text(profile?.["city"])),
          state: keep(prev.state, text(profile?.["state"])),
          serviceArea: keep(prev.serviceArea, text(profile?.["service_area"])),
          about: keep(prev.about, text(profile?.["description"])),
          phone: keep(prev.phone, text(profile?.["phone"])),
          email: keep(prev.email, text(profile?.["email"])),
          address: keep(prev.address, text(profile?.["address"])),
          hours: keep(prev.hours, hoursText),
          website: keep(prev.website, text(profile?.["website"])),
          logoUrl: keep(prev.logoUrl, text(profile?.["logo_url"])),
          heroImageUrl: keep(prev.heroImageUrl, text(profile?.["hero_image_url"])),
          primaryColor: text(profile?.["primary_color"]) || prev.primaryColor,
          accentColor: text(profile?.["accent_color"]) || prev.accentColor,
          yearsInBusiness: keep(
            prev.yearsInBusiness,
            profile?.["years_in_business"] == null ? "" : String(profile["years_in_business"]),
          ),
          certifications: keep(prev.certifications, text(profile?.["certifications"])),
          awards: keep(prev.awards, text(profile?.["awards"])),
          instagram: keep(prev.instagram, text(social?.instagram)),
          facebook: keep(prev.facebook, text(social?.facebook)),
          google: keep(prev.google, text(social?.google_business)),
          services:
            prev.services.some((s) => s.name.trim()) || !savedServices.length
              ? prev.services
              : savedServices.map((s) => ({
                  name: s.name ?? "",
                  description: s.description ?? "",
                  price: s.price == null ? "" : String(s.price),
                })),
        };
      });
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restored || ws?.workspace?.organization.onboarding_completed) return;
    const timer = setTimeout(async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return;
      const { error: saveError } = await supabase
        .from("onboarding_drafts")
        .upsert({ user_id: user.id, step, data: draft as never }, { onConflict: "user_id" });
      if (!saveError) setSavedAt(new Date().toISOString());
    }, 800);
    return () => clearTimeout(timer);
  }, [draft, step, restored, ws?.workspace?.organization.onboarding_completed]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const toggleGoal = (goal: GoalKey) =>
    setDraft((prev) => ({
      ...prev,
      goals: prev.goals.includes(goal)
        ? prev.goals.filter((g) => g !== goal)
        : [...prev.goals, goal],
    }));

  const slugPreview = safeSlug(draft.businessName);

  async function finish() {
    setError(null);
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) throw new Error("Your session expired. Please sign in again.");

      // Signing up for the setup payment already creates a bare workspace.
      // In that case we finish that workspace instead of creating a second one.
      const existingOrg = ws?.workspace?.organization ?? null;
      const existingId = existingOrg && !existingOrg.onboarding_completed ? existingOrg.id : null;

      // Web addresses have to be unique across every workspace, and a client
      // can't see other people's workspaces — so we can't check first. We ask
      // for the name we want and take the next free variation if it's taken.
      const slugBase = existingOrg?.slug ?? safeSlug(draft.businessName);
      let slug = slugBase;

      const services = draft.services.filter((s) => s.name.trim());
      const testimonials = draft.testimonials.filter((t) => t.text.trim());
      const goals: GoalKey[] = draft.goals.length ? draft.goals : ["quote"];

      const legacyGoal =
        goals[0] === "book"
          ? "bookings"
          : goals[0] === "call"
            ? "calls"
            : goals[0] === "consult"
              ? "consultations"
              : goals[0] === "purchase"
                ? "purchases"
                : "quotes";

      const orgFields = {
        name: draft.businessName.trim(),
        industry: draft.industry,
        conversion_goal: legacyGoal as never,
        onboarding_completed: true,
        onboarding_step: STEPS.length,
      };

      let org: { id: string; slug: string };
      if (existingId) {
        const { data: updated, error: updateError } = await supabase
          .from("organizations")
          .update(orgFields)
          .eq("id", existingId)
          .select("id, slug")
          .single();
        if (updateError) throw updateError;
        org = updated;
      } else {
        let inserted: { id: string; slug: string } | null = null;
        for (let attempt = 0; attempt < 6 && !inserted; attempt++) {
          if (attempt > 0) slug = `${slugBase}-${Math.floor(Math.random() * 9000 + 1000)}`;
          const { data, error: orgError } = await supabase
            .from("organizations")
            .insert({
              ...orgFields,
              slug,
              created_by: user.id,
              subscription_status: "trialing" as never,
              trial_ends_at: newTrialEndsAt(),
            })
            .select("id, slug")
            .single();
          if (!orgError) {
            inserted = data;
            break;
          }
          const taken =
            orgError.code === "23505" || /duplicate key|organizations_slug/i.test(orgError.message);
          if (!taken) throw orgError;
        }
        if (!inserted)
          throw new Error(
            "That business name is already in use on Revora. Try a slightly different name.",
          );
        org = inserted;

        const { error: membershipError } = await supabase
          .from("memberships")
          .insert({ organization_id: org.id, user_id: user.id, role: "owner" });
        assertNoError(membershipError, "Could not link your account to the new workspace");
      }

      const { error: profileError } = await supabase.from("business_profiles").upsert(
        {
          organization_id: org.id,
          phone: draft.phone || null,
          email: draft.email || null,
          address: draft.address || null,
          city: draft.city || null,
          state: draft.state || null,
          service_area: draft.serviceArea || draft.city || null,
          description: draft.about || null,
          tagline: `${draft.industry}${draft.city ? ` in ${draft.city}` : ""}`,
          // hours is NOT NULL in the database — always send an object.
          hours: (draft.hours ? { summary: draft.hours } : {}) as never,
          website: draft.website || null,
          logo_url: draft.logoUrl || null,
          hero_image_url: draft.heroImageUrl || null,
          primary_color: draft.primaryColor,
          accent_color: draft.accentColor,
          years_in_business: draft.yearsInBusiness ? Number(draft.yearsInBusiness) : null,
          certifications: draft.certifications || null,
          awards: draft.awards || null,
          testimonials: testimonials as never,
          website_goals: goals,
        } as never,
        { onConflict: "organization_id" },
      );
      assertNoError(profileError, "Could not save your business details");

      const socialRow = {
        organization_id: org.id,
        instagram: draft.instagram.trim() || null,
        facebook: draft.facebook.trim() || null,
        google_business: draft.google.trim() || null,
      };
      if (socialRow.instagram || socialRow.facebook || socialRow.google_business) {
        const { error: socialError } = await supabase
          .from("social_profiles")
          .upsert(socialRow as never, { onConflict: "organization_id" });
        assertNoError(socialError, "Could not save your social links");
      }

      if (services.length) {
        // Re-running onboarding must not duplicate the service list.
        await supabase.from("services").delete().eq("organization_id", org.id);
        const { error: servicesError } = await supabase.from("services").insert(
          services.map((s, index) => ({
            organization_id: org.id,
            name: s.name.trim(),
            description: s.description.trim() || null,
            price: s.price ? Number(s.price) : null,
            starting_price: s.price ? Number(s.price) : null,
            bookable: goals.includes("book"),
            featured: index === 0,
            sort_order: index,
          })) as never,
        );
        assertNoError(servicesError, "Could not save your services");
      }

      // Give the workspace a working quote calculator so the public site's
      // primary "Get my quote" CTA has a real destination from day one.
      // A calculator hiccup must never block the build — log and continue.
      try {
        await seedQuoteCalculator(
          supabase,
          org.id,
          services.map((s) => s.name.trim()),
        );
      } catch (seedError) {
        console.error("[onboarding] quote calculator seed failed", supabaseErrorMessage(seedError));
      }

      // Never write a deterministic website plan during onboarding. Save only
      // factual workspace state and let the canonical Sol → Terra build own every
      // page, section, copy, visual and responsive decision.
      const { error: settingsError } = await supabase.from("website_settings").upsert(
        {
          organization_id: org.id,
          template: "ai-authored",
          publish_state: "preview",
          generation: {
            builderState: "queued",
            source: "canonical-ai",
            businessName: draft.businessName,
          },
        } as never,
        { onConflict: "organization_id" },
      );
      assertNoError(settingsError, "Could not create your website draft");

      await supabase.from("onboarding_drafts").delete().eq("user_id", user.id);

      // Actually start the canonical AI build the button promises. The worker
      // reads the saved workspace facts and requires a complete Sol → Terra
      // contract before writing any site pages.
      let queued = false;
      try {
        await queueBuild({ data: { organizationId: org.id, mode: "safe" } });
        queued = true;
      } catch (buildError) {
        // Never trap the owner in onboarding: their answers are saved, and the
        // builder's own Build button lets them start the build with one click.
        console.error("[onboarding] build queue failed", supabaseErrorMessage(buildError));
      }

      await queryClient.invalidateQueries();

      if (queued)
        toast.success("Revora is building your website", {
          description: "Progress shows in the builder — it only takes a moment.",
        });
      else
        toast.message("Your details are saved", {
          description: "Open Build in the builder to start your website.",
        });
      navigate({ to: "/app/website", replace: true });
    } catch (err) {
      console.error("[onboarding] build failed", err);
      setError(supabaseErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (ws?.workspace?.organization.onboarding_completed) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-[20px] font-semibold">You're already set up</h1>
        <Button variant="signal" className="mt-6" onClick={() => navigate({ to: "/app" })}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  const canContinue =
    step === 0
      ? draft.businessName.trim().length > 1 && draft.city.trim().length > 1
      : step === 1
        ? draft.services.some((s) => s.name.trim().length > 1)
        : step === 3
          ? draft.phone.trim().length > 5 || draft.email.trim().length > 4
          : step === 5
            ? draft.goals.length > 0
            : true;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <Logo />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        {savedAt ? (
          <p className="mb-4 text-[12px] text-muted-foreground">
            Progress saved to your account — sign out any time and pick up where you left off.
          </p>
        ) : null}
        <ol className="flex flex-wrap items-center gap-2" aria-label="Progress">
          {STEPS.map((label, index) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "tnum grid size-6 place-items-center rounded-full text-[11px] font-semibold",
                  index <= step
                    ? "bg-primary text-primary-foreground"
                    : "bg-elevated text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  "text-[12px]",
                  index === step ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {index < STEPS.length - 1 ? <span className="h-px w-6 bg-border" /> : null}
            </li>
          ))}
        </ol>

        <div ref={stepRef} className="panel mt-8 p-6">
          {step === 0 ? (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-[20px] font-semibold">
                  Tell us about the business
                </h1>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  Revora uses only what you enter here — nothing is invented.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-name">Business name</Label>
                <Input
                  id="o-name"
                  value={draft.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                  placeholder="Elite Mobile Detailing"
                />
                {draft.businessName ? (
                  <p className="text-[11px] text-muted-foreground">
                    Your Revora share link: {revoraShareAddress(slugPreview)}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="o-industry">Industry</Label>
                  <select
                    id="o-industry"
                    value={draft.industry}
                    onChange={(e) => set("industry", e.target.value)}
                    className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {INDUSTRIES.map((i) => (
                      <option key={i.name} value={i.name}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="o-city">City</Label>
                  <Input
                    id="o-city"
                    value={draft.city}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="Austin"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="o-state">State</Label>
                  <Input
                    id="o-state"
                    value={draft.state}
                    onChange={(e) => set("state", e.target.value)}
                    placeholder="TX"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-area">Areas you serve</Label>
                <Input
                  id="o-area"
                  value={draft.serviceArea}
                  onChange={(e) => set("serviceArea", e.target.value)}
                  placeholder="Austin, Round Rock, Cedar Park"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-about">Describe the business in your own words</Label>
                <Textarea
                  id="o-about"
                  rows={3}
                  value={draft.about}
                  onChange={(e) => set("about", e.target.value)}
                  placeholder="We come to you. Showroom-quality detailing, seven days a week."
                />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-[20px] font-semibold">What do you sell?</h1>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  Add each service you want on the website. Leave price blank if you quote per job.
                </p>
              </div>
              <div className="space-y-4">
                {draft.services.map((service, index) => (
                  <div key={index} className="rounded-md border border-border p-4">
                    <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                      <div className="space-y-1.5">
                        <Label htmlFor={`svc-${index}`}>Service name</Label>
                        <Input
                          id={`svc-${index}`}
                          value={service.name}
                          onChange={(e) =>
                            set(
                              "services",
                              draft.services.map((s, i) =>
                                i === index ? { ...s, name: e.target.value } : s,
                              ),
                            )
                          }
                          placeholder="Full interior + exterior detail"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`price-${index}`}>Starting at ($)</Label>
                        <Input
                          id={`price-${index}`}
                          inputMode="decimal"
                          value={service.price}
                          onChange={(e) =>
                            set(
                              "services",
                              draft.services.map((s, i) =>
                                i === index
                                  ? { ...s, price: e.target.value.replace(/[^0-9.]/g, "") }
                                  : s,
                              ),
                            )
                          }
                          placeholder="189"
                        />
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <Label htmlFor={`desc-${index}`}>What's included</Label>
                      <Textarea
                        id={`desc-${index}`}
                        rows={2}
                        value={service.description}
                        onChange={(e) =>
                          set(
                            "services",
                            draft.services.map((s, i) =>
                              i === index ? { ...s, description: e.target.value } : s,
                            ),
                          )
                        }
                      />
                    </div>
                    {draft.services.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() =>
                          set(
                            "services",
                            draft.services.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 className="size-4" /> Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => set("services", [...draft.services, emptyService()])}
              >
                <Plus className="size-4" /> Add another service
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-[20px] font-semibold">Brand and visuals</h1>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  Optional. Paste image links you already own — we never use stock claims about your
                  work.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="o-logo">Logo URL</Label>
                  <Input
                    id="o-logo"
                    value={draft.logoUrl}
                    onChange={(e) => set("logoUrl", e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="o-hero">Main photo URL</Label>
                  <Input
                    id="o-hero"
                    value={draft.heroImageUrl}
                    onChange={(e) => set("heroImageUrl", e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="o-primary">Primary colour</Label>
                  <Input
                    id="o-primary"
                    type="color"
                    value={draft.primaryColor}
                    onChange={(e) => set("primaryColor", e.target.value)}
                    className="h-10 p-1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="o-accent">Accent colour</Label>
                  <Input
                    id="o-accent"
                    type="color"
                    value={draft.accentColor}
                    onChange={(e) => set("accentColor", e.target.value)}
                    className="h-10 p-1"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-[20px] font-semibold">
                  How can customers reach you?
                </h1>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  These details power your call, text, email and form buttons.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="o-phone">Business phone</Label>
                  <Input
                    id="o-phone"
                    inputMode="tel"
                    value={draft.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="(555) 019-4420"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="o-email">Business email</Label>
                  <Input
                    id="o-email"
                    type="email"
                    value={draft.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="hello@yourbusiness.com"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="o-address">Address (optional)</Label>
                  <Input
                    id="o-address"
                    value={draft.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="o-hours">Hours</Label>
                  <Input
                    id="o-hours"
                    value={draft.hours}
                    onChange={(e) => set("hours", e.target.value)}
                    placeholder="Mon–Sat 8am–6pm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="o-site">Existing website (optional)</Label>
                  <Input
                    id="o-site"
                    value={draft.website}
                    onChange={(e) => set("website", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="o-ig">Instagram</Label>
                  <Input
                    id="o-ig"
                    value={draft.instagram}
                    onChange={(e) => set("instagram", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="o-fb">Facebook</Label>
                  <Input
                    id="o-fb"
                    value={draft.facebook}
                    onChange={(e) => set("facebook", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="o-gg">Google Business profile</Label>
                  <Input
                    id="o-gg"
                    value={draft.google}
                    onChange={(e) => set("google", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-[20px] font-semibold">Proof and credentials</h1>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  Only what you provide gets published. Revora never writes fake reviews or awards.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="o-years">Years in business</Label>
                  <Input
                    id="o-years"
                    inputMode="numeric"
                    value={draft.yearsInBusiness}
                    onChange={(e) => set("yearsInBusiness", e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="o-cert">Licences / certifications</Label>
                  <Input
                    id="o-cert"
                    value={draft.certifications}
                    onChange={(e) => set("certifications", e.target.value)}
                    placeholder="Licensed & insured, IDA certified"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-awards">Awards or recognition</Label>
                <Input
                  id="o-awards"
                  value={draft.awards}
                  onChange={(e) => set("awards", e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <Label>Customer testimonials</Label>
                {draft.testimonials.map((t, index) => (
                  <div key={index} className="rounded-md border border-border p-4">
                    <Input
                      value={t.name}
                      onChange={(e) =>
                        set(
                          "testimonials",
                          draft.testimonials.map((x, i) =>
                            i === index ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="Customer name"
                    />
                    <Textarea
                      className="mt-2"
                      rows={2}
                      value={t.text}
                      onChange={(e) =>
                        set(
                          "testimonials",
                          draft.testimonials.map((x, i) =>
                            i === index ? { ...x, text: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="What they actually said"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        set(
                          "testimonials",
                          draft.testimonials.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    set("testimonials", [...draft.testimonials, { name: "", text: "" }])
                  }
                >
                  <Plus className="size-4" /> Add testimonial
                </Button>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-[20px] font-semibold">What should visitors do?</h1>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  Pick every action that matters. The first one becomes your main button.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {WEBSITE_GOALS.map((goal) => {
                  const active = draft.goals.includes(goal.value);
                  return (
                    <button
                      key={goal.value}
                      type="button"
                      onClick={() => toggleGoal(goal.value)}
                      className={cn(
                        "cursor-pointer rounded-md border p-4 text-left transition-colors",
                        active ? "border-primary bg-primary/5" : "border-border hover:bg-elevated",
                      )}
                      aria-pressed={active}
                    >
                      <p className="text-[14px] font-medium">{goal.label}</p>
                      <p className="mt-1 text-[12px] text-muted-foreground">Button: {goal.cta}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[12px] text-muted-foreground">
                Next: Revora assembles your website from these answers, then you review and approve
                it before anything goes live.
              </p>
            </div>
          ) : null}

          {error ? <div className="mt-5">{<ErrorNote message={error} />}</div> : null}

          <div className="mt-7 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || busy}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                variant="signal"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canContinue || busy}
              >
                Continue <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="signal" onClick={finish} disabled={busy || !canContinue}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null} Build my website
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
