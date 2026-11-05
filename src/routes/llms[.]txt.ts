import { createFileRoute } from "@tanstack/react-router";

import { COMPARISONS } from "@/lib/compare";
import { CRM_SOLUTIONS } from "@/lib/crm-solutions";
import { GUIDES } from "@/lib/guides";
import { LOCAL_INDUSTRIES } from "@/lib/local-pages";
import { BUSINESS } from "@/lib/business-identity";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { SITE_URL } from "@/lib/seo";
import { hostTenantFactsResponse } from "@/lib/site-host.server";

function body() {
  const lines: string[] = [];
  lines.push(`# ${BUSINESS.legalName}`);
  lines.push("");
  lines.push(
    `> ${BUSINESS.legalName} builds businesses in every industry a complete customer acquisition system: a fast website, instant quotes, online booking, a CRM for every lead, automated follow-up, a review engine, local SEO and analytics. Fully remote; businesses anywhere can sign up online. Billed in US dollars.`,
  );
  lines.push("");
  lines.push("## Offer");
  lines.push(
    `- ${GROWTH_SYSTEM.name}: ${usdExact(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month. Cancel anytime. ${GROWTH_SYSTEM.fullAccessWindow} of full access free at signup.`,
  );
  lines.push(`- Contact: ${BUSINESS.email}`);
  lines.push("");
  lines.push("## Key pages");
  for (const [label, path] of [
    ["Home", "/"],
    ["Pricing", "/pricing"],
    ["Get started", "/get-started"],
    ["CRM for contractors", "/crm-for-contractors"],
    ["CRM by trade", "/crm"],
    ["Industries served", "/industries"],
    ["About", "/about"],
    ["Contact", "/contact"],
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
  lines.push("## CRM by trade");
  for (const solution of CRM_SOLUTIONS) {
    lines.push(`- [${solution.metaTitle}](${SITE_URL}/crm/${solution.slug}): ${solution.description}`);
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
      GET: async ({ request }) => {
        // A verified client custom domain is that business's site: it answers
        // with the business's own facts, never Revora's platform identity.
        const url = new URL(request.url);
        const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
        const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
        try {
          const tenant = await hostTenantFactsResponse(host, protocol, "llms.txt");
          if (tenant) return tenant;
        } catch (error) {
          console.error("llms.txt host resolution failed", error);
          return new Response("Business facts temporarily unavailable", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "60" },
          });
        }
        return new Response(body(), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
