/**
 * Streams a JSON result while a long job runs, sending one space every
 * `intervalMs` until the result is ready. The hosting proxy closes requests
 * that send nothing for ~100 seconds, and closing the request stops the
 * worker mid-build (seen: three builds cut off ~90-110s into a page plan).
 * Leading whitespace is valid JSON, so callers still parse the body as JSON.
 */
export function keepAliveJsonResponse(
  work: Promise<unknown>,
  onError: (error: unknown) => unknown,
  intervalMs = 15_000,
): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(" "));
      timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(" "));
        } catch {
          // Stream already closed by the client.
        }
      }, intervalMs);
      void work
        .then((value) => value, (error: unknown) => onError(error))
        .then((value) => {
          if (timer) clearInterval(timer);
          try {
            controller.enqueue(encoder.encode(JSON.stringify(value)));
            controller.close();
          } catch {
            // Client gone; the database lease and checkpoints carry the build.
          }
        });
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
