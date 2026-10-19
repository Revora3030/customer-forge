import type { MiddlewareHandler } from 'astro';

export const onRequest: MiddlewareHandler = async ({ request, redirect, locals }, next) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Number(import.meta.env.SERVER_TIMEOUT_MS ?? 120000));
    request.signal = controller.signal;
    const res = await next();
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      return new Response('Request timeout', { status: 504 });
    }
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' });
  }
};
