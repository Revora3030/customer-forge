import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
// Type-only import: erased at build time, so nothing server-only ships to the client.
import type { loadSite } from "@/lib/public-site.server";

/**
 * Public-safe organization lookup. Organization rows carry billing and
 * onboarding data, so the table is unreadable to anonymous clients; this
 * resolves only id/name via the privileged server client.
 */
async function publicOrganization(slug: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("slug", slug)
    .eq("is_suspended", false)
    .maybeSingle();
  return data ?? null;
}

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** Everything a public business website needs, in one SSR-friendly read. */
export const getPublicSite = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string; pageSlug?: string }) => {
    const slug = String(input?.slug ?? "")
      .trim()
      .slice(0, 80);
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Invalid business address");
    const raw = String(input?.pageSlug ?? "")
      .trim()
      .slice(0, 80);
    if (raw && !/^[a-z0-9-]+$/.test(raw)) throw new Error("Invalid page address");
    return raw ? { slug, pageSlug: raw } : { slug };
  })
  .handler(async ({ data }) => {
    const { loadSite } = await import("@/lib/public-site.server");
    return loadSite(data.slug, data.pageSlug ? { pageSlug: data.pageSlug } : undefined);
  });

export type PublicSite = Awaited<ReturnType<typeof loadSite>>;

/**
 * Draft preview behind a shareable, time-limited token. Returns a reason when
 * the link is unknown, revoked or expired so the page can say so plainly.
 */
export const getPreviewSite = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => {
    const token = String(input?.token ?? "")
      .trim()
      .slice(0, 120);
    if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) throw new Error("Invalid preview link");
    return { token };
  })
  .handler(async ({ data }) => {
    const { loadSite, resolvePreviewToken } = await import("@/lib/public-site.server");
    const link = await resolvePreviewToken(data.token);
    if (!link.ok)
      return {
        ok: false as const,
        reason: link.reason,
        site: null,
        expiresAt: null as string | null,
        label: null as string | null,
      };
    const site = await loadSite(link.slug, { allowUnpublished: true });
    if (!site)
      return {
        ok: false as const,
        reason: "unknown" as const,
        site: null,
        expiresAt: null as string | null,
        label: null as string | null,
      };
    return {
      ok: true as const,
      reason: null as "expired" | "revoked" | "unknown" | null,
      site,
      expiresAt: link.expiresAt as string | null,
      label: link.label as string | null,
    };
  });

/** Anonymous lead / quote / booking submission from a public business site. */
export const submitPublicLead = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      slug: string;
      name: string;
      email?: string;
      phone?: string;
      message?: string;
      city?: string;
      serviceId?: string | null;
      serviceInterest?: string | null;
      source?: string;
      campaign?: string | null;
      kind: "inquiry" | "quote" | "booking" | "consultation" | "contact";
      estimatedValue?: number;
      quote?: {
        formId: string | null;
        answers: { question: string; answer: string; modifier: number }[];
        min: number;
        max: number;
      } | null;
      booking?: { startsAt: string; durationMinutes: number } | null;
      /**
       * Honeypot: a field real visitors never see or fill in (kept invisible
       * and unlabeled in the form), so anything other than empty means a bot
       * filled every input it found. Caught submissions are accepted and
       * silently dropped rather than rejected, so scripted senders see a
       * normal "success" response and have no signal to adapt around.
       */
      companyWebsite?: string;
    }) => {
      const clean = (v: unknown, max: number) =>
        String(v ?? "")
          .trim()
          .slice(0, max);
      const isBot = clean(input.companyWebsite, 200).length > 0;
      const name = clean(input.name, 120);
      if (name.length < 2) throw new Error("Please enter your name.");
      const email = clean(input.email, 160);
      const phone = clean(input.phone, 40);
      if (!email && !phone) throw new Error("Add an email or phone number so we can reach you.");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("That email address doesn't look right.");
      }
      if (!/^[a-z0-9-]+$/.test(input.slug)) throw new Error("Invalid business address");
      return {
        ...input,
        name,
        email,
        phone,
        message: clean(input.message, 2000),
        city: clean(input.city, 120),
        serviceInterest: clean(input.serviceInterest, 160),
        estimatedValue: Math.max(0, Math.min(1_000_000, Number(input.estimatedValue ?? 0))),
        isBot,
      };
    },
  )
  .handler(async ({ data }) => {
    // Bots that fill in every field they can find (including the invisible
    // honeypot) get a normal-looking success with nothing written — no lead,
    // no notification, no CRM noise, and no error response for a script to
    // learn from and adjust to.
    if (data.isBot) return { ok: true as const, leadId: null, notified: false };

    // Inserts use the admin client: anonymous callers have INSERT but no SELECT
    // on leads, so a `.insert().select()` round-trip is blocked by RLS.
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    const org = await publicOrganization(data.slug);
    if (!org?.id) throw new Error("We couldn't find that business.");
    const orgId: string = org.id;

    // Origin event for the CRM timeline: every public submission is visible as
    // the first activity on the lead, with the channel it came from.
    const originBody =
      data.kind === "booking"
        ? `Booking requested from the public website${data.serviceInterest ? ` — ${data.serviceInterest}` : ""}.`
        : data.kind === "quote"
          ? `Quote submitted from the public website — estimate $${data.quote?.min ?? 0}–$${data.quote?.max ?? 0}.`
          : data.kind === "contact"
            ? "Contact form submitted from the public website."
            : "Lead captured from the public website.";

    const titles: Record<string, string> = {
      inquiry: `New lead: ${data.name}`,
      contact: `New message: ${data.name}`,
      quote: `Quote request: ${data.name}`,
      booking: `New booking request: ${data.name}`,
      consultation: `Consultation request: ${data.name}`,
    };

    // A single database transaction writes the lead, quote answers, appointment,
    // timeline entry and owner notification together. Any failure rolls the whole
    // thing back, so the visitor never sees a false "sent" and the workspace never
    // ends up with an orphaned half-record. The function also re-checks that any
    // service or quote form id really belongs to this business and refuses a time
    // that clashes with an existing appointment.
    const { data: result, error } = await supabase.rpc("submit_public_conversion", {
      _organization_id: orgId,
      _lead: {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        service_id: data.serviceId || null,
        service_interest: data.serviceInterest || null,
        message: data.message || null,
        city: data.city || null,
        source: data.source || "website",
        campaign: data.campaign ?? null,
        status: data.kind === "booking" ? "booked" : data.kind === "quote" ? "quoted" : "new",
        estimated_value: data.estimatedValue,
      } as never,
      _quote: data.quote
        ? ({
            form_id: data.quote.formId,
            answers: data.quote.answers,
            estimate_min: data.quote.min,
            estimate_max: data.quote.max,
          } as never)
        : null,
      _booking: data.booking
        ? ({
            starts_at: data.booking.startsAt,
            duration_minutes: data.booking.durationMinutes,
          } as never)
        : null,
      _activity: {
        kind:
          data.kind === "booking" ? "booking" : data.kind === "quote" ? "quote" : "form_submission",
        body: [originBody, data.message ? `"${data.message}"` : null].filter(Boolean).join(" "),
        metadata: {
          source: data.source || "website",
          campaign: data.campaign ?? null,
          city: data.city || null,
          service_interest: data.serviceInterest || null,
          estimated_value: data.estimatedValue,
        },
      } as never,
      _notification: {
        title: titles[data.kind] ?? `New lead: ${data.name}`,
        body: [
          data.serviceInterest,
          data.city,
          data.estimatedValue ? `$${data.estimatedValue} estimated` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        kind: data.kind === "booking" ? "booking" : data.kind === "quote" ? "quote" : "lead",
        link: data.kind === "booking" ? "/app/calendar" : "/app/leads",
      } as never,
    });

    if (error) {
      const message = error.message ?? "";
      console.error("public submission failed", message);
      if (message.includes("BOOKING_CONFLICT") || message.includes("appointments_no_overlap")) {
        throw new Error("That time was just taken. Please pick another time.");
      }
      if (message.includes("TIME_IN_PAST")) throw new Error("Please pick a time in the future.");
      if (message.includes("INVALID_TIME")) throw new Error("Pick a valid appointment time.");
      if (message.includes("INVALID_SERVICE") || message.includes("INVALID_QUOTE_FORM")) {
        throw new Error("That service is no longer available. Please refresh and try again.");
      }
      if (message.includes("RATE_LIMITED")) {
        throw new Error(
          "We've already received your details. Please wait a few minutes before sending again.",
        );
      }
      throw new Error("We couldn't save your request. Please try again.");
    }

    const saved = (result ?? {}) as {
      lead_id?: string;
      appointment_id?: string | null;
      duplicate?: boolean;
    };
    const leadId = String(saved.lead_id ?? "");
    if (!leadId) throw new Error("We couldn't save your request. Please try again.");
    const lead = { id: leadId };

    // A double-submitted form (double-clicked button, retried request) resolves
    // to the request that was already saved. The visitor still sees a normal
    // confirmation, and the owner is not alerted or followed up with twice.
    if (saved.duplicate) {
      return { ok: true, leadId, business: org.name, notified: true, duplicate: true };
    }

    // Funnel milestones: recorded only the first time a workspace reaches them,
    // so attribution shows sign-up -> first quote -> first booking per client.
    // These run after the transaction commits: a reporting write must never be
    // able to lose a customer's request.
    const recordMilestone = async (event: string, amountCents?: number | null) => {
      const { data: seen } = await supabase
        .from("marketing_conversions")
        .select("id")
        .eq("event_name", event)
        .contains("metadata", { organization_id: orgId } as never)
        .limit(1);
      if (seen && seen.length > 0) return;
      await supabase.from("marketing_conversions").insert({
        event_name: event,
        amount_cents: amountCents ?? null,
        metadata: { organization_id: orgId, source: data.source || "website" } as never,
      });
    };
    if (data.quote)
      await recordMilestone("first_quote_request", Math.round((data.quote.min ?? 0) * 100));
    if (data.booking) await recordMilestone("first_booking");

    // Everything below is a post-commit side effect (owner alert, follow-up
    // automations). The customer's request is already durably saved, so a
    // provider outage here must never delete it or fail the submission.
    let deliveryOk = true;
    try {
      // Owner alert + customer follow-ups. Delivery happens here (server side) so
      // "sent" always means a provider accepted the message.
      const { data: profile } = await supabase
        .from("business_profiles")
        .select("email, owner_email, notification_email, notify_on_lead")
        .eq("organization_id", orgId)
        .maybeSingle();
      const { alertRecipient } = await import("@/lib/notifications.functions");
      const ownerEmail = profile?.email || profile?.owner_email || null;
      const alertEmail = alertRecipient((profile ?? {}) as Record<string, never>);

      const { deliverRun, sendLeadAlert, sendLeadAlertCopyToRevora } = await import(
        "@/lib/messaging.server"
      );
      const { logAlertDelivery } = await import("@/lib/notifications.server");

      const alertData = {
        businessName: org.name,
        kind: titles[data.kind]?.split(":")[0] ?? "New lead",
        leadName: data.name,
        leadEmail: data.email || undefined,
        leadPhone: data.phone || undefined,
        city: data.city || undefined,
        service: data.serviceInterest || undefined,
        estimate: data.quote
          ? `$${data.quote.min}–$${data.quote.max}`
          : data.estimatedValue
            ? `$${data.estimatedValue}`
            : undefined,
        message: data.message || undefined,
        when: data.booking ? new Date(data.booking.startsAt).toLocaleString() : undefined,
      };

      if (alertEmail) {
        const alert = await sendLeadAlert(
          alertEmail,
          alertData,
          // One alert per lead, even if the submit is retried.
          `lead-alert-${lead.id}`,
        );
        await logAlertDelivery(null, {
          organizationId: orgId,
          leadId: lead.id,
          recipient: alertEmail,
          kind: data.kind,
          result: alert,
        });
        if (!alert.ok) console.warn("lead alert not delivered", alert.reason);
      }

      // Revora's own inbox gets every lead, whether or not the business set up
      // its own alerts. A failure here is logged, never hidden.
      const copy = await sendLeadAlertCopyToRevora(alertData, `lead-alert-${lead.id}`, alertEmail);
      if (copy)
        await logAlertDelivery(null, {
          organizationId: orgId,
          leadId: lead.id,
          recipient: copy.recipient,
          kind: `${data.kind}_revora_copy`,
          result: copy.result,
        });

      const { enqueueAutomations } = await import("@/lib/automation-engine");
      await enqueueAutomations(
        supabase,
        {
          organizationId: orgId,
          trigger: data.kind === "booking" ? "booking_created" : "lead_created",
          businessName: org.name,
          lead: {
            id: lead.id,
            name: data.name,
            email: data.email || null,
            phone: data.phone || null,
            service_interest: data.serviceInterest || null,
            estimated_value: data.estimatedValue,
          },
        },
        {
          businessName: org.name,
          deliver: (run) => deliverRun(run, { businessName: org.name, replyTo: ownerEmail }),
        },
      );
    } catch (sideEffectError) {
      deliveryOk = false;
      console.error(
        "post-submission delivery failed",
        sideEffectError instanceof Error ? sideEffectError.message : sideEffectError,
      );
      await supabase.from("lead_activities").insert({
        organization_id: orgId,
        lead_id: lead.id,
        kind: "note",
        body: "Owner alert or follow-up automation couldn't be delivered for this request.",
        metadata: { delivery: "failed" } as never,
      });
    }

    return {
      ok: true,
      leadId: lead.id,
      business: org.name,
      notified: deliveryOk,
      duplicate: false,
    };
  });

/** Fire-and-forget public analytics event (page views, CTA clicks). */
/**
 * Anonymous, privacy-light visit analytics for a published client website.
 *
 * It is a public write path, so it is deliberately narrow: only a fixed list of
 * event names is accepted, every field is length- and character-bounded before
 * it reaches the database, and a session that fires an implausible number of
 * events in a minute is quietly ignored rather than allowed to fill a client's
 * reporting with noise. Nothing about the organization is returned.
 */
const ANALYTICS_EVENTS = [
  "page_view",
  "call_click",
  "text_click",
  "email_click",
  "quote_start",
  "quote_complete",
  "booking_start",
  "form_submit",
] as const;

/** Most a single visitor session can legitimately record in one minute. */
const ANALYTICS_SESSION_LIMIT = 60;

/** Strips control characters and anything that isn't plain reporting text. */
function analyticsText(value: unknown, max: number) {
  const clean = String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
  return clean || null;
}

export const trackPublicEvent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      slug: string;
      eventType: string;
      path?: string;
      source?: string | null;
      campaign?: string | null;
      device?: string;
      sessionId?: string;
    }) => {
      if (!/^[a-z0-9-]{1,80}$/.test(String(input?.slug ?? "")))
        throw new Error("Invalid business address");
      if (!ANALYTICS_EVENTS.includes(input?.eventType as (typeof ANALYTICS_EVENTS)[number]))
        throw new Error("Unsupported event");
      const device = String(input?.device ?? "").toLowerCase();
      return {
        slug: input.slug,
        eventType: input.eventType,
        path: analyticsText(input.path, 200),
        source: analyticsText(input.source, 60),
        campaign: analyticsText(input.campaign, 60),
        device: ["mobile", "tablet", "desktop"].includes(device) ? device : null,
        // Session ids are generated by the site itself; anything that isn't a
        // simple opaque token is dropped rather than stored.
        sessionId: /^[A-Za-z0-9_-]{6,60}$/.test(String(input?.sessionId ?? ""))
          ? String(input.sessionId)
          : null,
      };
    },
  )
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const org = await publicOrganization(data.slug);
    if (!org?.id) return { ok: false };
    const orgId: string = org.id;

    // Flood protection. A real visitor cannot exceed this; a script trying to
    // spam a client's analytics is silently dropped, and a counting failure
    // never blocks legitimate tracking.
    if (data.sessionId) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count } = await supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("session_id", data.sessionId)
        .gte("created_at", since);
      if ((count ?? 0) >= ANALYTICS_SESSION_LIMIT) return { ok: false };
    }

    await supabase.from("analytics_events").insert({
      organization_id: orgId,
      event_type: data.eventType,
      path: data.path,
      source: data.source,
      campaign: data.campaign,
      device: data.device,
      session_id: data.sessionId,
    });
    return { ok: true };
  });

/**
 * Records real speed measurements taken in a visitor's browser on a published
 * site. Anonymous and de-duplicated: the database unique index means one visit
 * can contribute each metric on each page once, so a page that reloads its
 * script cannot inflate or double-count the numbers the owner sees.
 */
export const recordSiteVitals = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      slug: string;
      path?: string;
      device?: string;
      sessionId?: string;
      samples: Array<{ metric: string; value: number; rating: string }>;
    }) => {
      if (!/^[a-z0-9-]{1,80}$/.test(String(input?.slug ?? "")))
        throw new Error("Invalid business address");
      const metrics = ["lcp", "cls", "inp", "ttfb", "fcp"];
      const ratings = ["good", "needs-improvement", "poor"];
      const samples = (Array.isArray(input?.samples) ? input.samples : [])
        .filter(
          (sample) =>
            metrics.includes(String(sample?.metric)) &&
            ratings.includes(String(sample?.rating)) &&
            Number.isFinite(Number(sample?.value)) &&
            Number(sample.value) >= 0 &&
            Number(sample.value) <= 3_600_000,
        )
        .slice(0, 5)
        .map((sample) => ({
          metric: String(sample.metric),
          value: Number(sample.value),
          rating: String(sample.rating),
        }));
      const device = String(input?.device ?? "").toLowerCase();
      return {
        slug: input.slug,
        path: analyticsText(input.path, 200),
        device: ["mobile", "tablet", "desktop"].includes(device) ? device : null,
        sessionId: /^[A-Za-z0-9_-]{6,60}$/.test(String(input?.sessionId ?? ""))
          ? String(input.sessionId)
          : null,
        samples,
      };
    },
  )
  .handler(async ({ data }) => {
    if (data.samples.length === 0) return { ok: false, recorded: 0 };
    const supabase = publicClient();
    const org = await publicOrganization(data.slug);
    if (!org?.id) return { ok: false, recorded: 0 };
    const { error } = await supabase.from("site_vitals").upsert(
      data.samples.map((sample) => ({
        organization_id: org.id as string,
        metric: sample.metric,
        value: sample.value,
        rating: sample.rating,
        path: data.path,
        device: data.device,
        session_id: data.sessionId,
      })),
      { onConflict: "organization_id,session_id,metric,path", ignoreDuplicates: true },
    );
    if (error) return { ok: false, recorded: 0 };
    return { ok: true, recorded: data.samples.length };
  });
