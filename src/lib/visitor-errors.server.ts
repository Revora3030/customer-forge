import type { SupabaseClient } from "@supabase/supabase-js";
import { clientErrorIp } from "@/lib/client-error-rate-limit";
import { MAX_VISITOR_ERROR_BYTES, VISITOR_ERROR_RATE_LIMIT, parseVisitorError, visitorErrorHash } from "@/lib/visitor-errors";

/**
 * POST handler for /api/public/visitor-errors. Always answers 204 (even for an
 * unknown site or a dropped report) so it can't be used to probe site ids and
 * so the visitor's page never sees a failure. Malformed bodies get 400 and
 * floods get 429; neither is shown to visitors.
 */
const recent = new Map<string, number[]>();
export function visitorErrorRateLimited(key: string, now = Date.now()): boolean {
  const since = now - 60_000;
  const hits = (recent.get(key) ?? []).filter((at) => at > since);
  if (hits.length >= VISITOR_ERROR_RATE_LIMIT) {
    recent.set(key, hits);
    return true;
  }
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5_000) for (const [k, t] of recent) if (!t.some((at) => at > since)) recent.delete(k);
  return false;
}
export function resetVisitorErrorRateLimit() {
  recent.clear();
}

export async function handleVisitorErrorRequest(request: Request, admin: SupabaseClient): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_VISITOR_ERROR_BYTES) return new Response(null, { status: 413 });
  let text: string;
  try {
    text = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  const report = parseVisitorError(text);
  if (!report) return new Response(null, { status: 400 });
  if (visitorErrorRateLimited(`${report.organizationId}|${clientErrorIp(request.headers)}`)) return new Response(null, { status: 429 });
  try {
    await admin.rpc("record_visitor_error", {
      p_organization_id: report.organizationId,
      p_kind: report.kind,
      p_hash: visitorErrorHash(report.kind, report.message),
      p_message: report.message,
      p_path: report.path,
    });
  } catch {
    // Never surface a storage problem to a visitor's page.
  }
  return new Response(null, { status: 204 });
}
