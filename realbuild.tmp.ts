import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { refineFirstBuildWithCollective } from "@/lib/builder/collective-first-build.server";
import { fallbackBrief, fallbackCopy } from "@/lib/site-engine.server";
import { compileFirstBuildCreativeDirection } from "@/lib/builder/first-build-creative";
import { synthesizeNativeFirstBuild } from "@/lib/builder/native-first-build";
import { generateWebsitePlan } from "@/lib/website-plan";

const orgId = process.argv[2]!;
const db = supabaseAdmin;
const org = (await db.from("organizations").select("*").eq("id", orgId).single()).data as any;
const p = ((await db.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle()).data ?? {}) as any;
const services = ((await db.from("services").select("*").eq("organization_id", orgId)).data ?? []) as any[];

const facts = {
  businessName: org.name, industry: org.industry, description: p.description ?? null,
  city: p.city ?? null, state: p.state ?? null, region: p.state ?? null,
  serviceArea: p.service_area ?? null, phone: p.phone ?? null, email: p.email ?? null,
  yearsInBusiness: p.years_in_business ?? null, services,
  goals: [], hasHours: Boolean(p.hours), testimonialCount: 0,
};
const brief = fallbackBrief(facts as any);
const copy = fallbackCopy({ ...facts, ctaLabel: "Get a quote" } as any, brief);
const creative = compileFirstBuildCreativeDirection({
  organizationId: orgId, businessName: org.name, industry: org.industry,
  description: p.description ?? null, city: p.city ?? null, state: p.state ?? null,
  serviceArea: p.service_area ?? null, phone: p.phone ?? null, email: p.email ?? null,
  yearsInBusiness: p.years_in_business ?? null, services: services as any, goals: [],
  conversionGoal: org.conversion_goal ?? null, photoCount: 0, testimonialCount: 0,
  bookableServices: 0, hasHours: Boolean(p.hours),
});
const dnaFacts = { businessName: org.name, industry: org.industry, description: p.description ?? null,
  city: p.city ?? null, region: p.state ?? null, serviceArea: p.service_area ?? null,
  phone: p.phone ?? null, email: p.email ?? null, yearsInBusiness: p.years_in_business ?? null,
  services: services.map((s) => s.name), hasPrices: services.some((s) => s.price != null || s.starting_price != null),
  testimonialCount: 0, goals: [], hasHours: Boolean(p.hours) };

const t0 = Date.now();
const refined = await refineFirstBuildWithCollective({ organizationId: orgId, facts: dnaFacts as any, brief, copy, creative });
console.log("ms", Date.now() - t0, "changed", refined.changed, "cost µ¢", refined.totalCostMicrocents);
for (const pass of refined.passes)
  console.log(` ${pass.tier}/${pass.purpose} model=${pass.model} used=${pass.used} skipped=${pass.skipped} accepted=${pass.acceptedFields.join(",")} rejected=${pass.rejected.map((r) => r.field + ":" + r.reason).join(" | ")}`);
console.log("--- before ---\n", copy.heroHeadline, "\n", copy.intro?.slice(0, 200));
console.log("--- after ---\n", refined.copy.heroHeadline, "\n", refined.copy.intro?.slice(0, 200));
const plan = generateWebsitePlan({ businessName: org.name, industry: org.industry ?? "", description: p.description ?? null,
  city: p.city ?? null, state: p.state ?? null, serviceArea: p.service_area ?? null, phone: p.phone ?? null,
  email: p.email ?? null, goals: [] as never, services: services as any, photoCount: 0, testimonialCount: 0,
  hasCredentials: false, hasHours: Boolean(p.hours), socialLinks: [] as any });
const synth = synthesizeNativeFirstBuild({ facts: dnaFacts as any, language: "English", brief, plan, copy: refined.copy, creative });
console.log("post-refine adversarial gate valid:", synth.valid, synth.findings.map((f) => f.code));
