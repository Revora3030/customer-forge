import { createFileRoute } from "@tanstack/react-router";

import { COMPARISONS } from "@/lib/compare";
import { GUIDES } from "@/lib/guides";
import { LOCAL_INDUSTRIES } from "@/lib/local-pages";
import { BUSINESS } from "@/lib/business-identity";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { SITE_URL } from "@/lib/seo";

function body() {
  const lines: string[] = [];
  lines.push(`# ${BUSINESS.legalName}`);
  lines.push("");
  lines.push(
    `> ${BUSINESS.legalName} builds local service businesses a complete customer acquisition system: a fast website, instant quotes, online booking, a CRM for every lead, automated follow-up, a review engine, local SEO and analytics. Remote, service-area only; serving the United States.`,
  );
  lines.push("");
  lines.push("## Offer");
  lines.push(
    `- ${GROWTH_SYSTEM.name}: ${usdExact(GROWTH_SYSTEM.setupPrice)} one-time setup, first month free, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month. Cancel anytime. ${GROWTH_SYSTEM.fullAccessWindow} of full access free at signup.`,
  );
  lines.push(`- Contact: ${BUSINESS.email} · ${BUSINESS.phoneDisplay} · ${BUSINESS.hours.display}`);
  lines.push("");
  lines.push("## Key pages");
  for (const [label, path] of [
    ["Home", "/"],
    ["Pricing", "/pricing"],
    ["Get started", "/get-started"],
    ["Free website audit", "/website-audit"],
    ["Growth assessment", "/growth-assessment"],
    ["Free calculators", "/tools"],
    ["Guides", "/guides"],
    ["Comparisons", "/compare"],
    ["Local growth systems by trade and state", "/local"],
  ] as const) {
    lines.push(`- [${label}](${SITE_URL}${path})`);
  }
  lines.push("");
  lines.push("## Guides");
  for (const guide of GUIDES) {
    lines.push(`- [${guide.title}](${SITE_URL}/guides/${guide.slug}): ${guide.description}`);
  }
  lines.push("");
  lines.push("## Comparisons");
  for (const c of COMPARISONS) {
    lines.push(`- [${c.label}](${SITE_URL}/compare/${c.slug})`);
  }
  lines.push("");
  lines.push("## Trades served");
  for (const industry of LOCAL_INDUSTRIES) {
    lines.push(`- [${industry.name}](${SITE_URL}/local/${industry.slug})`);
  }
  lines.push("");
  lines.push(`Sitemap: ${SITE_URL}/sitemap.xml`);
  lines.push("");
  return lines.join("\n");
}

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(body(), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
