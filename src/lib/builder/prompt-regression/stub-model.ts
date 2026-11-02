/**
 * Deterministic stand-in for the model. It answers each prompt purpose with a
 * fixed, fact-faithful reply built only from the fixture, so CI never calls a
 * real model, needs no secrets and gives the same answer every run. These are
 * hand-written stubs, not recordings of a real model; the live run (see
 * docs/prompt-regression.md) is how real answers are checked.
 */
import type { ModelFn, ThinkerRequest } from "./thinker-route";
import type { PromptFixture } from "./fixtures";

const lower = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

function architectureReply(fixture: PromptFixture): string {
  const call = `Call ${fixture.phone}`;
  const where = fixture.serviceArea;
  const about = fixture.description || `${fixture.industry} serving ${fixture.city}.`;
  const seo = (page: string) => ({
    seoTitle: `${fixture.industry} in ${fixture.city}, ${fixture.region} | ${page}`.slice(0, 60),
    seoDescription: `${fixture.industry} serving ${where}. Call ${fixture.phone} or send a request through the form and we will get back to you about your job in ${fixture.city}.`.slice(0, 155),
  });
  const hero = {
    role: "hero",
    heading: `${fixture.industry} in ${fixture.city}`,
    subheading: `Call ${fixture.phone} or send a request.`,
    includes: ["primary_action"],
    media: "optional",
  };
  const closing = { role: "cta", heading: "Ready when you are", subheading: `${call} or send a request.`, body: `Tell us what you need in ${fixture.city} and we will get back to you.`, includes: ["primary_action"] };
  const contact = { role: "contact", heading: "Contact us", subheading: `${call} or use the form.` };
  const area = { role: "where_we_work", heading: "Where we work", body: `We serve ${where}.` };
  if (fixture.thin) {
    return JSON.stringify({
      pages: [
        { slug: "home", title: "Home", purpose: "Get the visitor to call", primaryAction: call, ...seo("Home"), sections: [hero, { role: "intro", heading: `${fixture.industry} serving ${fixture.city}`, body: `${fixture.businessName} is a ${lower(fixture.industry)} in ${fixture.city}, ${fixture.region}.` }, { role: "quote", heading: "Request a call back" }, contact] },
        { slug: "about", title: "About", purpose: "Who we are", primaryAction: call, ...seo("About"), sections: [{ role: "intro", heading: "About us", body: `${fixture.businessName} is a ${lower(fixture.industry)} in ${fixture.city}, ${fixture.region}.` }, closing] },
        { slug: "contact", title: "Contact", purpose: "Reach us", primaryAction: call, ...seo("Contact"), sections: [contact, area] },
      ],
    });
  }
  return JSON.stringify({
    pages: [
      {
        slug: "home",
        title: "Home",
        purpose: "Get the visitor to call or request a quote",
        primaryAction: call,
        ...seo("Home"),
        sections: [
          hero,
          { role: "services", heading: `${fixture.industry} services in ${fixture.city}`, subheading: "What we do", includes: ["service_cards"] },
          { role: "how_it_works", heading: "How to get started", body: `Call ${fixture.phone} or send a request, tell us what you need, and we get back to you.` },
          { role: "faq", heading: "Common questions", includes: ["faqs"] },
          { role: "quote", heading: "Send a request" },
          contact,
        ],
      },
      { slug: "services", title: "Services", purpose: "Show every service", primaryAction: call, ...seo("Services"), sections: [{ role: "services", heading: `All ${lower(fixture.industry)} services`, includes: ["service_cards"] }, { role: "quote", heading: "Ask about a service" }] },
      { slug: "about", title: "About", purpose: "Who we are", primaryAction: call, ...seo("About"), sections: [{ role: "intro", heading: "About us", body: about }, closing] },
      { slug: "contact", title: "Contact", purpose: "Reach us", primaryAction: call, ...seo("Contact"), sections: [contact, area] },
    ],
  });
}

/** Copy for every section that has a heading but no body (and the hero line). */
function copyReply(fixture: PromptFixture, request: ThinkerRequest): string {
  const ids = [...request.user.matchAll(/"id": "([^"]+)"/g)].map((match) => match[1]!);
  const sections = ids.map((id) => {
    const role = id.split("-")[1] ?? "";
    const service = fixture.services[0];
    if (role === "hero") return { id, subheading: `Call ${fixture.phone} or send a request.` };
    if (role === "cta") return { id, body: `Tell us what you need in ${fixture.city} and we will get back to you.` };
    if (role === "intro") return { id, body: fixture.description || `${fixture.businessName} is a ${lower(fixture.industry)} in ${fixture.city}, ${fixture.region}.` };
    return { id, body: service ? `${service} and the rest of our work, for customers in ${fixture.city}. Call ${fixture.phone} to talk it through.` : `Call ${fixture.phone} and we will talk it through.` };
  });
  return JSON.stringify({ sections });
}

export const stubModel: ModelFn = async (request, fixture) => {
  switch (request.purpose) {
    case "information_architecture":
      return architectureReply(fixture);
    case "plan_review":
      return JSON.stringify({ approvedFields: ["structure"], rejected: [] });
    case "content_strategy":
      return copyReply(fixture, request);
    case "specialist_review": {
      const ids = [...request.user.matchAll(/"id": "([^"]+)"/g)].map((match) => match[1]!);
      return JSON.stringify({ approvedFields: [...new Set(ids)], rejected: [] });
    }
    default:
      throw new Error(`stub model has no answer for purpose "${request.purpose}"`);
  }
};
