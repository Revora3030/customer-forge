/**
 * Run one build stage at most once per set of inputs.
 *
 * A stage that already finished for this job with the SAME inputs is read back
 * from the job's stage checkpoints instead of being run (and paid for) again.
 * Changed inputs never match (the store compares digests), so a resume can
 * never keep work that belongs to an older answer.
 */
export type StageCheckpointStore = {
  get<T>(key: string, inputs: unknown): Promise<T | null>;
  put(key: string, inputs: unknown, value: unknown): Promise<boolean>;
};

export type StageRun<T> = {
  value: T;
  /** False when the stage only partly worked (an error was swallowed): nothing is saved, so the next attempt retries it. */
  complete: boolean;
};

export async function resumeOrRunStage<T>(
  store: StageCheckpointStore | null | undefined,
  key: string,
  inputs: unknown,
  run: () => Promise<StageRun<T>>,
): Promise<{ value: T; resumed: boolean; saved: boolean }> {
  if (store) {
    const saved = await store.get<T>(key, inputs).catch(() => null);
    if (saved !== null && saved !== undefined) return { value: saved, resumed: true, saved: false };
  }
  const ran = await run();
  let saved = false;
  if (store && ran.complete) saved = await store.put(key, inputs, ran.value).catch(() => false);
  return { value: ran.value, resumed: false, saved };
}
