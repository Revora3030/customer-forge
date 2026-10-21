/**
 * Read-only Jarvis checks for workspace services linked to this project
 * (Google Calendar, Google Sheets, Cloudflare, Resend) plus a keyless DNS
 * lookup. Every call is a GET; nothing here sends, edits or deletes.
 */
export const GATEWAY_BASE = "https://connector-gateway.lovable.dev";

export const CONNECTED_SERVICE_SECRETS = {
  "workspace.calendar.upcoming": "GOOGLE_CALENDAR_API_KEY",
  "workspace.sheets.read": "GOOGLE_SHEETS_API_KEY",
  "cloudflare.zones.summary": "CLOUDFLARE_API_KEY",
  "email.resend.domains": "RESEND_API_KEY",
} as const;

export type ConnectedToolId = keyof typeof CONNECTED_SERVICE_SECRETS;

export function isConnectedToolId(id: string): id is ConnectedToolId {
  return id in CONNECTED_SERVICE_SECRETS;
}

/** Extracts a spreadsheet ID from a Google Sheets URL or a bare ID. */
export function parseSpreadsheetId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  const fromUrl = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (fromUrl?.[1]) return fromUrl[1];
  return /^[a-zA-Z0-9_-]{20,100}$/.test(value) ? value : null;
}

/** Hostname only, letters/digits/dots/hyphens, at least one dot. */
export function cleanDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let value = input.trim().toLowerCase();
  try { if (value.includes("://")) value = new URL(value).hostname; } catch { return null; }
  value = value.replace(/\.$/, "");
  return /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value) ? value : null;
}

export function connectedServicePath(toolId: ConnectedToolId, args: { query?: string | undefined }): string | null {
  switch (toolId) {
    case "workspace.calendar.upcoming": {
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 7 * 86_400_000).toISOString();
      return `/google_calendar/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=20&timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(end)}`;
    }
    case "workspace.sheets.read": {
      const id = parseSpreadsheetId(args.query);
      return id ? `/google_sheets/v4/spreadsheets/${id}?fields=properties.title,sheets.properties(title,gridProperties)` : null;
    }
    case "cloudflare.zones.summary":
      return "/cloudflare/client/v4/zones?per_page=50";
    case "email.resend.domains":
      return "/resend/domains";
  }
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Keeps only non-sensitive summary fields; never attendee emails or descriptions. */
export function summarizeConnected(toolId: ConnectedToolId, raw: unknown) {
  const body = obj(raw);
  switch (toolId) {
    case "workspace.calendar.upcoming":
      return {
        events: arr(body["items"]).slice(0, 20).map((e) => {
          const ev = obj(e);
          return {
            title: str(ev["summary"]) ?? "(no title)",
            start: str(obj(ev["start"])["dateTime"]) ?? str(obj(ev["start"])["date"]),
            end: str(obj(ev["end"])["dateTime"]) ?? str(obj(ev["end"])["date"]),
            allDay: Boolean(obj(ev["start"])["date"]),
          };
        }),
      };
    case "workspace.sheets.read":
      return {
        title: str(obj(body["properties"])["title"]),
        tabs: arr(body["sheets"]).map((s) => {
          const p = obj(obj(s)["properties"]);
          const g = obj(p["gridProperties"]);
          return { title: str(p["title"]), rows: g["rowCount"] ?? null, columns: g["columnCount"] ?? null };
        }),
      };
    case "cloudflare.zones.summary":
      return {
        zones: arr(body["result"]).map((z) => {
          const zone = obj(z);
          return { name: str(zone["name"]), status: str(zone["status"]), plan: str(obj(zone["plan"])["name"]), paused: Boolean(zone["paused"]) };
        }),
      };
    case "email.resend.domains":
      return {
        domains: arr(body["data"]).map((d) => {
          const domain = obj(d);
          return { name: str(domain["name"]), status: str(domain["status"]), region: str(domain["region"]) };
        }),
      };
  }
}

/** Keyless DNS over HTTPS (Cloudflare 1.1.1.1). */
export const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"] as const;
export function dohUrl(domain: string, type: string) {
  return `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`;
}
export function summarizeDns(raw: unknown) {
  return arr(obj(raw)["Answer"]).slice(0, 20).map((a) => {
    const ans = obj(a);
    return { ttl: ans["TTL"] ?? null, data: str(ans["data"])?.slice(0, 300) ?? null };
  });
}
