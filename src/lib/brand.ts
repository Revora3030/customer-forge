/**
 * Revora company (platform) identity and contact details.
 *
 * IMPORTANT: these values belong to the Revora platform only. Client business
 * websites must always use their own organization/tenant contact settings —
 * never these constants.
 *
 * When a verified custom-domain mailbox (e.g. hello@revora.com) is configured,
 * update `email` here only; every CTA reads from this module.
 */
export const REVORA = {
  name: "REVORA",
  trademark: "REVORA™",
  tagline: "The Business Growth Operating System",
  primaryMessage: "Turn More Opportunities Into Customers.",
  founder: { name: "Adam Dancy", role: "Founder, Revora" },
  email: "hello@revoragrowthsystems.com",
  phone: "9196226620",
  phoneDisplay: "(919) 622-6620",
} as const;

export const revoraTel = `tel:+1${REVORA.phone}`;

export function revoraMailto(subject?: string) {
  return subject
    ? `mailto:${REVORA.email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${REVORA.email}`;
}

export const MAIL_SUBJECTS = {
  demo: "Revora Demo Request",
  inquiry: "Revora Business Inquiry",
  support: "Revora Support Request",
} as const;
