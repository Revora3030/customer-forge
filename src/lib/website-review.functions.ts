import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgRole } from "@/lib/org-authz.server";

const reviewInput = z.object({
  organizationId: z.string().uuid(),
  state: z.enum(["approved", "changes_requested"]),
});

const releaseInput = z.object({ organizationId: z.string().uuid() });

/**
 * A super-admin releases a website stuck in `generating` after the build has
 * stopped. The row returns to review when a site was already generated, and
 * to onboarding when it never finished.
 */
export const releaseStuckGenerating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => releaseInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: readError } = await supabaseAdmin
      .from("website_settings")
      .select("review_state, generated_at")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (readError || !row) throw new Error("That website could not be read.");
    if (row.review_state !== "generating") return { state: row.review_state };
    const { data: job } = await supabaseAdmin
      .from("generation_jobs")
      .select("status")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (job?.status === "queued" || job?.status === "processing") {
      throw new Error("A build is still running. Wait until it finishes.");
    }
    const state = row.generated_at ? "ready_for_review" : "onboarding";
    const { error } = await supabaseAdmin
      .from("website_settings")
      .update({ review_state: state })
      .eq("organization_id", data.organizationId)
      .eq("review_state", "generating");
    if (error) throw new Error("The stuck build could not be released.");
    return { state };
  });

/** Review status is a trusted workflow action, not a browser-owned field update. */
export const setWebsiteReviewState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrgRole(
      context.supabase,
      data.organizationId,
      context.userId,
      "manager",
    );
    const approved = data.state === "approved";
    const { error } = await context.supabase
      .from("website_settings")
      .update({
        review_state: data.state,
        approved_at: approved ? new Date().toISOString() : null,
        approved_by: approved ? context.userId : null,
      })
      .eq("organization_id", organizationId);
    if (error) throw new Error("The website review status could not be updated.");
    return { state: data.state };
  });