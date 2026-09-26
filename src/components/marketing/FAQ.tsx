import { Panel } from "@/components/app/Bits";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";

/** Purchase-objection FAQs. Answers must match the shipped product behaviour. */
export const FAQ_ITEMS = [
  {
    q: "What is Revora?",
    a: "Revora is a growth operating system for businesses in every industry, anywhere. It brings your website, lead capture, quotes, bookings, follow-up automation, review requests and analytics into one dashboard.",
  },
  {
    q: "Do I need an existing website?",
    a: "No. Revora builds and hosts a conversion-focused business site for you: start with your Revora platform preview, then connect your own domain.",
  },
  {
    q: "Can I connect my existing website?",
    a: "Yes — you can keep your current site and connect it to Revora. Traffic reporting for an external site requires installing the Revora tracking snippet on it; until real events arrive, Revora shows the connection as waiting for data rather than connected.",
  },
  {
    q: "Can Revora track website traffic?",
    a: "Yes, for sites Revora builds and for connected external sites once the tracking snippet is installed and configured. Analytics only ever show events that were actually recorded.",
  },
  {
    q: "Is traffic tracking real-time?",
    a: "Live activity appears only after real tracking events are received. With no traffic, Revora tells you there are no active visitors instead of showing a made-up number.",
  },
  {
    q: "Does Revora guarantee customers?",
    a: "No. Revora gives you the system, the follow-up and the measurement. Nobody can honestly guarantee leads, rankings or revenue, and we don't.",
  },
  {
    q: "How does pricing work?",
    a: `${GROWTH_SYSTEM.explainer} The setup fee covers the build, customization, configuration and launch; the monthly fee covers platform access, automation, hosting/system management, maintenance, website updates, reporting, optimization and support.`,
  },
  {
    q: "Can I cancel?",
    a: "Yes. You can cancel from billing at any time and keep access until the end of the paid period. Your data is preserved.",
  },

  {
    q: "Can I use my own domain?",
    a: "Yes. Connect a domain you already own from the Domain Center, follow the DNS steps, and Revora verifies DNS and HTTPS before reporting the domain as live.",
  },
  {
    q: "What businesses can use Revora?",
    a: "Any business, in any industry, in any city — worldwide. From detailing, hair and beauty, cleaning and landscaping to HVAC, plumbing, roofing, professional services, retail, hospitality and beyond. The AI adapts the website, content and growth system to your industry and location.",
  },
] as const;

export function FAQ() {
  return (
    <div className="mt-8 grid gap-3 md:grid-cols-2">
      {FAQ_ITEMS.map((item) => (
        <Panel key={item.q} className="p-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-5 text-[14px] font-medium text-foreground">
              {item.q}
              <span
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-primary transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="border-t border-border p-5 text-[13px] leading-relaxed text-muted-foreground">
              {item.a}
            </p>
          </details>
        </Panel>
      ))}
    </div>
  );
}
