/** Plain-English "why" lines for a suggestion's stored evidence. Only facts in the row; nothing invented. */
const day = (iso: unknown) => (typeof iso === "string" && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function evidenceLines(signal: string, e: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (cond: unknown, line: string) => { if (cond !== null && cond !== undefined && cond !== false) out.push(line); };
  switch (signal) {
    case "unanswered_leads":
      push(num(e["count"]), `${num(e["count"])} lead${num(e["count"]) === 1 ? "" : "s"} still marked new after 24 hours`);
      push(day(e["oldestAt"]), `Oldest from ${day(e["oldestAt"])}`);
      break;
    case "no_review_asks":
      push(num(e["daysSince"]), `${num(e["daysSince"])} days since the last review request`);
      break;
    case "empty_hours":
      push(num(e["openDaysNext7"]), `${num(e["openDaysNext7"])} open days in the next 7, 0 bookings`);
      break;
    case "domain_unverified":
      push(typeof e["customDomain"] === "string", `${String(e["customDomain"])} isn't verified yet${typeof e["status"] === "string" ? ` (status: ${e["status"]})` : ""}`);
      break;
    case "traffic_drop":
      push(num(e["last7"]) !== null && num(e["prior7"]) !== null, `${num(e["last7"])} page views in the last 7 days vs ${num(e["prior7"])} the week before`);
      break;
    case "stale_site":
      push(num(e["daysSince"]), `Last published ${num(e["daysSince"])} days ago${day(e["lastPublishedAt"]) ? ` (${day(e["lastPublishedAt"])})` : ""}`);
      break;
  }
  return out.slice(0, 3);
}
