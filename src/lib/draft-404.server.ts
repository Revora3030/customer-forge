import type { SlugLookup } from "./draft-404";

/** Whether an organization with this slug exists (service role; reads only `id`). Null on any error. */
export const organizationSlugExists: SlugLookup = async (slug) => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (error) return null;
    return Boolean(data?.id);
  } catch {
    return null;
  }
};
