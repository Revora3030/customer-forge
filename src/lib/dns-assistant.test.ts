import { describe, expect, it } from "vitest";
import { REGISTRAR_GUIDES } from "@/lib/domain-setup";
import {
  NS_RULES,
  POLL_MAX_ATTEMPTS,
  detectDnsHost,
  findNameservers,
  mapDnsLiveState,
  nextPollDelayMs,
  nsCandidates,
  pollDelayMs,
  pollStopReason,
  shouldPollNow,
} from "@/lib/dns-assistant";

describe("detectDnsHost", () => {
  it("recognises each known DNS host from its name servers", () => {
    const cases: [string[], string][] = [
      [["ns57.domaincontrol.com.", "NS58.DOMAINCONTROL.COM"], "godaddy"],
      [["dns1.registrar-servers.com", "dns2.registrar-servers.com"], "namecheap"],
      [["anna.ns.cloudflare.com", "bob.ns.cloudflare.com"], "cloudflare"],
      [["ns01.squarespacedns.com"], "squarespace"],
      [["curitiba.ns.porkbun.com", "salvador.ns.porkbun.com"], "porkbun"],
      [["ns0.wixdns.net", "ns1.wixdns.net"], "wix"],
    ];
    for (const [ns, id] of cases) {
      const result = detectDnsHost(ns);
      expect(result.state).toBe("detected");
      if (result.state === "detected") expect(result.guideId).toBe(id);
    }
  });

  it("only points at guides that really exist in REGISTRAR_GUIDES", () => {
    for (const rule of NS_RULES) expect(REGISTRAR_GUIDES.some((g) => g.id === rule.guideId)).toBe(true);
  });

  it("says unknown (never guesses) for no, unrecognised or mixed name servers", () => {
    expect(detectDnsHost([])).toMatchObject({ state: "unknown", reason: "no-nameservers" });
    expect(detectDnsHost(["ns1.some-small-host.net"])).toMatchObject({
      state: "unknown",
      reason: "unrecognised",
    });
    expect(detectDnsHost(["a.ns.cloudflare.com", "ns1.some-small-host.net"])).toMatchObject({
      state: "unknown",
      reason: "mixed",
    });
    expect(detectDnsHost(["a.ns.cloudflare.com", "ns57.domaincontrol.com"])).toMatchObject({
      state: "unknown",
      reason: "mixed",
    });
  });

  it("does not match look-alike hosts or Google's shared name servers", () => {
    expect(detectDnsHost(["ns1.notdomaincontrol.com"]).state).toBe("unknown");
    expect(detectDnsHost(["domaincontrol.com.evil.example"]).state).toBe("unknown");
    expect(detectDnsHost(["ns-cloud-a1.googledomains.com"]).state).toBe("unknown");
  });
});

describe("findNameservers", () => {
  it("walks up from a subdomain to the first name with NS records, never a bare TLD", () => {
    expect(nsCandidates("shop.example.co.uk")).toEqual(["shop.example.co.uk", "example.co.uk", "co.uk"]);
    expect(nsCandidates("example.com")).toEqual(["example.com"]);
    const asked: string[] = [];
    return findNameservers("shop.example.com", async (name) => {
      asked.push(name);
      return name === "example.com" ? ["a.ns.cloudflare.com"] : [];
    }).then((ns) => {
      expect(ns).toEqual(["a.ns.cloudflare.com"]);
      expect(asked).toEqual(["shop.example.com", "example.com"]);
    });
  });

  it("returns an empty list when nothing publishes NS", async () => {
    expect(await findNameservers("nothing.example", async () => [])).toEqual([]);
  });
});

describe("mapDnsLiveState", () => {
  const live = { status: "ssl_active", dnsOk: true, sslOk: true, records: { httpsStatus: 200 } };
  it("is live only when the real check proved DNS, HTTPS and the site", () => {
    expect(mapDnsLiveState(live)).toBe("live");
  });
  it("never says live from partial evidence", () => {
    expect(mapDnsLiveState({ ...live, status: "connected" })).not.toBe("live");
    expect(mapDnsLiveState({ ...live, sslOk: false })).not.toBe("live");
    expect(mapDnsLiveState({ ...live, sslOk: null })).not.toBe("live");
    expect(mapDnsLiveState({ ...live, dnsOk: false })).toBe("waiting_dns");
    expect(mapDnsLiveState({ status: "ssl_active", dnsOk: true, sslOk: false })).not.toBe("live");
  });
  it("waits for DNS while DNS does not point here, including failed checks", () => {
    for (const status of ["dns_pending", "verifying", "error"])
      expect(mapDnsLiveState({ status, dnsOk: false, sslOk: false })).toBe("waiting_dns");
  });
  it("reports certificate pending when DNS points here but HTTPS never answered", () => {
    expect(
      mapDnsLiveState({
        status: "connected",
        dnsOk: true,
        sslOk: false,
        records: { httpsStatus: null, httpsError: "TLS handshake failed" },
      }),
    ).toBe("certificate_pending");
    expect(mapDnsLiveState({ status: "connected", dnsOk: true, sslOk: false })).toBe("certificate_pending");
  });
  it("reports DNS found when HTTPS answers but the site is not served yet", () => {
    expect(
      mapDnsLiveState({ status: "connected", dnsOk: true, sslOk: false, records: { httpsStatus: 404 } }),
    ).toBe("dns_found");
  });
  it("has no state without a real check", () => {
    expect(mapDnsLiveState(null)).toBeNull();
    expect(mapDnsLiveState({})).toBeNull();
    expect(mapDnsLiveState({ status: "not_connected", dnsOk: false })).toBeNull();
  });
});

describe("polling policy", () => {
  const base = { tabVisible: true, state: "waiting_dns" as const, attempts: 0, consecutiveErrors: 0, domainConnected: true };
  it("starts at 10 s and backs off", () => {
    expect(pollDelayMs(0)).toBe(10_000);
    expect(pollDelayMs(5)).toBe(10_000);
    expect(pollDelayMs(6)).toBe(20_000);
    expect(pollDelayMs(12)).toBe(30_000);
    expect(pollDelayMs(18)).toBe(60_000);
    expect(nextPollDelayMs(0, 2)).toBe(40_000);
    expect(nextPollDelayMs(20, 5)).toBe(120_000);
  });
  it("polls only while the tab is visible", () => {
    expect(shouldPollNow(base)).toBe(true);
    expect(shouldPollNow({ ...base, tabVisible: false })).toBe(false);
  });
  it("stops when live, at the cap, after repeated errors, or with no domain", () => {
    expect(pollStopReason({ ...base, state: "live" })).toBe("live");
    expect(pollStopReason({ ...base, attempts: POLL_MAX_ATTEMPTS })).toBe("cap");
    expect(pollStopReason({ ...base, consecutiveErrors: 3 })).toBe("errors");
    expect(pollStopReason({ ...base, domainConnected: false })).toBe("no-domain");
    expect(shouldPollNow({ ...base, attempts: POLL_MAX_ATTEMPTS })).toBe(false);
    expect(pollStopReason({ ...base, state: null })).toBeNull();
  });
});
