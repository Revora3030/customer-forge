/**
 * Customer-site JSON-LD built only from verified intake/database facts.
 * AI may choose which supported schema types are useful, but this module is the
 * final data authority: it never accepts invented addresses, prices, ratings,
 * credentials or review claims.
 */

export type VerifiedCustomerSchemaInput = {
  businessName: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  serviceArea?: string | null;
  siteUrl: string;
  services: Array<{
    name: string;
    description?: string | null;
    price?: number | null;
    starting_price?: number | null;
  }>;
  faqs?: Array<{ question: string; answer: string }>;
};

const clean = (value: unknown, max = 300): string | null =>
  typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : null;

function absoluteSiteUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

export function buildVerifiedCustomerSchema(
  input: VerifiedCustomerSchemaInput,
): Record<string, unknown> {
  const siteUrl = absoluteSiteUrl(input.siteUrl);
  const name = clean(input.businessName) ?? "Business";
  const phone = clean(input.phone, 60);
  const email = clean(input.email, 254);
  const city = clean(input.city, 100);
  const region = clean(input.region, 100);
  const country = clean(input.country, 100);
  const serviceArea = clean(input.serviceArea, 200);

  const localBusiness: Record<string, unknown> = {
    "@type": ["LocalBusiness", "ProfessionalService"],
    "@id": siteUrl ? `${siteUrl}/#business` : undefined,
    name,
    url: siteUrl || undefined,
    ...(phone ? { telephone: phone } : {}),
    ...(email ? { email } : {}),
    ...(city || region || country
      ? {
          address: {
            "@type": "PostalAddress",
            ...(city ? { addressLocality: city } : {}),
            ...(region ? { addressRegion: region } : {}),
            ...(country ? { addressCountry: country } : {}),
          },
        }
      : {}),
    ...(serviceArea ? { areaServed: { "@type": "Place", name: serviceArea } } : {}),
  };

  // Undefined properties are removed so exact JSON-LD contains only verified data.
  for (const key of Object.keys(localBusiness))
    if (localBusiness[key] === undefined) delete localBusiness[key];

  const services = input.services
    .map((service) => {
      const name = clean(service.name, 160);
      if (!name) return null;
      const description = clean(service.description, 500);
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
        provider: siteUrl ? { "@id": `${siteUrl}/#business` } : { name },
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
    .filter((value): value is Record<string, unknown> => Boolean(value));

  const faqs = (input.faqs ?? [])
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
    .filter((value): value is Record<string, unknown> => Boolean(value));

  const graph: Record<string, unknown>[] = [localBusiness, ...services];
  if (faqs.length)
    graph.push({
      "@type": "FAQPage",
      ...(siteUrl ? { "@id": `${siteUrl}/#faq` } : {}),
      mainEntity: faqs,
    });

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
