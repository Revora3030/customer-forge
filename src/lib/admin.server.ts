/** Server-only helpers for platform admin (client creation, domains, support mode). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewClientInput } from "@/lib/admin-types";
import { seedQuoteCalculator } from "@/lib/quote-seed";
import { areAddressesPublic, guardedFetch, isFetchableHostname } from "@/lib/net-guard.server";
import { isRevoraOwnHost, isTrafficDomainHost } from "@/lib/revora-address";

/** Where clients point their domain. Both records are checked automatically. */
export const DOMAIN_TARGET = "revoragrowthsystems.com";
export const DOMAIN_A_RECORD = "185.158.133.1";
export const DOMAIN_TXT_NAME = "_lovable";

export async function assertSuperAdmin(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw new Error("Couldn't verify your platform access.");
  if (!data) throw new Error("Forbidden");
  return true;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

export function isValidDomain(value: string) {
  // Also rejects IP literals and internal/reserved names (see net-guard.server).
  // Revora's own hosts can never be claimed as a client website address: the
  // platform domain (and every label under it) is platform-only, and
  // revoraweb.site is redirect-only.
  return (
    isFetchableHostname(value) &&
    /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value) &&
    value.length <= 253 &&
    !isRevoraOwnHost(value) &&
    !isTrafficDomainHost(value)
  );
}

type DnsAnswer = { name: string; type: number; data: string };

async function dnsQuery(name: string, type: "A" | "AAAA" | "CNAME" | "TXT"): Promise<DnsAnswer[]> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!res.ok) throw new Error("DNS lookup failed");
  const json = (await res.json()) as { Answer?: DnsAnswer[] };
  return json.Answer ?? [];
}

export type DomainRecords = {
  a: string[];
  cname: string[];
  txt: string[];
  aMatches: boolean;
  cnameMatches: boolean;
  txtVerified: boolean;
  httpsStatus: number | null;
  httpsError: string | null;
  servesThisSite: boolean;
};

export type DomainCheck = {
  status: "not_connected" | "dns_pending" | "verifying" | "connected" | "ssl_active" | "error";
  detail: string;
  dnsOk: boolean;
  sslOk: boolean;
  records: DomainRecords;
};

const emptyRecords = (): DomainRecords => ({
  a: [],
  cname: [],
  txt: [],
  aMatches: false,
  cnameMatches: false,
  txtVerified: false,
  httpsStatus: null,
  httpsError: null,
  servesThisSite: false,
});

/** What a client must add at their registrar. Shown verbatim in the app. */
export const requiredDnsRecords = (domain: string) => [
  { type: "A", name: "@", value: DOMAIN_A_RECORD, purpose: `Points ${domain} at the platform` },
  { type: "A", name: "www", value: DOMAIN_A_RECORD, purpose: "Makes the www address work too" },
  {
    type: "TXT",
    name: DOMAIN_TXT_NAME,
    value: "lovable_verify=<value shown in project settings>",
    purpose: "Proves you own the domain",
  },
];

/**
 * Automated domain validation. Nothing is reported as live without evidence:
 * DNS must actually resolve to the platform, and HTTPS must complete a TLS
 * handshake and return a real response from that hostname.
 */
export async function checkDomain(
  rawDomain: string,
  opts: { proxied?: boolean } = {},
): Promise<DomainCheck> {
  // Work from the normalized hostname everywhere below, so the value that is
  // validated is the exact value that is later resolved and fetched.
  const domain = normalizeDomain(rawDomain ?? "");
  if (domain && !isFetchableHostname(domain))
    return {
      status: "error",
      detail: "That address isn't a valid public domain name, so it can't be checked.",
      dnsOk: false,
      sslOk: false,
      records: emptyRecords(),
    };
  if (!domain)
    return {
      status: "not_connected",
      detail: "No custom domain added.",
      dnsOk: false,
      sslOk: false,
      records: emptyRecords(),
    };

  const records = emptyRecords();

  try {
    const [aRes, cnameRes, txtRes] = await Promise.all([
      dnsQuery(domain, "A"),
      dnsQuery(domain, "CNAME"),
      dnsQuery(`${DOMAIN_TXT_NAME}.${domain}`, "TXT").catch(() => [] as DnsAnswer[]),
    ]);

    records.a = aRes.filter((r) => r.type === 1).map((r) => r.data.trim());
    records.cname = cnameRes.filter((r) => r.type === 5).map((r) => normalizeDomain(r.data));
    records.txt = txtRes.filter((r) => r.type === 16).map((r) => r.data.replace(/"/g, "").trim());
    records.aMatches = records.a.includes(DOMAIN_A_RECORD);
    records.cnameMatches = records.cname.some(
      (c) => c === DOMAIN_TARGET || c.endsWith(".lovable.app"),
    );
    records.txtVerified = records.txt.some((t) => t.toLowerCase().startsWith("lovable_verify="));

    // Behind a reverse proxy (Cloudflare) the public answers are the proxy's
    // own edge addresses, never the platform record — so a proxied host is
    // judged by "does DNS answer with public addresses at all", and the HTTPS
    // probe below is what actually proves the site is served.
    const dnsOk = opts.proxied
      ? records.a.length > 0 || records.cname.length > 0
      : records.aMatches || records.cnameMatches;

    if (!dnsOk) {
      const found = [...records.a, ...records.cname].slice(0, 3).join(", ");
      const none = records.a.length === 0 && records.cname.length === 0;
      const detail = opts.proxied
        ? none
          ? `No DNS records found for ${domain} yet. Add proxied A records for @ and * inside Cloudflare.`
          : `DNS exists but isn't resolving through Cloudflare yet. ${domain} currently resolves to ${found}.`
        : none
          ? `No DNS records found for ${domain} yet. Add an A record pointing to ${DOMAIN_A_RECORD}.`
          : `DNS exists but doesn't point here. ${domain} currently resolves to ${found}. Point it to ${DOMAIN_A_RECORD} instead.`;
      return {
        status: records.txtVerified ? "verifying" : "dns_pending",
        detail,
        dnsOk: false,
        sslOk: false,
        records,
      };
    }

    // DNS resolves here. Never fetch a host unless every address it resolves to
    // (IPv4 and IPv6) is globally routable — an unresolvable or private/
    // loopback/link-local/metadata target is refused outright (SSRF guard).
    const aaaaRes = await dnsQuery(domain, "AAAA").catch(() => [] as DnsAnswer[]);
    const resolved = [
      ...records.a,
      ...aaaaRes.filter((r) => r.type === 28).map((r) => r.data.trim()),
    ];
    if (!areAddressesPublic(resolved)) {
      return {
        status: "error",
        detail:
          "That domain doesn't resolve to a public internet address, so it can't be checked or served publicly.",
        dnsOk: false,
        sslOk: false,
        records,
      };
    }

    // Now prove HTTPS actually works on that hostname. The probe re-validates
    // the URL and every resolved address, so it can never reach a private,
    // loopback or metadata endpoint (SSRF guard).
    try {
      const res = await guardedFetch(
        `https://${domain}/`,

        { method: "GET" },
        async (hostname) => {
          const [a, aaaa] = await Promise.all([
            dnsQuery(hostname, "A").catch(() => [] as DnsAnswer[]),
            dnsQuery(hostname, "AAAA").catch(() => [] as DnsAnswer[]),
          ]);
          return [
            ...a.filter((r) => r.type === 1).map((r) => r.data.trim()),
            ...aaaa.filter((r) => r.type === 28).map((r) => r.data.trim()),
          ];
        },
      );
      records.httpsStatus = res.status;

      // Through a reverse proxy a 404 means the Worker/route isn't serving the
      // app yet, so "live" requires a real success response (or a deliberate
      // redirect, such as to a client's own custom domain).
      records.servesThisSite = opts.proxied ? res.status < 400 : res.status < 500;
      if (res.status >= 500) {
        return {
          status: "connected",
          detail: `DNS points here and the certificate is valid, but the site returned ${res.status}. Publish the website, then re-check.`,
          dnsOk: true,
          sslOk: true,
          records,
        };
      }
      return {
        status: "ssl_active",
        detail: "DNS resolves here and HTTPS answers with a valid certificate.",
        dnsOk: true,
        sslOk: true,
        records,
      };
    } catch (error) {
      records.httpsError = error instanceof Error ? error.message : "TLS handshake failed";
      return {
        status: "connected",
        detail: `DNS points here, but HTTPS isn't answering yet (${records.httpsError}). Certificates are usually issued within a few hours.`,
        dnsOk: true,
        sslOk: false,
        records,
      };
    }
  } catch (error) {
    return {
      status: "error",
      detail:
        error instanceof Error ? error.message : "The domain check failed. Try again shortly.",
      dnsOk: false,
      sslOk: false,
      records,
    };
  }
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `Ll-${Array.from(bytes, (b) => b.toString(36))
    .join("")
    .slice(0, 18)}!7`;
}

/** Creates a fully provisioned, isolated client tenant. Requires the service-role client. */
export async function provisionClient(admin: SupabaseClient, input: NewClientInput) {
  const base = slugify(input.business_name) || "business";
  let slug = base;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const { data: taken } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!taken) break;
    slug = `${base}-${attempt + 2}`;
  }

  const email = input.owner_email.trim().toLowerCase();

  // Owner account — reuse an existing user when that email already signed up.
  let ownerId: string | null = null;
  let tempPassword: string | null = null;
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    ownerId = (existingProfile as { id: string }).id;
  } else {
    tempPassword = randomPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: input.owner_name },
    });
    if (createError || !created.user) {
      throw new Error(createError?.message ?? "Couldn't create the owner account.");
    }
    ownerId = created.user.id;
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: input.business_name.trim(),
      slug,
      industry: input.industry ?? null,
      plan_id: input.plan_id ?? null,
      subscription_status: "trialing",
      trial_ends_at: newTrialEndsAt(),
      conversion_goal: input.conversion_goal ?? null,
      onboarding_step: 4,
      onboarding_completed: true,
      created_by: ownerId,
    })
    .select("id, name, slug")
    .single();
  if (orgError || !org) throw new Error(orgError?.message ?? "Couldn't create the workspace.");

  const organizationId = (org as { id: string }).id;

  await admin
    .from("memberships")
    .insert({ organization_id: organizationId, user_id: ownerId, role: "owner" });

  await admin.from("business_profiles").insert({
    organization_id: organizationId,
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    phone: input.phone ?? null,
    email,
    address: input.address ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    zip: input.zip ?? null,
    service_area: input.service_area ?? null,
    hours: input.hours ?? {},
    logo_url: input.logo_url ?? null,
    hero_image_url: input.hero_image_url ?? null,
    primary_color: input.primary_color ?? null,
    secondary_color: input.secondary_color ?? null,
    accent_color: input.accent_color ?? null,
    owner_name: input.owner_name,
    owner_email: email,
    review_link: input.review_link ?? null,
    support_email: input.support_email ?? null,
  });

  const domain = input.desired_domain ? normalizeDomain(input.desired_domain) : "";
  await admin.from("website_settings").insert({
    organization_id: organizationId,
    template: input.template ?? "default",
    pages: {},
    seo: {
      headline: input.tagline ?? `${input.business_name}`,
      subheadline: input.description ?? null,
      meta_description: input.tagline ?? null,
    },
    custom_domain: domain && isValidDomain(domain) ? domain : null,
    domain_status: domain && isValidDomain(domain) ? "dns_pending" : "not_connected",
    domain_target: DOMAIN_TARGET,
    publish_state: "draft",
    published: false,
  });

  await admin.from("social_profiles").insert({
    organization_id: organizationId,
    instagram: input.instagram ?? null,
    facebook: input.facebook ?? null,
    tiktok: input.tiktok ?? null,
    youtube: input.youtube ?? null,
    linkedin: input.linkedin ?? null,
    google_business: input.google_business ?? null,
  });

  const services = (input.services ?? []).filter((s) => s.name?.trim());
  if (services.length) {
    await admin.from("services").insert(
      services.map((service, index) => ({
        organization_id: organizationId,
        name: service.name.trim(),
        description: service.description ?? null,
        price: service.price ?? null,
        duration_minutes: service.duration_minutes ?? 60,
        bookable: service.bookable ?? true,
        featured: index === 0,
        is_active: true,
        sort_order: index,
      })),
    );
  }

  const images = (input.images ?? []).filter((url) => url?.trim());
  if (images.length) {
    await admin.from("media").insert(
      images.map((url) => ({
        organization_id: organizationId,
        url: url.trim(),
        category: "gallery",
      })),
    );
  }

  // Every workspace launches with a working quote calculator so the public site's
  // primary CTA always has a real destination (the owner can edit it afterwards).
  await seedQuoteCalculator(
    admin,
    organizationId,
    services.map((s) => s.name.trim()),
  );

  await admin.from("subscriptions").insert({
    organization_id: organizationId,
    plan_id: input.plan_id ?? null,
    status: "trialing",
    billing_interval: "monthly",
    trial_ends_at: newTrialEndsAt(),
  });

  await admin.from("notifications").insert({
    organization_id: organizationId,
    title: "Workspace created",
    body: "Your business workspace is ready. Finish the launch checklist to go live.",
    kind: "system",
    link: "/app/launch",
  });

  return { organizationId, slug, ownerId, tempPassword, email };
}
