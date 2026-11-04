/**
 * Public liveness probe payload for uptime monitors. Deliberately exposes no
 * secrets, env values, or database state — only that the Worker is serving.
 */
export function publicHealthPayload(now: Date = new Date()) {
  return {
    status: "ok" as const,
    service: "revora-customer-forge",
    time: now.toISOString(),
  };
}

export function publicHealthResponse(method: string, now?: Date): Response {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(JSON.stringify(publicHealthPayload(now)), { status: 200, headers });
}
