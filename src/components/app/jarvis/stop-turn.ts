/** The error a stopped Jarvis turn rejects with, so callers can tell it from a real failure. */
export class JarvisTurnStopped extends Error {
  constructor() {
    super("Stopped.");
    this.name = "AbortError";
  }
}

export function isTurnStopped(error: unknown): boolean {
  return error instanceof JarvisTurnStopped || (error instanceof Error && error.name === "AbortError");
}

/**
 * Settles with the request, or rejects as soon as the owner presses Stop. The
 * request also receives the signal (so the browser drops the connection); a
 * result that still arrives after Stop is ignored, never shown.
 */
export function stoppable<T>(start: (signal: AbortSignal) => Promise<T>, controller: AbortController): Promise<T> {
  const { signal } = controller;
  if (signal.aborted) return Promise.reject(new JarvisTurnStopped());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new JarvisTurnStopped());
    signal.addEventListener("abort", onAbort, { once: true });
    start(signal).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) reject(new JarvisTurnStopped());
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(signal.aborted ? new JarvisTurnStopped() : error);
      },
    );
  });
}
