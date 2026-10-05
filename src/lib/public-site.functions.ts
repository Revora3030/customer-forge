import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Row shape of `public.lead_delivery_logs` (migration 20260928052000). */
type LeadDeliveryLogInsert = {
  organization_id: string;
  lead_id: string;
  delivery_status: "delivered" | "failed" | "skipped";
  http_status: number | null;
  reason: string | null;
  retryable: boolean;
  attempted_at: string;
};

type LeadDeliveryLogTable = {
  insert(row: LeadDeliveryLogInsert): PromiseLike<{ error: { message: string } | null }>;
};

/**
 * Typed access to the lead delivery telemetry table that does not depend on
 * the generated Database types. The service-role client is still used, so RLS
 * and tenant boundaries are unchanged; only the compile-time table lookup is
 * narrowed to this one table and row shape.
 */
function leadDeliveryLogs(client: unknown): LeadDeliveryLogTable {
  return (client as { from(table: "lead_delivery_logs"): LeadDeliveryLogTable }).from(
    "lead_delivery_logs",
  );
}

function publicSubmissionSource() {
  const request = getRequest();
  const headers = request.headers;
  const cfIp = headers.get("cf-connecting-ip")?.trim();
  const trueClientIp = headers.get("true-client-ip")?.trim();
  // Only trust edge-controlled client IP headers. Arbitrary X-Forwarded-For is
  // not used here because public visitors can spoof it before Cloudflare.
  const ip = cfIp || trueClientIp || `edge:${new URL(request.url).host}`;
  const userAgent = headers.get("user-agent")?.trim().slice(0, 500) || null;
  const requestUrl = new URL(request.url);
  // Never forward query strings because they can contain attribution tokens or
  // other visitor-controlled data that does not belong in an external CRM.
  const sourceUrl = requestUrl.origin + requestUrl.pathname;
  return { ip, userAgent, sourceUrl };
}

function contactFingerprint(input: { email?: string | null; phone?: string | null }) {
  const email = input.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = input.phone?.replace(/[^0-9+]/g, "").trim();
  return phone ? `phone:${phone}` : null;
}

/** Everything a public business website needs, in one SSR-friendly read. */
export const getPublicSite = createServerFn({ method: "GET" })
  .validator((input: { slug: string; pageSlug?: string }) => {
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
 * The owner's own draft, read inside the builder. The public address only
 * serves a published site, so the builder preview reads this instead: the
 * signed-in member sees their unpublished work — hidden pages and sections
 * included — for a business they actually belong to, and for no one else.
 */
export const getOwnerDraftSite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { slug: string; pageSlug?: string }) => {
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
  .handler(async ({ data, context }) => {
    // Membership is decided by the caller's own client, so row-level security
    // answers this: a business they do not belong to simply is not there.
    const { data: org } = await context.supabase
      .from("organizations")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();

    if (!org?.id)
      return {
        ok: true as const,
        status: "empty" as const,
        site: null,
        job: null,
      };

    const { loadSite } = await import("@/lib/public-site.server");
    const site = await loadSite(data.slug, {
      allowUnpublished: true,
      ...(data.pageSlug ? { pageSlug: data.pageSlug } : {}),
    });

    const { data: job } = await context.supabase
      .from("generation_jobs")
      .select("id, status, current_step, progress")
      .eq("organization_id", org.id)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sectionCount = site?.content?.sections?.length ?? 0;
    if (job)
      return {
        ok: true as const,
        status: "pending" as const,
        site,
        job: {
          id: String(job.id),
          status: String(job.status),
          currentStep: job.current_step ? String(job.current_step) : null,
          progress: Number(job.progress ?? 0),
        },
      };

    return {
      ok: true as const,
      status: sectionCount > 0 ? ("ready" as const) : ("empty" as const),
      site,
      job: null,
    };
  });

/**
 * Draft preview behind a shareable, time-limited token. Returns a reason when
 * the link is unknown, revoked or expired so the page can say so plainly.
 */
export const getPreviewSite = createServerFn({ method: "GET" })
  .validator((input: { token: string; pageSlug?: string }) => {
    const token = String(input?.token ?? "")
      .trim()
      .slice(0, 120);
    if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) throw new Error("Invalid preview link");
    const page = String(input?.pageSlug ?? "")
      .trim()
      .slice(0, 80);
    if (page && !/^[a-z0-9-]+$/.test(page)) throw new Error("Invalid page address");
    return page ? { token, pageSlug: page } : { token };
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
    const site = await loadSite(link.slug, {
      allowUnpublished: true,
      ...(data.pageSlug ? { pageSlug: data.pageSlug } : {}),
    });
    // The link belongs to one workspace; never render another one's draft.
    const siteOrgId = (site as { org?: { id?: string } } | null)?.org?.id;
    if (site && siteOrgId && siteOrgId !== link.organizationId)
      return {
        ok: false as const,
        reason: "unknown" as const,
        site: null,
        expiresAt: null as string | null,
        label: null as string | null,
      };
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

/** "Monday, October 5, 2026 at 10:00 AM" in the business's own calendar. */
function bookingWhen(booking: { startsAt: string; localDate?: string; localTime?: string }): string {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(booking.localDate ?? "");
  const time = /^(\d{2}):(\d{2})$/.exec(booking.localTime ?? "");
  if (date && time) {
    const day = new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), 12));
    const dayText = day.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const hour = Number(time[1]);
    const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${time[2]} ${hour < 12 ? "AM" : "PM"}`;
    return `${dayText} at ${clock}`;
  }
  return new Date(booking.startsAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" });
}

/** Anonymous lead / quote / booking submission from a public business site. */
export const submitPublicLead = createServerFn({ method: "POST" })
  .validator(
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
      /**
       * Visitor session id (the site's own opaque token, when the browser
       * supplies one). Used to de-duplicate the server-side conversion event
       * against the client beacon that may have fired for the same visit.
       */
      sessionId?: string | null;
      kind: "inquiry" | "quote" | "booking" | "consultation" | "contact";
      estimatedValue?: number;
      quote?: {
        formId: string | null;
        answers: { question: string; answer: string; modifier: number }[];
        min: number;
        max: number;
      } | null;
      booking?: {
        startsAt: string;
        durationMinutes: number;
        /** Wall-clock date/time the visitor picked, in the business's calendar. */
        localDate?: string;
        localTime?: string;
      } | null;
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
      if (!/^[a-z0-9-]+$/.test(String(input.slug ?? ""))) throw new Error("Invalid business address");
      const KINDS = ["inquiry", "quote", "booking", "consultation", "contact"] as const;
      const kind = (KINDS as readonly string[]).includes(String(input.kind)) ? input.kind : "inquiry";
      // A booking label and booking details must travel together: a "booking"
      // with no time skipped every booking check yet was saved as booked.
      if (kind === "booking" && !input.booking) throw new Error("Choose a date and time to book.");
      const booking = kind === "booking" ? input.booking : null;
      const serviceId = typeof input.serviceId === "string" && /^[0-9a-f-]{36}$/i.test(input.serviceId) ? input.serviceId : null;
      return {
        ...input,
        kind,
        booking,
        serviceId,
        source: clean(input.source, 80) || "website",
        campaign: clean(input.campaign, 120) || null,
        name,
        email,
        phone,
        message: clean(input.message, 2000),
        city: clean(input.city, 120),
        serviceInterest: clean(input.serviceInterest, 160),
        estimatedValue: Math.max(0, Math.min(1_000_000, Number(input.estimatedValue ?? 0))),
        sessionId: /^[A-Za-z0-9_-]{6,60}$/.test(String(input?.sessionId ?? ""))
          ? String(input.sessionId)
          : null,
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

    const source = publicSubmissionSource();
    const contact = contactFingerprint(data);
    const contactHash = contact ? await sha256Hex(`contact|${orgId}|${contact}`) : null;
    const userAgentHash = source.userAgent
      ? await sha256Hex(`ua|${orgId}|${source.userAgent}`)
      : null;
    const attemptArgs: Database["public"]["Functions"]["register_public_submission_attempt"]["Args"] = {
      _organization_id: orgId,
      _purpose: `public_${data.kind}`,
      _ip_hash: await sha256Hex(`ip|${orgId}|${source.ip}`),
    };
    if (contactHash) attemptArgs._contact_hash = contactHash;
    if (userAgentHash) attemptArgs._user_agent_hash = userAgentHash;
    const { data: attempt, error: attemptError } = await supabase.rpc(
      "register_public_submission_attempt",
      attemptArgs,
    );
    if (attemptError) {
      console.error("public submission attempt gate failed", attemptError.message);
      throw new Error("We couldn't save your request. Please try again.");
    }
    if (!((attempt as { allowed?: boolean } | null)?.allowed ?? false)) {
      throw new Error(
        "We've already received your details. Please wait a few minutes before sending again.",
      );
    }

    // Never trust browser-supplied money. A quote's range and the lead's
    // estimated value are recomputed from the owner's own quote form; a
    // booking must name a service the owner made bookable.
    if (data.quote) {
      if (!data.quote.formId) throw new Error("That quote form is no longer available.");
      const formId = data.quote.formId;
      const [form, questions, options, addons] = await Promise.all([
        supabase
          .from("quote_forms")
          .select("base_price, min_price, max_price")
          .eq("id", formId)
          .eq("organization_id", orgId)
          .eq("is_active", true)
          .maybeSingle(),
        supabase.from("quote_questions").select("id, label").eq("form_id", formId).eq("organization_id", orgId),
        supabase
          .from("quote_options")
          .select("question_id, label, price_modifier, modifier_type")
          .eq("organization_id", orgId),
        supabase.from("quote_addons").select("label, price").eq("form_id", formId),
      ]);
      if (!form.data) throw new Error("That quote form is no longer available.");
      const { recomputeQuote } = await import("@/lib/quote-estimate");
      const questionIds = new Set((questions.data ?? []).map((row) => row.id as string));
      const verified = recomputeQuote({
        form: form.data as never,
        questions: (questions.data ?? []) as never,
        options: ((options.data ?? []) as { question_id: string }[]).filter((row) => questionIds.has(row.question_id)) as never,
        addons: (addons.data ?? []) as never,
        answers: (data.quote.answers ?? []).map((answer) => ({
          question: String(answer.question ?? ""),
          answer: String(answer.answer ?? ""),
        })),
      });
      data.quote = { formId, answers: verified.answers, min: verified.min, max: verified.max };
      data.estimatedValue = Math.round((verified.min + verified.max) / 2);
    } else if (data.kind !== "booking") {
      // Only a server-computed quote may carry a value into the CRM.
      data.estimatedValue = 0;
    }
    if (data.booking) {
      if (!data.serviceId) throw new Error("Choose a service to book.");
      const { data: service } = await supabase
        .from("services")
        .select("id, price, starting_price, duration_minutes")
        .eq("id", data.serviceId)
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .eq("bookable", true)
        .maybeSingle();
      if (!service) throw new Error("That service can't be booked online. Please contact the business.");
      data.estimatedValue = Number(service.price ?? service.starting_price ?? 0) || 0;
      // The appointment length comes from the owner's service, not the browser.
      const ownDuration = Number((service as { duration_minutes?: number | null }).duration_minutes ?? 0);
      if (ownDuration > 0) data.booking.durationMinutes = ownDuration;
      const startsAt = new Date(data.booking.startsAt);
      if (Number.isNaN(startsAt.getTime())) throw new Error("Choose a valid date and time.");
      if (startsAt.getTime() < Date.now() - 5 * 60 * 1000)
        throw new Error("That time has already passed. Please choose a future time.");
      // Opening hours: checked on the wall-clock time the visitor picked.
      if (data.booking.localDate && data.booking.localTime) {
        const { data: hoursRow } = await supabase
          .from("public_business_profiles")
          .select("hours")
          .eq("organization_id", orgId)
          .maybeSingle();
        const { checkBookingTime } = await import("@/lib/booking-hours");
        const verdict = checkBookingTime({
          hours: (hoursRow as { hours?: unknown } | null)?.hours ?? null,
          localDate: data.booking.localDate,
          localTime: data.booking.localTime,
          durationMinutes: data.booking.durationMinutes,
        });
        if (!verdict.ok) throw new Error(verdict.reason);
      }
    }

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

    // Primary conversion metrics must survive ad-blockers. The site's own
    // beacon (trackPublicEvent) fires quote_complete / booking_start /
    // form_submit from the browser, but privacy tools routinely block those
    // requests; the form submission itself always reaches the server, so the
    // completed conversion is recorded here too. De-duplication keeps both
    // paths honest: when the visitor's session id is known and a beacon for
    // the same event already landed in the last hour, the server-side record
    // is skipped, so an unblocked browser never counts twice — and a blocked
    // one still counts once. Reporting must never lose the customer's request,
    // so any failure here is logged and swallowed.
    try {
      const conversionEvent =
        data.kind === "quote" ? "quote_complete" : data.kind === "booking" ? "booking_start" : "form_submit";
      let alreadyRecorded = false;
      if (data.sessionId) {
        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("event_type", conversionEvent)
          .eq("session_id", data.sessionId)
          .gte("created_at", since);
        alreadyRecorded = (count ?? 0) > 0;
      }
      if (!alreadyRecorded) {
        await supabase.from("analytics_events").insert({
          organization_id: orgId,
          event_type: conversionEvent,
          path: null,
          source: data.source || "website",
          campaign: data.campaign ?? null,
          device: null,
          session_id: data.sessionId,
        });
      }
    } catch (analyticsError) {
      console.warn(
        "server-side conversion analytics not recorded",
        analyticsError instanceof Error ? analyticsError.message : analyticsError,
      );
    }

    // Everything below is a post-commit side effect (owner alert, follow-up
    // automations). The customer's request is already durably saved, so a
    // provider outage here must never delete it or fail the submission.
    let deliveryOk = true;
    try {
      // Owner alert + customer follow-ups. Delivery happens here (server side) so
      // "sent" always means a provider accepted the message.
      const [{ data: profile }, { data: routingSettings }] = await Promise.all([
        supabase
          .from("business_profiles")
          .select("email, owner_email, notification_email, notify_on_lead, phone")
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("website_settings")
          .select("lead_webhook_url")
          .eq("organization_id", orgId)
          .maybeSingle(),
      ]);
      const { alertRecipient } = await import("@/lib/notifications.functions");
      const ownerEmail = profile?.email || profile?.owner_email || null;
      const alertEmail = alertRecipient((profile ?? {}) as Record<string, never>);

      const { deliverRun, sendLeadAlert } = await import("@/lib/messaging.server");
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
        // The server runs in UTC, so formatting the timestamp here showed the
        // wrong hour. Use the wall-clock date and time the visitor picked.
        when: data.booking ? bookingWhen(data.booking) : undefined,
        requestedWhen: data.booking ? bookingWhen(data.booking) : undefined,
        budget: data.quote
          ? `${data.quote.min}–${data.quote.max}`
          : data.estimatedValue
            ? `${data.estimatedValue}`
            : undefined,
      };

      const { sendLeadConfirmation } = await import("@/lib/messaging.server");
      const { dispatchLeadWebhook } = await import("@/lib/lead-routing.server");
      const webhookUrl =
        typeof routingSettings?.lead_webhook_url === "string"
          ? routingSettings.lead_webhook_url
          : null;
      const confirmationEmail = data.email
        ? sendLeadConfirmation(
            data.email,
            {
              businessName: org.name,
              leadName: data.name,
              replyToEmail: ownerEmail || profile?.email || undefined,
              businessPhone: profile?.phone || undefined,
            },
            `lead-confirmation-${lead.id}`,
            ownerEmail || profile?.email || null,
          )
        : Promise.resolve({ ok: true as const, skipped: true as const, reason: "no_email_address" as const });
      const webhook = dispatchLeadWebhook(webhookUrl, {
        event: "lead.created",
        timestamp: new Date().toISOString(),
        workspace_id: orgId,
        lead: {
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          service: data.serviceInterest || null,
          message: data.message || null,
          source_url: source.sourceUrl,
        },
      });

      const [alert, confirmation, webhookResult] = await Promise.all([
        alertEmail
          ? sendLeadAlert(
              alertEmail,
              alertData,
              // One alert per lead, even if the submit is retried.
              `lead-alert-${lead.id}`,
            )
          : Promise.resolve({ ok: true as const, skipped: true as const, reason: "no_email_address" as const }),
        confirmationEmail,
        webhook,
      ]);

      if (alertEmail) {
        await logAlertDelivery(null, {
          organizationId: orgId,
          leadId: lead.id,
          recipient: alertEmail,
          kind: data.kind,
          result: alert,
        });
        if (!alert.ok) console.warn("lead alert not delivered", alert.reason);
      }
      if (!confirmation.ok && !("skipped" in confirmation && confirmation.skipped)) {
        console.warn("lead confirmation not delivered", confirmation.reason);
      }
      // Persist the outbound webhook outcome separately from the lead itself.
      // This is deliberately best-effort: telemetry can never turn a durable lead
      // into a failed visitor submission.
      try {
        const deliveryStatus = webhookResult.ok
          ? ("skipped" in webhookResult && webhookResult.skipped ? "skipped" : "delivered")
          : "failed";
        // Supabase reports insert failures in the result instead of throwing, so
        // the error has to be read explicitly or a missing table fails silently.
        // `lead_delivery_logs` is written through a narrow local contract rather
        // than the generated schema types: Lovable regenerates `types.ts` from the
        // live database, and until the migration is applied there, a typed
        // `.from("lead_delivery_logs")` call breaks the build gate.
        const { error: telemetryInsertError } = await leadDeliveryLogs(supabase).insert({
          organization_id: orgId,
          lead_id: lead.id,
          delivery_status: deliveryStatus,
          http_status: webhookResult.ok ? null : webhookResult.statusCode,
          reason: webhookResult.ok ? null : webhookResult.reason,
          retryable: webhookResult.ok ? false : webhookResult.retryable,
          attempted_at: webhookResult.attemptedAt,
        });
        if (telemetryInsertError) {
          const { captureError } = await import("@/lib/monitoring.server");
          await captureError({
            message: `Lead delivery telemetry not saved: ${telemetryInsertError.message}`,
            source: "server",
            level: "warning",
            route: "submitPublicLead",
            organizationId: orgId,
          });
        }
      } catch (telemetryError) {
        console.warn(
          "lead webhook telemetry could not be persisted",
          telemetryError instanceof Error ? telemetryError.message : telemetryError,
        );
      }

      if (!webhookResult.ok) {
        console.warn("lead webhook not delivered", {
          reason: webhookResult.reason,
          statusCode: webhookResult.statusCode,
          attemptedAt: webhookResult.attemptedAt,
          retryable: webhookResult.retryable,
        });
      }
      if (
        (alertEmail && !alert.ok) ||
        (data.email && !confirmation.ok) ||
        !webhookResult.ok
      ) {
        deliveryOk = false;
      }

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
    .replace(/[\\u0000-\\u001f\\u007f]/g, "")
    .trim()
    .slice(0, max);
  return clean || null;
}

export const trackPublicEvent = createServerFn({ method: "POST" })
  .validator(
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
  .validator(
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
    // Plain insert: the partial unique index rejects a repeat of the same
    // visit/metric/page, and that rejection is the de-duplication. A rejected
    // duplicate is reported honestly as nothing recorded, never as a success.
    const { error } = await supabase.from("site_vitals").insert(
      data.samples.map((sample) => ({
        organization_id: org.id as string,
        metric: sample.metric,
        value: sample.value,
        rating: sample.rating,
        path: data.path,
        device: data.device,
        session_id: data.sessionId,
      })),
    );
    if (error) return { ok: false, recorded: 0, reason: "duplicate_or_rejected" as const };
    return { ok: true, recorded: data.samples.length };
  });
