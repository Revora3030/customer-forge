/**
 * Where each business fact shown on a site comes from. Facts are only ever
 * owner-entered (business profile / services list) or missing; nothing is
 * filled in by guessing, so missing facts are flagged before publishing.
 */
export type FactSource = "owner" | "missing";
export type FactSourceRow = { key: string; label: string; source: FactSource; value: string | null };

export type FactSourceInput = {
  businessName: string | null;
  services: string[];
  city: string | null;
  serviceArea: string | null;
  email: string | null;
  phone: string | null;
};

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export function buildFactSources(input: FactSourceInput): FactSourceRow[] {
  const area = clean(input.serviceArea) ?? clean(input.city);
  const contact = clean(input.email) ?? clean(input.phone);
  const services = input.services.map((s) => s.trim()).filter(Boolean);
  const row = (key: string, label: string, value: string | null): FactSourceRow => ({
    key,
    label,
    value,
    source: value ? "owner" : "missing",
  });
  return [
    row("name", "Business name", clean(input.businessName)),
    row("services", "Services", services.length ? services.slice(0, 4).join(", ") + (services.length > 4 ? ` +${services.length - 4}` : "") : null),
    row("area", "Service area", area),
    row("contact", "Contact", contact),
  ];
}

export function missingFactCount(rows: FactSourceRow[]): number {
  return rows.filter((r) => r.source === "missing").length;
}
