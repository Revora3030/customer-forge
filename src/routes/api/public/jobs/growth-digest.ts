/**
 * Daily Growth Engine digest: one email to the platform owner with the count
 * of items waiting for approval. Sends nothing when the queue is empty.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { methodNotAllowed } from "@/lib/method-not-allowed";

const OWNER_EMAIL = "revorabusiness0@gmail.com";

export const Route = createFileRoute("/api/public/jobs/growth-digest")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { count, error } = await supabaseAdmin
          .from("approval_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!count) return Response.json({ ok: true, sent: false });
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        try {
          const day = new Date().toISOString().slice(0, 10);
          await sendTemplateEmail("automation-message", OWNER_EMAIL, {
            idempotencyKey: `growth-digest-${day}`,
            templateData: {
              businessName: "Revora Growth Systems",
              heading: `${count} item${count === 1 ? "" : "s"} waiting for your approval`,
              message: `Jarvis has ${count} Growth Engine draft${count === 1 ? "" : "s"} ready.\n\nReview them at https://revoragrowthsystems.com/admin/growth\n\nRevora Growth Systems · ${process.env["REVORA_MAILING_ADDRESS"] ?? ""}`,
              signoff: "Jarvis",
            },
          });
        } catch (e) {
          const { captureError } = await import("@/lib/monitoring.server");
          await captureError(e, { route: "growth-digest" });
          return Response.json({ ok: false }, { status: 502 });
        }
        return Response.json({ ok: true, sent: true, count });
      },
    },
  },
});
