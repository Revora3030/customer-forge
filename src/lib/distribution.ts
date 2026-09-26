/**
 * Free distribution engine.
 *
 * Revora cannot buy ads, send bulk SMS or place TV spots from inside the app —
 * those are paid, consent-governed channels owned by the operator. What this
 * module does is produce the real, ready-to-send assets and tracked links for
 * every free channel a business owner actually has: text messages they send
 * themselves, social posts, community boards, directories, email, print QR
 * codes and broadcast read scripts.
 *
 * Every link is UTM-tagged so `attribution.ts` records which channel produced a
 * visit, a lead and a paying client. Nothing here fabricates reach: it only
 * builds assets and tracked URLs.
 */

import { SITE_URL, absoluteUrl } from "@/lib/seo";
import { REVORA } from "@/lib/brand";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";

export type ChannelId =
  | "sms"
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "x"
  | "linkedin"
  | "reddit"
  | "nextdoor"
  | "email"
  | "youtube"
  | "print"
  | "broadcast";

export type ChannelKind = "message" | "social" | "community" | "listing" | "broadcast";

const SETUP = usdExact(GROWTH_SYSTEM.setupPrice);
const MONTHLY = usdExact(GROWTH_SYSTEM.monthlyPrice);

/** Builds a UTM-tagged Revora link. Path may be "" for the homepage. */
export function trackedLink(
  path: string,
  opts: { source: string; medium: string; campaign: string; content?: string },
): string {
  const base = absoluteUrl(path || "/");
  const params = new URLSearchParams({
    utm_source: slug(opts.source),
    utm_medium: slug(opts.medium),
    utm_campaign: slug(opts.campaign),
  });
  if (opts.content) params.set("utm_content", slug(opts.content));
  return `${base}?${params.toString()}`;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Free QR image for print, vehicle decals, flyers and job-site signs. */
export function qrImageUrl(target: string, size = 512): string {
  const px = Math.min(1000, Math.max(128, Math.round(size)));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&margin=8&data=${encodeURIComponent(target)}`;
}

export type ChannelAsset = {
  id: ChannelId;
  kind: ChannelKind;
  label: string;
  /** Why this channel is worth the operator's time, in plain language. */
  why: string;
  /** Copy-ready message. Links are already tracked. */
  message: string;
  /** Opens the channel's own composer where one exists. */
  intentUrl: string | null;
  /** Honest note about consent, rules or effort. */
  note: string;
};

/**
 * Builds every free-channel asset for one campaign.
 *
 * `audience` lets the operator aim the same system at the trade they are
 * pitching (e.g. "HVAC companies in Charlotte") without rewriting copy.
 */
export function buildChannelAssets(input: {
  campaign: string;
  audience?: string;
  path?: string;
}): ChannelAsset[] {
  const campaign = input.campaign || "growth";
  const audience = (input.audience || "local service business owners").trim();
  const path = input.path ?? "/";
  const link = (source: string, medium: string, content?: string) =>
    trackedLink(path, { source, medium, campaign, ...(content ? { content } : {}) });

  const pitch = `A complete customer acquisition system for ${audience}: a website that ranks, instant quotes, online booking, CRM and automatic follow-up. ${SETUP} setup, first month free, then ${MONTHLY}/month.`;

  const smsBody = `Hey — I build complete customer-getting systems for ${audience}. Website, instant quotes, online booking, follow-up, all in one. First month free. Take a look: ${link("sms", "text")}`;
  const emailBody = `Hi,\n\n${pitch}\n\nYou can see exactly what it looks like here: ${link("email", "email")}\n\nIf it's not a fit, no hard feelings — reply "no" and I won't follow up.\n\n${REVORA.founder.name}\nRevora Growth Systems\n${REVORA.phoneDisplay}`;

  const assets: ChannelAsset[] = [
    {
      id: "sms",
      kind: "message",
      label: "Text message",
      why: "Highest read rate of any channel. Best for people who already know you.",
      message: smsBody,
      intentUrl: `sms:?&body=${encodeURIComponent(smsBody)}`,
      note: "Text people you have a relationship with or who asked to hear from you. Buying phone lists and blasting strangers violates US TCPA rules and carrier policy.",
    },
    {
      id: "whatsapp",
      kind: "message",
      label: "WhatsApp",
      why: "Free international reach — good for referrals and group shares.",
      message: smsBody,
      intentUrl: `https://wa.me/?text=${encodeURIComponent(smsBody)}`,
      note: "Share into chats and groups you belong to.",
    },
    {
      id: "facebook",
      kind: "social",
      label: "Facebook + local groups",
      why: "Local business and community groups are where owners already ask for help.",
      message: `${pitch}\n\nSee it: ${link("facebook", "social")}`,
      intentUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link("facebook", "social"))}`,
      note: "Read each group's promo rules first — many allow one promo post per week.",
    },
    {
      id: "instagram",
      kind: "social",
      label: "Instagram / Reels caption",
      why: "Short before/after builds are the strongest organic proof you can post.",
      message: `Watch a real service business get a full customer system built in one sitting — site, instant quotes, booking, follow-up.\n\n${SETUP} setup. First month free. Then ${MONTHLY}/month.\n\nLink in bio 👉 ${link("instagram", "social")}\n\n#smallbusiness #contractor #localbusiness #leadgeneration #websitedesign`,
      intentUrl: null,
      note: "Instagram strips links from captions — put the tracked link in your bio.",
    },
    {
      id: "tiktok",
      kind: "social",
      label: "TikTok caption",
      why: "Free, un-capped organic reach. Screen-record one build per day.",
      message: `I built this business a complete customer system in one sitting. Website, instant quotes, booking, follow-up, reviews. First month free. ${link("tiktok", "social")}\n\n#smallbusinesstips #contractorlife #localseo`,
      intentUrl: null,
      note: "Show the build on screen. Faces and real screens outperform slideshows.",
    },
    {
      id: "x",
      kind: "social",
      label: "X / Twitter",
      why: "Fast to post, easy to repeat daily with a different trade each time.",
      message: `${audience}: your website should book jobs, not just sit there.\n\nRevora = site + instant quotes + booking + CRM + follow-up.\n${SETUP} setup, first month free, then ${MONTHLY}/mo.\n\n${link("x", "social")}`,
      intentUrl: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${audience}: your website should book jobs, not just sit there.`)}&url=${encodeURIComponent(link("x", "social"))}`,
      note: "Post one trade per day and reply to people asking for website help.",
    },
    {
      id: "linkedin",
      kind: "social",
      label: "LinkedIn",
      why: "Owners and operators are searchable here by trade and city.",
      message: `${pitch}\n\n${link("linkedin", "social")}`,
      intentUrl: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link("linkedin", "social"))}`,
      note: "Connect with owners in your metro, then send the message as a note.",
    },
    {
      id: "reddit",
      kind: "community",
      label: "Reddit",
      why: "r/smallbusiness, r/Contractors and trade subs get website questions daily.",
      message: `${pitch}\n\n${link("reddit", "community")}`,
      intentUrl: `https://www.reddit.com/submit?url=${encodeURIComponent(link("reddit", "community"))}&title=${encodeURIComponent("A complete customer acquisition system for local service businesses")}`,
      note: "Answer questions genuinely first. Most subs remove drive-by promotion.",
    },
    {
      id: "nextdoor",
      kind: "community",
      label: "Nextdoor",
      why: "Neighborhood-level reach with real local intent, free for businesses.",
      message: `Local business owners: I build complete customer systems — website, instant quotes, online booking and follow-up. First month free. ${link("nextdoor", "community")}`,
      intentUrl: "https://business.nextdoor.com/",
      note: "Claim a free business page, then post in your own neighborhoods.",
    },
    {
      id: "email",
      kind: "message",
      label: "Email outreach",
      why: "Business email is legal to cold-send in the US with a real opt-out.",
      message: emailBody,
      intentUrl: `mailto:?subject=${encodeURIComponent("A customer system for your business")}&body=${encodeURIComponent(emailBody)}`,
      note: 'CAN-SPAM requires a truthful subject, a real identity and a working opt-out. Keep the reply-"no" line in.',
    },
    {
      id: "youtube",
      kind: "social",
      label: "YouTube description",
      why: "Build walkthroughs keep earning views for years — the best free compounding channel.",
      message: `Revora builds businesses in every industry a complete customer acquisition system: a website that ranks, instant quotes, online booking, CRM and automatic follow-up.\n\n${SETUP} setup. First month free. Then ${MONTHLY}/month.\n\nStart here: ${link("youtube", "video")}\nCall or text: ${REVORA.phoneDisplay}`,
      intentUrl: null,
      note: "Title each video for a trade + city so it also gets found in search.",
    },
    {
      id: "print",
      kind: "listing",
      label: "Print + QR (trucks, flyers, counters)",
      why: "Free once printed, and every scan is tracked like a click.",
      message: `Scan to see a complete customer system for your business — ${SETUP} setup, first month free, then ${MONTHLY}/month. ${link("print", "qr")}`,
      intentUrl: qrImageUrl(link("print", "qr")),
      note: "Put the QR where owners wait: supply houses, counters, trade desks, job-site signs.",
    },
    {
      id: "broadcast",
      kind: "broadcast",
      label: "Radio / local TV read (30s)",
      why: "Local stations trade or discount unsold inventory; the script is ready either way.",
      message: `[30 seconds] Running a service business and your phone still isn't ringing? Revora builds you the whole customer system — a website that gets found, instant quotes, online booking, and follow-up that never forgets a lead. ${SETUP} to set it up, your first month is free, then ${MONTHLY} a month. That's Revora Growth Systems — revoragrowthsystems dot com. Call ${REVORA.phoneDisplay}.`,
      intentUrl: null,
      note: "Paid placement is bought directly from the station; Revora only supplies the script and a tracked vanity link.",
    },
  ];

  return assets;
}

export type ListingTarget = {
  label: string;
  url: string;
  why: string;
  /** Free to submit? Every entry here is free. */
  free: true;
};

/** Free places to list Revora itself so business owners find it in search. */
export const FREE_LISTINGS: ListingTarget[] = [
  {
    label: "Google Business Profile",
    url: "https://business.google.com/create",
    why: "The single highest-intent free listing. Service-area business, no address needed.",
    free: true,
  },
  {
    label: "Bing Places",
    url: "https://www.bingplaces.com/",
    why: "Feeds Bing, Copilot and Windows search results.",
    free: true,
  },
  {
    label: "Apple Business Connect",
    url: "https://businessconnect.apple.com/",
    why: "Puts Revora in Apple Maps and Siri results.",
    free: true,
  },
  {
    label: "Bing Webmaster Tools",
    url: "https://www.bing.com/webmasters",
    why: "Submit the sitemap so Bing and AI assistants index all 90+ pages.",
    free: true,
  },
  {
    label: "Yelp for Business",
    url: "https://biz.yelp.com/",
    why: "Ranks for 'web design near me' style searches.",
    free: true,
  },
  {
    label: "Product Hunt",
    url: "https://www.producthunt.com/posts/new",
    why: "One launch day can send thousands of founders and agencies.",
    free: true,
  },
  {
    label: "Indie Hackers",
    url: "https://www.indiehackers.com/products",
    why: "Free product page plus a founder audience that shares tools.",
    free: true,
  },
  {
    label: "Crunchbase",
    url: "https://www.crunchbase.com/",
    why: "Strong domain authority backlink and brand search coverage.",
    free: true,
  },
  {
    label: "G2",
    url: "https://www.g2.com/products/new",
    why: "Software buyers compare here before they contact anyone.",
    free: true,
  },
  {
    label: "Capterra / GetApp",
    url: "https://www.capterra.com/vendors/sign-up",
    why: "Free listing on the largest small-business software directory.",
    free: true,
  },
  {
    label: "AlternativeTo",
    url: "https://alternativeto.net/manage/",
    why: "Captures people searching for a cheaper alternative to big builders.",
    free: true,
  },
  {
    label: "Facebook Page + Marketplace services",
    url: "https://www.facebook.com/pages/create",
    why: "Free page, free local service posts, free group participation.",
    free: true,
  },
];

/** A repeatable daily routine — the part that actually compounds into reach. */
export const DAILY_ROUTINE: { task: string; minutes: number; channel: string }[] = [
  {
    task: "Post one build walkthrough (Reels + TikTok + Shorts, same clip)",
    minutes: 20,
    channel: "social",
  },
  {
    task: "Answer 3 website/lead questions in trade groups or subreddits",
    minutes: 15,
    channel: "community",
  },
  {
    task: "Send 10 personal messages to owners you actually know or met",
    minutes: 15,
    channel: "message",
  },
  {
    task: "Email 15 businesses whose site has no booking or quote form",
    minutes: 20,
    channel: "email",
  },
  { task: "Publish or refresh one trade + city page", minutes: 15, channel: "seo" },
  {
    task: "Leave the QR card at one supply house, counter or trade desk",
    minutes: 10,
    channel: "print",
  },
];

/** Honest daily reach ceiling, so nobody expects millions overnight. */
export function routineMinutes(): number {
  return DAILY_ROUTINE.reduce((total, item) => total + item.minutes, 0);
}

export const SHARE_PAGE_PATH = "/share";
export const SHARE_PAGE_URL = `${SITE_URL}${SHARE_PAGE_PATH}`;
