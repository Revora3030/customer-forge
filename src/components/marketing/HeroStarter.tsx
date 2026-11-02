import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Wand2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/auth-session";
import { SIGN_UP_SEARCH } from "@/components/marketing/AuthButtons";
import { saveStarter } from "@/components/marketing/hero-starter-utils";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import { canonicalMapsLink, looksLikeMapsLink, parseMapsLink } from "@/lib/maps-link";
import { GROWTH_SYSTEM } from "@/lib/offer";

const INDUSTRY_OPTIONS = [
  "Auto Detailing",
  "Plumbing",
  "HVAC",
  "Landscaping",
  "Dental Clinic",
  "Law Firm",
  "Fitness Studio",
  "Roofing",
  "Electrician",
  "Cleaning Service",
  "Restaurant",
  "Real Estate",
  "Other",
] as const;

const SERVICE_BY_INDUSTRY: Record<string, readonly string[]> = {
  "Auto Detailing": ["Ceramic Coating", "Interior Detail", "Full Detail", "Paint Correction"],
  Plumbing: ["Drain Cleaning", "Leak Repair", "Water Heater", "Emergency Service"],
  HVAC: ["AC Repair", "Heating Install", "Maintenance Plan", "Air Quality"],
  Landscaping: ["Lawn Care", "Hardscaping", "Garden Design", "Tree Service"],
  "Dental Clinic": ["Cleanings", "Cosmetic Dentistry", "Implants", "Emergency Care"],
  "Law Firm": ["Consultation", "Estate Planning", "Business Law", "Personal Injury"],
  "Fitness Studio": ["Personal Training", "Group Classes", "Nutrition Coaching", "Membership"],
  Roofing: ["Roof Repair", "Replacement", "Inspection", "Emergency Tarp"],
  Electrician: ["Wiring", "Panel Upgrade", "Lighting", "Emergency Service"],
  "Cleaning Service": ["Deep Clean", "Recurring Service", "Move In/Out", "Commercial"],
  Restaurant: ["Dine In", "Catering", "Private Events", "Takeout"],
  "Real Estate": ["Buying", "Selling", "Property Management", "Consultation"],
};

/**
 * Illustrative mini website preview, not an AI-generated customer site.
 * The name/industry reflect input; example services are clearly labeled.
 * Never invent credentials, insurance, ratings or reviews for the business.
 */
function InstantPreview({ businessName, industry }: { businessName: string; industry: string }) {
  const name = businessName.trim() || "Your Business";
  const services = industry ? (SERVICE_BY_INDUSTRY[industry] ?? []) : [];

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-background shadow-lg">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-elevated px-3 py-2">
        <span className="size-2.5 rounded-full bg-destructive/60" />
        <span className="size-2.5 rounded-full bg-primary/50" />
        <span className="size-2.5 rounded-full bg-success/60" />
        <span className="ml-2 truncate text-[11px] text-muted-foreground">
          {name.toLowerCase().replace(/\s+/g, "")}.revoragrowthsystems.com
        </span>
      </div>
      {/* Mini hero banner */}
      <div className="relative bg-gradient-to-br from-primary/15 via-background to-background p-4">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-primary" aria-hidden="true" />
          <span className="text-[10px] font-semibold tracking-wide text-primary uppercase">
            {industry || "Your Industry"}
          </span>
        </div>
        <p className="mt-2 font-display text-[17px] leading-tight font-semibold text-foreground">
          {name}
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
          Professional {industry ? industry.toLowerCase() : "services"} you can trust.
        </p>
        <div className="mt-3 flex gap-1.5">
          <span className="rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">
            Get a Quote
          </span>
          <span className="rounded-md border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            Book Now
          </span>
        </div>
      </div>
      {/* Make the sample's status explicit, without fabricated social proof. */}
      <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2">
        <span className="text-[10.5px] text-muted-foreground">
          Illustrative layout · your actual site is AI-designed
        </span>
      </div>
      {/* Services card */}
      {services.length > 0 ? (
        <div className="border-t border-border/60 p-3">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Example services
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {services.slice(0, 4).map((service) => (
              <div
                key={service}
                className="rounded-md border border-border/60 bg-card/50 px-2 py-1.5 text-[10.5px] font-medium text-foreground"
              >
                {service}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The homepage's first action: describe the business, then sign up with those
 * words already carried into onboarding so the AI team can start building.
 *
 * Pillar 2: now an instant interactive playground — visitors type a business
 * name and pick an industry, and a live mini website canvas renders in real
 * time from Revora's design token system. One click carries their input into
 * the intake onboarding flow.
 */
export function HeroStarter({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const { user } = useSession();
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [about, setAbout] = useState("");
  const [website, setWebsite] = useState("");
  const [websiteError, setWebsiteError] = useState<string | null>(null);

  // The button always works: whatever the visitor typed is carried into
  // signup and onboarding, and nothing typed is required to start.
  const start = (e: React.FormEvent) => {
    e.preventDefault();
    // An optional current-website address is checked and tidied here; the
    // server import re-checks it before anything is fetched.
    let site = "";
    const mapsLink = looksLikeMapsLink(website);
    if (mapsLink) {
      // A Google Maps link is kept as a short link for onboarding's Maps box,
      // which shows the name and map pin for the owner to confirm. Nothing is
      // fetched from Google here.
      const parsed = parseMapsLink(website);
      if (!parsed.ok) {
        setWebsiteError(parsed.message);
        return;
      }
      site = parsed.kind === "place" ? (canonicalMapsLink(parsed.fields) ?? "") : website.trim();
      if (site.length > 200) {
        setWebsiteError("That link is too long. Use the Share, Copy link option in Google Maps.");
        return;
      }
    } else if (website.trim()) {
      const checked = normalizeWebsiteUrl(website);
      if (!checked.ok) {
        setWebsiteError(checked.message);
        return;
      }
      site = checked.url;
    }
    setWebsiteError(null);
    saveStarter({
      businessName: businessName.trim(),
      about: about.trim(),
      industry: industry === "Other" ? "" : industry,
      website: site,
      wantsImport: site.length > 3 && !mapsLink,
    });
    if (user) void navigate({ to: "/get-started" });
    else void navigate({ to: "/auth", search: SIGN_UP_SEARCH });
  };

  const preview = useMemo(
    () => <InstantPreview businessName={businessName} industry={industry} />,
    [businessName, industry],
  );

  return (
    <form
      onSubmit={start}
      className={`rounded-2xl border border-primary/30 bg-card/80 p-4 shadow-lg backdrop-blur-md ${className}`}
      aria-label="Start building your website"
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <Wand2 className="size-4 text-primary" aria-hidden="true" />
        Tell the AI about your business — it starts building right after sign-up
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="sr-only" htmlFor="starter-name">
            Business name
          </label>
          <Input
            id="starter-name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Business name (e.g. Apex Auto Detail)"
            maxLength={120}
            autoComplete="organization"
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="starter-industry">
            Industry
          </label>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger id="starter-industry" className="h-11 w-full">
              <SelectValue placeholder="Select an industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-2">
        <label className="sr-only" htmlFor="starter-website">
          Your current website (optional)
        </label>
        <Input
          id="starter-website"
          value={website}
          onChange={(e) => {
            setWebsite(e.target.value);
            if (websiteError) setWebsiteError(null);
          }}
          placeholder="Have a website or Google Maps link? Paste it (optional)"
          maxLength={2000}
          inputMode="url"
          autoComplete="url"
          aria-invalid={websiteError ? true : undefined}
          aria-describedby={websiteError ? "starter-website-error" : undefined}
        />
        {websiteError ? (
          <p id="starter-website-error" role="alert" className="mt-1 text-[12px] text-destructive">
            {websiteError}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="signal" size="lg" className="mt-3 w-full" data-hero-cta>
        {website.trim().length > 3 && !looksLikeMapsLink(website) ? "Upgrade my website free" : "Start free"} —{" "}
        {GROWTH_SYSTEM.fullAccessWindow}, no card{" "}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
      <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
        No card to start · you review everything before it goes live
      </p>
      <label className="sr-only" htmlFor="starter-about">
        What your business does
      </label>
      <Textarea
        id="starter-about"
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        placeholder="Optional: what you do, who you serve and where"
        maxLength={1000}
        rows={2}
        className="mt-3 resize-none"
      />
      {/* Live instant preview canvas: below the button so the button stays above the fold. */}
      <div className="mt-3 hidden sm:block">{preview}</div>
    </form>
  );
}
