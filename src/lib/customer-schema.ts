/**
 * JSON-LD for tenant sites, sourced only from verified organization/profile data.
 * AI may review/choose which supported schema types are useful, but this module
 * never invents business facts.
 */

export type CustomerSchemaInput = {
  businessName: string;
  siteUrl: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  serviceArea?: string | null;
  services: Array<{
    name: string;
    description?: string | null;
    price?: number | null;
    starting_price?: number | null;
  }>;
  faqs?: Array<{ question: string; answer: string }>;
};

function clean(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : null;
}

function safeHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

export function buildCustomerJsonLd(input: CustomerSchemaInput): Record<string, unknown> {
  const siteUrl = safeHttpsUrl(input.siteUrl);
  const businessName = clean(input.businessName, 200) ?? "Business";

  const business: Record<string, unknown> = {
    "@type": ["LocalBusiness", "ProfessionalService"],
    name: businessName,
    ...(siteUrl ? { "@id": `${siteUrl}/#business`, url: siteUrl } : {}),
    ...(clean(input.phone, 60) ? { telephone: clean(input.phone, 60) } : {}),
    ...(clean(input.email, 254) ? { email: clean(input.email, 254) } : {}),
  };

  const addressLocality = clean(input.city, 100);
  const addressRegion = clean(input.state, 100);
  const addressCountry = clean(input.country, 100);
  if (addressLocality || addressRegion || addressCountry) {
    business.address = {
      "@type": "PostalAddress",
      ...(addressLocality ? { addressLocality } : {}),
      ...(addressRegion ? { addressRegion } : {}),
      ...(addressCountry ? { addressCountry } : {}),
    };
  }
  const serviceArea = clean(input.serviceArea, 200);
  if (serviceArea) business.areaServed = { "@type": "Place", name: serviceArea };

  const services = input.services
    .map((service) => {
      const name = clean(service.name, 160);
      if (!name) return null;
      const description = clean(service.description, 800);
      const price =
        typeof service.price === "number" && Number.isFinite(service.price) && service.price >= 0
          ? service.price
          : typeof service.starting_price === "number" &&
              Number.isFinite(service.starting_price) &&
              service.starting_price >= 0
            ? service.starting_price
            : null;
      return {
        "@type": "Service",
        name,
        ...(description ? { description } : {}),
        ...(siteUrl ? { provider: { "@id": `${siteUrl}/#business` } } : { provider: { name: businessName } }),
        ...(price !== null
          ? {
              offers: {
                "@type": "Offer",
                price,
                priceCurrency: "USD",
              },
            }
          : {}),
      };
    })
    .filter((service): service is Record<string, unknown> => Boolean(service));

  const faqItems = (input.faqs ?? [])
    .map((faq) => {
      const question = clean(faq.question, 300);
      const answer = clean(faq.answer, 1200);
      return question && answer
        ? {
            "@type": "Question",
            name: question,
            acceptedAnswer: { "@type": "Answer", text: answer },
          }
        : null;
    })
    .filter((faq): faq is Record<string, unknown> => Boolean(faq));

  const graph: Record<string, unknown>[] = [business, ...services];
  if (faqItems.length) {
    graph.push({
      "@type": "FAQPage",
      ...(siteUrl ? { "@id": `${siteUrl}/#faq` } : {}),
      mainEntity: faqItems,
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
