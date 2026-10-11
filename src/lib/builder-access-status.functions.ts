import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBuilderAccessStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ organizationId: z.string().trim().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { readBuilderAccessStatus } = await import("@/lib/builder-access-status.server");
    return readBuilderAccessStatus(context.supabase, String(context.userId), data.organizationId);
  });
