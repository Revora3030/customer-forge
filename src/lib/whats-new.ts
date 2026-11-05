/**
 * Public "What's new" entries (LOV-9).
 *
 * Rule: add an entry only after the change is merged AND published live by
 * Manager in Lovable. `published: true` is required; a test fails without it.
 * Dates are the publish date in America/New_York. One plain sentence, no PR
 * numbers or internal names, nothing about unreleased work, credits, or
 * private business numbers.
 *
 * Source for the 2026-10-31 entries: Manager's publish of RevoraGrowth at
 * 10:05 PM ET on Oct 31, 2026, which included these changes (CLAIMS.md). The public
 * ones were also confirmed on the live site.
 */
export interface WhatsNewEntry {
  id: string;
  /** Publish date, YYYY-MM-DD in America/New_York. */
  date: string;
  text: string;
  published: true;
}

export const WHATS_NEW: readonly WhatsNewEntry[] = [
  { id: "pricing-trial-clarity", date: "2026-10-31", published: true, text: "The pricing page now explains the difference between the 3-day trial and your first free month." },
  { id: "get-started-preview", date: "2026-10-31", published: true, text: "Getting started takes three quick fields, and you see a free draft preview of your site before you sign up." },
  { id: "google-sign-in", date: "2026-10-31", published: true, text: "You can now sign up and sign in with Google." },
  { id: "what-revora-replaces", date: "2026-10-31", published: true, text: "The home and pricing pages show which kinds of tools Revora can replace." },
  { id: "send-test-lead", date: "2026-10-31", published: true, text: "While you are getting set up, you can send yourself a test lead to see exactly what a lead alert looks like." },
  { id: "booking-link", date: "2026-10-31", published: true, text: "Add your own booking link in Settings and your site shows a Book online link." },
  { id: "review-kit", date: "2026-10-31", published: true, text: "A new Get more reviews card on your dashboard builds your Google review link, with a QR code you can download." },
];

export const WHATS_NEW_SEEN_KEY = "revora:whats-new-seen";

/** Newest first. */
export function publishedEntries(entries: readonly WhatsNewEntry[] = WHATS_NEW): WhatsNewEntry[] {
  return entries.filter((e) => e.published === true).slice().sort((a, b) => b.date.localeCompare(a.date));
}

export function latestEntryDate(entries: readonly WhatsNewEntry[] = WHATS_NEW): string | null {
  return publishedEntries(entries)[0]?.date ?? null;
}

/** True when an entry is newer than the date the owner last opened What's new. */
export function hasUnreadEntry(lastSeen: string | null, entries: readonly WhatsNewEntry[] = WHATS_NEW): boolean {
  const latest = latestEntryDate(entries);
  if (!latest) return false;
  return !lastSeen || latest > lastSeen;
}

export function formatEntryDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
}
