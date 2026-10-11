export type WorkerLoopOptions = {
  drain: () => Promise<unknown>;
  shouldStop: () => boolean;
  sleep: (milliseconds: number) => Promise<void>;
  onError: (error: unknown) => void;
  pollIntervalMs?: number;
  errorBackoffMs?: number;
};

export function workerPollInterval(value: string | undefined): number {
  if (value === undefined || value === "") return 2000;
  const interval = Number(value);
  if (!Number.isInteger(interval) || interval < 1000 || interval > 60000) {
    throw new Error("BUILD_WORKER_POLL_MS must be an integer from 1000 to 60000.");
  }
  return interval;
}

/** No HTTP request or browser lifecycle owns this loop. Each drain is awaited. */
export async function runBuildWorkerLoop(options: WorkerLoopOptions): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const errorBackoffMs = options.errorBackoffMs ?? 5000;
  let failures = 0;
  while (!options.shouldStop()) {
    try {
      await options.drain();
      failures = 0;
    } catch (error) {
      failures += 1;
      options.onError(error);
    }
    if (options.shouldStop()) break;
    const delay = failures
      ? Math.min(60000, errorBackoffMs * 2 ** Math.min(failures - 1, 4))
      : pollIntervalMs;
    await options.sleep(delay);
  }
}
