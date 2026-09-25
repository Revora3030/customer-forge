import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgRole } from "@/lib/org-authz.server";

const reviewInput = z.object({
  organizationId: z.string().uuid(),
  state: z.enum(["approved", "changes_requested"]),
});

/** Review status is a trusted workflow action, not a browser-owned field update. */
export const setWebsiteReviewState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewInput.parse(input))
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