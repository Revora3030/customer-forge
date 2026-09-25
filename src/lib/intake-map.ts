/**
 * One-input business intake.
 *
 * The client supplies each fact ONCE. This map is the contract for where that
 * fact is reused, so the UI can show the owner exactly what a single edit
 * changes across their whole system — and so nothing ever asks twice.
 */

export type IntakeStore = "organization" | "profile" | "seo";

export type IntakeField = {
  key: string;
  label: string;
  help: string;
  store: IntakeStore;
  /** Column in the store (organizations / business_profiles), or SEO key. */
  column: string;
  kind: "text" | "textarea" | "goal";
  required: boolean;
  /** Every system that reads this fact. */
  usedBy: string[];
};

export const INTAKE_FIELDS: IntakeField[] = [
  {
    key: "name",
    label: "Business name",
    help: "Exactly as customers know you.",
    store: "organization",
    column: "name",
    kind: "text",
    required: true,
    usedBy: [
      "Website pages",
      "Page titles & SEO",
      "Emails & notifications",
      "Quotes & invoices",
      "Reviews requests",
    ],
  },
  {
    key: "description",
    label: "What you do",
    help: "Two or three sentences: the work, who it's for, what makes you different.",
    store: "profile",
    column: "description",
    kind: "textarea",
    required: false,
    usedBy: [
      "AI copywriting",
      "Home & about pages",
      "Search description",
      "Offers",
      "Future AI upgrades",
    ],
  },
  {
    key: "phone",
    label: "Phone number",
    help: "Used for tap-to-call, text paths and lead alerts.",
    store: "profile",
    column: "phone",
    kind: "text",
    required: false,
    usedBy: [
      "Call & text CTAs",
      "Sticky call bar",
      "Lead alerts",
      "Booking confirmations",
      "Local SEO",
    ],
  },
  {
    key: "email",
    label: "Email",
    help: "Where enquiries, bookings and receipts are sent.",
    store: "profile",
    column: "email",
    kind: "text",
    required: false,
    usedBy: ["Contact forms", "Lead alerts", "Automated follow-up", "Payment receipts"],
  },
  {
    key: "city",
    label: "Main city",
    help: "The town your best customers search from.",
    store: "profile",
    column: "city",
    kind: "text",
    required: false,
    usedBy: ["Local SEO", "Area pages", "Page titles", "Booking travel rules"],
  },
  {
    key: "service_area",
    label: "Areas you cover",
    help: "Comma-separated towns or postcodes.",
    store: "profile",
    column: "service_area",
    kind: "text",
    required: false,
    usedBy: ["Area pages", "Local SEO", "Quote coverage checks", "Objection handling"],
  },
  {
    key: "primary_goal",
    label: "Main thing a visitor should do",
    help: "Revora builds every page around this one action.",
    store: "seo",
    column: "primary_cta_label",
    kind: "goal",
    required: true,
    usedBy: [
      "Conversion engine",
      "Every call-to-action",
      "Forms & booking",
      "CRM lead routing",
      "Analytics goals",
    ],
  },
];

export type IntakeValues = Record<string, string>;

/** Which required facts are still blank — the only things Revora asks for. */
export function intakeGaps(values: IntakeValues) {
  return INTAKE_FIELDS.filter((field) => field.required && !(values[field.key] ?? "").trim());
}

export function intakeCompleteness(values: IntakeValues) {
  const total = INTAKE_FIELDS.length;
  const filled = INTAKE_FIELDS.filter((field) => (values[field.key] ?? "").trim()).length;
  return { filled, total, percent: Math.round((filled / total) * 100) };
}
