/**
 * The structured data a generated site emits, built with the same functions the
 * page head uses (localBusinessSchema, faqPageSchema and the #529 scrub), so the
 * validator checks what is really published rather than a copy of it.
 */

import { compositionFaqItems } from "@/lib/builder/composition-faq";
import { scrubPlaceholderText } from "@/lib/builder/placeholder-contact";
import { faqPageSchema } from "@/lib/seo";
import { localBusinessSchema } from "@/lib/site-head";

export function emittedJsonLd(input: {
  name: string;
  url: string;
  industry?: string | null | undefined;
  profile: Parameters<typeof localBusinessSchema>[0]["profile"];
  services: NonNullable<Parameters<typeof localBusinessSchema>[0]["services"]>;
  sections: readonly { settings?: unknown }[];
}): { docs: unknown[]; visibleFaqs: { q: string; a: string }[] } {
  const visibleFaqs = compositionFaqItems(input.sections);
  const faqs = visibleFaqs
    .map((item) => ({ q: scrubPlaceholderText(item.q), a: scrubPlaceholderText(item.a) }))
    .filter((item) => item.q.trim() && item.a.trim());
  return {
    docs: [
      localBusinessSchema({ name: input.name, url: input.url, profile: input.profile, services: input.services, ...(input.industry ? { industry: input.industry } : {}) }),
      ...(faqs.length ? [faqPageSchema(faqs)] : []),
    ],
    visibleFaqs,
  };
}
