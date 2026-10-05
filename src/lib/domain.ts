import type { Database } from "@/integrations/supabase/types";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type ConversionGoal = Database["public"]["Enums"]["conversion_goal"];

export const LEAD_STATUSES: { value: LeadStatus; label: string; tone: Tone }[] = [
  { value: "new", label: "New", tone: "signal" },
  { value: "contacted", label: "Contacted", tone: "neutral" },
  { value: "qualified", label: "Qualified", tone: "info" },
  { value: "quoted", label: "Quoted", tone: "attention" },
  { value: "booked", label: "Booked", tone: "signal" },
  { value: "completed", label: "Completed", tone: "neutral" },
  { value: "lost", label: "Lost", tone: "danger" },
];

export type Tone = "signal" | "attention" | "info" | "neutral" | "danger";

export const leadStatusMeta = (status: LeadStatus) =>
  LEAD_STATUSES.find((s) => s.value === status) ?? LEAD_STATUSES[0]!;

/**
 * The five-stage CRM pipeline the product promises: New → Contacted → Quoted →
 * Won → Closed. It is a read model over the stored `lead_status` values, so no
 * existing lead is migrated or relabelled in the database:
 *  - qualified sits inside "Contacted" (still being worked),
 *  - booked and completed are "Won",
 *  - lost is "Closed" (closed without a sale).
 */
export const CRM_STAGES = [
  { key: "new", label: "New", statuses: ["new"] },
  { key: "contacted", label: "Contacted", statuses: ["contacted", "qualified"] },
  { key: "quoted", label: "Quoted", statuses: ["quoted"] },
  { key: "won", label: "Won", statuses: ["booked", "completed"] },
  { key: "closed", label: "Closed", statuses: ["lost"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly LeadStatus[] }[];

export type CrmStageKey = (typeof CRM_STAGES)[number]["key"];

/** The pipeline stage a stored lead status belongs to. */
export function crmStageOf(status: LeadStatus | null | undefined): CrmStageKey {
  const stage = CRM_STAGES.find((s) => (s.statuses as readonly string[]).includes(status ?? "new"));
  return stage?.key ?? "new";
}

/** The status written when a lead is moved into a stage (first status of that stage). */
export function statusForCrmStage(stage: CrmStageKey): LeadStatus {
  return CRM_STAGES.find((s) => s.key === stage)!.statuses[0];
}

export const APPOINTMENT_STATUSES: { value: AppointmentStatus; label: string; tone: Tone }[] = [
  { value: "pending", label: "Pending", tone: "attention" },
  { value: "confirmed", label: "Confirmed", tone: "signal" },
  { value: "completed", label: "Completed", tone: "neutral" },
  { value: "cancelled", label: "Cancelled", tone: "danger" },
  { value: "no_show", label: "No-show", tone: "danger" },
];

export const appointmentStatusMeta = (status: AppointmentStatus) =>
  APPOINTMENT_STATUSES.find((s) => s.value === status) ?? APPOINTMENT_STATUSES[0]!;

export const ROLES: { value: AppRole; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Full control of the business and billing." },
  { value: "admin", label: "Admin", description: "Everything except billing ownership." },
  {
    value: "manager",
    label: "Manager",
    description: "Manage settings, services and the team's work.",
  },
  { value: "staff", label: "Staff", description: "Work leads, bookings and customers." },
  { value: "viewer", label: "Viewer", description: "Read-only access to results." },
];

export const CONVERSION_GOALS: { value: ConversionGoal; label: string; description: string }[] = [
  {
    value: "calls",
    label: "Phone calls",
    description: "Make the phone ring. Call buttons lead everywhere.",
  },
  {
    value: "quotes",
    label: "Quote requests",
    description: "Push visitors into the instant estimate.",
  },
  {
    value: "bookings",
    label: "Bookings",
    description: "Get appointments on the calendar directly.",
  },
  {
    value: "consultations",
    label: "Consultations",
    description: "Book a call before quoting the job.",
  },
  {
    value: "purchases",
    label: "Website purchases",
    description: "Sell fixed-price packages online.",
  },
];

export const INDUSTRIES = [
  {
    name: "Auto Detailing",
    emphasis: "Before/after proof, then an instant estimate.",
  },
  { name: "Hair Stylists", emphasis: "Portfolio first, booking one tap away." },
  { name: "Barbers", emphasis: "Recurring bookings and walk-in slots." },
  {
    name: "Landscaping",
    emphasis: "Project gallery plus a property estimate.",
  },
  {
    name: "Pressure Washing",
    emphasis: "Square-footage pricing and fast quotes.",
  },
  { name: "Cleaning", emphasis: "Service packages with online booking." },
  {
    name: "Contractors",
    emphasis: "Trust signals and a quote request path.",
  },
  { name: "HVAC", emphasis: "Emergency calls and maintenance plans." },
  { name: "Plumbing", emphasis: "Call-now urgency and service areas." },
  {
    name: "Roofing",
    emphasis: "Inspection requests and financing questions.",
  },
  { name: "Photography", emphasis: "Galleries that lead into consultations." },
  { name: "Beauty", emphasis: "Treatment menus and appointment booking." },
  { name: "Med Spa", emphasis: "Consultation requests and treatment pages." },
  { name: "Fitness", emphasis: "Trial signups and class scheduling." },
  {
    name: "Home Services",
    emphasis: "Multi-service quoting with service areas.",
  },
  {
    name: "Professional Services",
    emphasis: "Consultations and credibility.",
  },
] as const;

export const LEAD_SOURCES = [
  "google",
  "instagram",
  "facebook",
  "tiktok",
  "direct",
  "referral",
  "website",
  "qr_code",
] as const;

export const sourceLabel = (source: string | null | undefined) => {
  const map: Record<string, string> = {
    google: "Google",
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
    direct: "Direct",
    referral: "Referral",
    website: "Website",
    qr_code: "QR code",
  };
  return map[source ?? ""] ?? "Unknown";
};

export const CUSTOMER_TAGS = ["VIP", "Repeat", "New", "High Value", "Needs Follow-Up"] as const;

export const AUTOMATION_TRIGGERS = [
  { value: "lead_created", label: "New lead captured" },
  { value: "lead_uncontacted", label: "Lead still uncontacted" },
  { value: "quote_requested", label: "Quote requested" },
  { value: "booking_created", label: "Booking created" },
  { value: "appointment_upcoming", label: "Appointment approaching" },
  { value: "appointment_completed", label: "Appointment completed" },
  { value: "customer_inactive", label: "Customer went inactive" },
] as const;

export const DATE_RANGES = [
  { value: "1", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

/** Owners, admins and managers may change publishing, domains and billing-facing settings. */
export const canManage = (role: AppRole) =>
  role === "owner" || role === "admin" || role === "manager";

export function industrySlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
