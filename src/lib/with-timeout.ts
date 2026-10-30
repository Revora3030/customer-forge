/**
 * The signed-in app's session check must not hang the page: supabase-js can
 * wait on its auth lock (another tab refreshing the token) or on a stalled
 * network call indefinitely, which left owners on a blank screen until a hard
 * reload. After the timeout the route errors, and its error screen has a retry.
 */
export const SESSION_CHECK_TIMEOUT_MS = 12_000;

export async function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms); // DevSkim: ignore DS172411 -- Fixed callback and caller-supplied numeric delay; no untrusted data.
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
