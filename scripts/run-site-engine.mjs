// No dependencies or credential output. Node 22+, run only on a trusted runner.
const base = process.env.APP_URL;
const secret = process.env.LOVABLE_CRON_SECRET;
if (!base || !secret) throw new Error("REVORA_APP_URL and LOVABLE_CRON_SECRET must be configured.");
const origin = new URL(base);
if (origin.protocol !== "https:" || origin.username || origin.password)
  throw new Error("REVORA_APP_URL must be an HTTPS origin without credentials.");
const endpoint = new URL("/api/public/jobs/site-engine", origin.origin);
try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    redirect: "error",
    signal: AbortSignal.timeout(25 * 60_000),
  });
  if (!response.ok) throw new Error(`Worker endpoint returned HTTP ${response.status}.`);
  const result = await response.json();
  if (typeof result.processed !== "number" || typeof result.failed !== "number" || typeof result.paused !== "boolean")
    throw new Error("Worker endpoint did not return a valid queue result.");
  console.log(JSON.stringify({ processed: result.processed, failed: result.failed, paused: result.paused, idle: result.idle }));
  if (result.failed > 0) throw new Error("A build attempt failed. Inspect the job's failure_kind/current_step before retrying.");
  if (result.paused) console.log("Queue is paused by an operator; no automatic override was attempted.");
} catch (error) {
  // Network exceptions may contain URLs; do not dump requests or headers.
  console.error(error instanceof Error && /^(Worker endpoint|A build attempt)/.test(error.message)
    ? error.message
    : "Queue runner could not complete. Inspect app logs and runner configuration.");
  process.exitCode = 1;
}
