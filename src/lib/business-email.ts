/**
 * The email address visitors see on a generated website.
 *
 * Owners often sign up with a personal address. The intake therefore asks for an
 * optional "Business email shown on your site"; when it is filled in (and looks
 * like an email) it becomes the public contact email, otherwise the account email
 * is used. Stored in the existing business_profiles.email column, so no migration.
 */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const cleanEmail = (value: unknown): string => (typeof value === "string" ? value.trim().toLowerCase().slice(0, 160) : "");

export const isEmailShape = (value: string): boolean => EMAIL.test(value);

/** Business email when valid, else the account email, else null. */
export function publicContactEmail(businessEmail: unknown, accountEmail: unknown): string | null {
  const business = cleanEmail(businessEmail);
  if (business && isEmailShape(business)) return business;
  const account = cleanEmail(accountEmail);
  return account && isEmailShape(account) ? account : null;
}
