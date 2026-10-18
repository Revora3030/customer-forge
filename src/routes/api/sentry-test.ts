import type { APIRoute } from 'astro';
import * as Sentry from '@sentry/node';

export const GET: APIRoute = async () => {
  try {
    Sentry.captureMessage('Sentry health‑check test');
    await Sentry.flush(2000);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Sentry test failed', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};