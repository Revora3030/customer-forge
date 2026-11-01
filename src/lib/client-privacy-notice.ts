/**
 * Privacy and cookie notice for a published client website.
 *
 * Generated, never AI-written: every sentence is either a fact the business
 * owner entered (name, email, phone, address) or a description of what the
 * platform's website code actually does (forms, page-view counting, the
 * per-tab speed token, fonts, maps, embeds). Anything the platform cannot know
 * (how long the business keeps enquiries, who else it shares them with) is
 * either the owner's own words (privacy-notice-details.ts) or a visible
 * placeholder instead of being guessed.
 *
 * Review with a lawyer before relying on this.
 */
import { BOOKING_FIELDS, ENQUIRY_FIELDS } from "@/lib/builder/content-completeness";

/** Address of the generated notice on every client site (/privacy-notice). */
export const PRIVACY_NOTICE_SLUG = "privacy-notice";

export const PLATFORM_PRIVACY_URL = "https://revoragrowthsystems.com/privacy";

export type ClientNoticeInput = {
  businessName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  hasQuoteForm: boolean;
  hasBooking: boolean;
  /** The contact section frames Google Maps from the owner's saved Maps link. */
  hasMap: boolean;
  /** The site's type pairing is requested from Google Fonts. */
  loadsWebFonts: boolean;
  /** The owner's own description of how long enquiries are kept. */
  retention?: string | null;
  /** The owner's own description of who else receives visitors' details. */
  sharing?: string | null;
};

export type NoticeSection = { heading: string; paragraphs: string[] };

export type ClientNotice = {
  title: string;
  sections: NoticeSection[];
  /** Facts the owner has not supplied yet; each appears as a placeholder. */
  missing: string[];
};

/** Visible placeholder for a fact the business has not supplied. */
export const placeholder = (what: string) => `[${what}: not provided by the business yet]`;

const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Owner text as a sentence: ends with punctuation exactly once. */
const sentence = (text: string) => (/[.!?\]]$/.test(text) ? text : `${text}.`);

export function clientPrivacyNotice(input: ClientNoticeInput): ClientNotice {
  const missing: string[] = [];
  const need = (value: string | null | undefined, what: string) => {
    const text = value?.trim();
    if (text) return text;
    missing.push(what);
    return placeholder(what);
  };

  const name = need(input.businessName, "Business name");
  const contactBits = [
    input.email?.trim() ? `email ${input.email.trim()}` : null,
    input.phone?.trim() ? `call ${input.phone.trim()}` : null,
  ].filter((bit): bit is string => Boolean(bit));
  if (!contactBits.length) missing.push("Privacy contact (email or phone)");
  const contact = contactBits.length
    ? list(contactBits)
    : `use the contact form on this website ${placeholder("Privacy contact (email or phone)")}`;
  const address = need(input.address, "Business postal address");
  const retention = sentence(need(input.retention, "How long enquiries and bookings are kept"));
  const sharing = need(
    input.sharing,
    "Other companies the business shares your details with",
  ).replace(/[.!?\s]+$/, "");

  const fields = [...ENQUIRY_FIELDS, ...(input.hasBooking ? BOOKING_FIELDS : [])];
  const purposes = [
    "reply to your request",
    input.hasQuoteForm ? "prepare the quote you asked for" : null,
    input.hasBooking ? "arrange the booking you asked for" : null,
  ].filter((purpose): purpose is string => Boolean(purpose));

  const thirdParty = [
    input.loadsWebFonts
      ? "The page's fonts load from Google Fonts, so Google receives your IP address and browser details."
      : null,
    input.hasMap
      ? "The contact section shows an embedded Google Map. Google receives your IP address and may set its own cookies under Google's privacy policy."
      : null,
    "If the business adds a tool from another company to a page (for example a video, map, form or booking widget), that tool loads from that company, which receives your IP address and may set its own cookies under its own privacy policy.",
  ].filter((line): line is string => Boolean(line));

  return {
    title: "Privacy and cookie notice",
    missing: [...new Set(missing)],
    sections: [
      {
        heading: "Who runs this website",
        paragraphs: [
          `This website belongs to ${name}, ${address}. To ask about your information, ${contact}.`,
        ],
      },
      {
        heading: "What we collect",
        paragraphs: [
          `If you fill in a form on this site, we receive what you type: ${list(fields)}.`,
          "To block spam, the website checks each submission with a short automatic puzzle in your browser and keeps a one-way scrambled (hashed) copy of your IP address and browser details, not the readable values.",
        ],
      },
      {
        heading: "How we use it",
        paragraphs: [`We use your details to ${list(purposes)}.`],
      },
      {
        heading: "Who handles it",
        paragraphs: [
          `This website runs on Revora Growth Systems, which stores form submissions in ${name}'s account and emails ${name} when one arrives. Revora handles this information on the business's behalf; see ${PLATFORM_PRIVACY_URL}.`,
          `Other companies that receive your details: ${sharing}.`,
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [retention],
      },
      {
        heading: "Cookies and similar technology",
        paragraphs: [
          "This website does not set advertising cookies and does not run third-party analytics or ad tags. It does not sell your information or use it for targeted advertising.",
          "It counts page visits without cookies or a visitor ID: only the page address, how you arrived (direct or a link) and device type.",
          "A random token is kept in your browser's session storage to measure page speed and count form steps once per visit. It identifies no one and is deleted when you close the tab.",
          ...thirdParty,
        ],
      },
      {
        heading: "Your choices",
        paragraphs: [
          `To see, correct or delete what you sent us, ${contact}. You can block or clear cookies and site storage in your browser settings at any time; this website works without them.`,
        ],
      },
      {
        heading: "About this notice",
        paragraphs: [
          "This notice is generated from the details the business provided and from how this website works. Items in square brackets have not been provided by the business yet.",
        ],
      },
    ],
  };
}
