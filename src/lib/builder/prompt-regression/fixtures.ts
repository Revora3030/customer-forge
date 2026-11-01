/**
 * Fixed, clearly fictional sample businesses for the prompt regression suite.
 *
 * Every phone number uses the reserved 555-01xx block and every email uses
 * example.com, so nothing here can be mistaken for a real business. Do not
 * replace these with real businesses. To cover a new trade, add one entry; the
 * stubbed suite and the optional live run both pick it up automatically.
 */
export type PromptFixture = {
  id: string;
  businessName: string;
  industry: string;
  city: string;
  region: string;
  serviceArea: string;
  phone: string;
  email: string;
  description: string;
  services: string[];
  /** Prices the owner actually supplied. Empty means no price may appear in any output. */
  prices: string[];
  yearsInBusiness: number | null;
  conversionGoal: string;
  /** True when only name, trade and place are known (the prompts' sparse-facts path). */
  thin: boolean;
};

export const PROMPT_FIXTURES: PromptFixture[] = [
  {
    id: "plumber",
    businessName: "Demo Plumbing & Drain",
    industry: "Plumber",
    city: "Exampleville",
    region: "NC",
    serviceArea: "Exampleville and nearby towns",
    phone: "(555) 010-0101",
    email: "hello@demo-plumbing.example.com",
    description:
      "Demo Plumbing & Drain is a small plumbing crew that fixes leaks, clears blocked drains and replaces water heaters. We answer the phone ourselves and handle emergency repairs.",
    services: ["Leak repair", "Drain cleaning", "Water heater replacement", "Emergency repairs"],
    prices: [],
    yearsInBusiness: null,
    conversionGoal: "Call now",
    thin: false,
  },
  {
    id: "hvac",
    businessName: "Sample Comfort Heating & Air",
    industry: "HVAC contractor",
    city: "Testford",
    region: "TX",
    serviceArea: "Testford and surrounding neighborhoods",
    phone: "(555) 010-0102",
    email: "service@sample-comfort.example.com",
    description:
      "Sample Comfort Heating & Air installs and repairs furnaces and air conditioners for homes. Call us when the system stops working or when it is time for a tune-up.",
    services: ["Air conditioner repair", "Furnace repair", "System installation", "Seasonal tune-ups"],
    prices: [],
    yearsInBusiness: null,
    conversionGoal: "Call for service",
    thin: false,
  },
  {
    id: "roofer",
    businessName: "Fictional Peak Roofing",
    industry: "Roofer",
    city: "Mockton",
    region: "OH",
    serviceArea: "Mockton and the county around it",
    phone: "(555) 010-0103",
    email: "quotes@fictional-peak.example.com",
    description:
      "Fictional Peak Roofing repairs and replaces residential roofs. We look at the roof, explain what we found and send a written quote.",
    services: ["Roof repair", "Roof replacement", "Gutter installation", "Storm damage inspection"],
    prices: [],
    yearsInBusiness: 12,
    conversionGoal: "Request a free quote",
    thin: false,
  },
  {
    id: "landscaper",
    businessName: "Placeholder Green Landscaping",
    industry: "Landscaper",
    city: "Sampleburg",
    region: "OR",
    serviceArea: "Sampleburg and nearby suburbs",
    phone: "(555) 010-0104",
    email: "info@placeholder-green.example.com",
    description:
      "Placeholder Green Landscaping mows, plants and designs outdoor spaces for homeowners. Tell us about your yard and we will come to look at it.",
    services: ["Lawn mowing", "Garden design", "Tree and shrub planting", "Seasonal cleanups"],
    prices: [],
    yearsInBusiness: null,
    conversionGoal: "Get a yard visit",
    thin: false,
  },
  {
    id: "cleaner",
    businessName: "Specimen Spotless Cleaning",
    industry: "House cleaner",
    city: "Demoville",
    region: "FL",
    serviceArea: "Demoville and nearby areas",
    phone: "(555) 010-0105",
    email: "book@specimen-spotless.example.com",
    description:
      "Specimen Spotless Cleaning cleans homes on a regular schedule or as a one-time visit. Standard cleaning starts at $140 per visit.",
    services: ["Standard home cleaning", "Deep cleaning", "Move-out cleaning"],
    prices: ["$140"],
    yearsInBusiness: null,
    conversionGoal: "Book a clean",
    thin: false,
  },
  {
    id: "electrician",
    businessName: "Sandbox Electric",
    industry: "Electrician",
    city: "Fixtureton",
    region: "WA",
    serviceArea: "Fixtureton and nearby communities",
    phone: "(555) 010-0106",
    email: "jobs@sandbox-electric.example.com",
    description:
      "Sandbox Electric handles wiring, panel upgrades and lighting for homes and small shops. Call to describe the job and we will schedule a visit.",
    services: ["Panel upgrades", "Rewiring", "Lighting installation", "Outlet and switch repair"],
    prices: [],
    yearsInBusiness: null,
    conversionGoal: "Call to schedule",
    thin: false,
  },
  {
    id: "auto-detailer",
    businessName: "Mock Shine Mobile Detailing",
    industry: "Auto detailer",
    city: "Stubtown",
    region: "GA",
    serviceArea: "Stubtown, we come to you",
    phone: "(555) 010-0107",
    email: "hello@mock-shine.example.com",
    description:
      "Mock Shine Mobile Detailing cleans and protects cars at your home or workplace. Text or call to pick a time.",
    services: ["Interior detailing", "Exterior wash and wax", "Full detail", "Paint protection"],
    prices: [],
    yearsInBusiness: null,
    conversionGoal: "Call or text to book",
    thin: false,
  },
  {
    id: "handyman-sparse",
    businessName: "Dummy Handyman Services",
    industry: "Handyman",
    city: "Fakeham",
    region: "VA",
    serviceArea: "Fakeham",
    phone: "(555) 010-0108",
    email: "hello@dummy-handyman.example.com",
    description: "",
    services: [],
    prices: [],
    yearsInBusiness: null,
    conversionGoal: "Call now",
    thin: true,
  },
];

/** Everything the owner supplied, as one lowercase string. Output may only restate this. */
export function inputCorpus(fixture: PromptFixture): string {
  return [
    fixture.businessName,
    fixture.industry,
    fixture.city,
    fixture.region,
    fixture.serviceArea,
    fixture.phone,
    fixture.email,
    fixture.description,
    fixture.conversionGoal,
    ...fixture.services,
    ...fixture.prices,
    fixture.yearsInBusiness === null ? "" : `${fixture.yearsInBusiness} years in business`,
  ]
    .join("\n")
    .toLowerCase();
}
