import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/instagram/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    let success = false;
    try {
      if (url.searchParams.has("error")) throw new Error("Instagram authorization was declined.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { finishInstagramOAuth } = await import("@/lib/instagram.server");
      await finishInstagramOAuth(supabaseAdmin, url.searchParams.get("state") ?? "", url.searchParams.get("code") ?? "");
      success = true;
    } catch {
      // Deliberately no URL, code, token, or raw provider response in logs/HTML.
    }
    return new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Instagram connection — Revora Growth Systems</title></head><body><h1>${success ? "Instagram connected" : "Instagram connection not completed"}</h1><p>${success ? "Return to Jarvis and refresh Instagram. Every post still needs your approval." : "Return to Jarvis and try connecting again. Check your Meta app settings if it continues."}</p><a href="/admin/jarvis">Return to Jarvis</a></body></html>`, {
      status: success ? 200 : 400,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" },
    });
  } } },
});