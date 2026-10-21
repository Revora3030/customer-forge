import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  validateQueueEventInput,
  validateReviewRequestInput,
  type QueueDeps,
} from "@/lib/automation-queue.server";

/**
 * Server entry points for queueing automation messages. The browser names the
 * workspace, the event and the record; everything that is sent (trigger event,
 * recipient, subject, body) is derived on the server from tenant data.
 */
async function queueDeps(): Promise<QueueDeps> {
  const [{ supabaseAdmin }, { deliverRun }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/messaging.server"),
  ]);
  return {
    admin: supabaseAdmin,
    deliverFor: (ctx) => (run) => deliverRun(run, ctx),
  };
}

/** Queues (and delivers what is due of) the workspace's automations for one event. */
export const queueAutomationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateQueueEventInput)
  .handler(async ({ data, context }) => {
    const { queueAutomationEventFor } = await import("@/lib/automation-queue.server");
    return queueAutomationEventFor(context.supabase, context.userId, data, await queueDeps());
  });

/** Queues one review request for a completed booking, to that booking's own contact. */
export const requestReviewForAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateReviewRequestInput)
  .handler(async ({ data, context }) => {
    const { requestReviewFor } = await import("@/lib/automation-queue.server");
    return requestReviewFor(context.supabase, context.userId, data, await queueDeps());
  });
