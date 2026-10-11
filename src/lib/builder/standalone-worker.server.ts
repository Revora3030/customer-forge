import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runBuildWorkerLoop, workerPollInterval } from "./worker-loop.server";

/** Run with Bun from the repo root, on an always-on trusted server. */
export async function main(): Promise<void> {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing worker environment variables: ${missing.join(", ")}`);
  const pollIntervalMs = workerPollInterval(process.env["BUILD_WORKER_POLL_MS"]);
  const [{ supabaseAdmin }, { drainSiteEngineQueue }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/site-engine.worker.server"),
  ]);
  let stopping = false;
  const stop = () => {
    stopping = true;
    console.info("[builder-worker] Shutdown requested; waiting for the current drain.");
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  console.info("[builder-worker] Independent runner started; browser connections are not required.");
  try {
    await runBuildWorkerLoop({
      drain: () => drainSiteEngineQueue(supabaseAdmin as never, { max: 1 }),
      shouldStop: () => stopping,
      sleep: (milliseconds) => new Promise((done) => setTimeout(done, milliseconds)),
      pollIntervalMs,
      onError: () => console.error("[builder-worker] Drain failed; retrying with bounded backoff. Check protected worker logs."),
    });
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch(() => {
    console.error("[builder-worker] Startup failed. Verify environment, dependencies and server runtime; no credentials are logged.");
    process.exitCode = 1;
  });
}
