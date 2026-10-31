const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function phoneLooksValid(value: string): boolean {
  return value.replace(/\D/g, "").length >= 7;
}

export function emailLooksValid(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Needs at least one working contact method, and anything typed must look right. */
export function contactStepValid(phone: string, email: string): boolean {
  const hasPhone = phone.trim().length > 0;
  const hasEmail = email.trim().length > 0;
  if (!hasPhone && !hasEmail) return false;
  if (hasPhone && !phoneLooksValid(phone)) return false;
  if (hasEmail && !emailLooksValid(email)) return false;
  return true;
}

/** Why Continue is disabled, in plain words. Empty when there is nothing to say. */
export function continueHint(
  step: number,
  draft: { businessName: string; city: string; phone: string; email: string; goals: unknown[] },
): string {
  if (step === 0) return "Add your business name and city to continue.";
  if (step === 3) {
    if (!draft.phone.trim() && !draft.email.trim()) return "Add a phone number or an email so customers can reach you.";
    if (draft.phone.trim() && !phoneLooksValid(draft.phone)) return "That phone number looks too short. Include the area code.";
    if (draft.email.trim() && !emailLooksValid(draft.email)) return "That email doesn't look right. Check it for typos, for example name@business.com.";
  }
  if (step === 5) return "Pick at least one thing you want visitors to do.";
  return "";
}
