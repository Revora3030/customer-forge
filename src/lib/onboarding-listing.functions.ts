import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ListingSuggestion = {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
};

export type ListingLookup = { ok: true; listings: ListingSuggestion[] } | { ok: false; message: string };

/**
 * Signed-in customers look up their own public Google listing during signup so
 * real contact details can be offered for confirmation. Only contact fields are
 * returned — ratings and review counts never flow into a generated site from
 * here. Lookups are cached for six hours by the Maps helper.
 */
export const findMyGoogleListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { query: string }) => {
    const query = String(input?.query ?? "").trim().slice(0, 160);
    if (query.length < 3) throw new Error("Enter your business name and town first.");
    return { query };
  })
  .handler(async ({ data }): Promise<ListingLookup> => {
    try {
      const { localListings } = await import("@/lib/integrations/google.server");
      const listings = await localListings(data.query);
      return {
        ok: true,
        listings: listings
          .filter((l) => l.name)
          .slice(0, 3)
          .map((l) => ({ name: l.name, address: l.address, phone: l.phone, website: l.website })),
      };
    } catch (error) {
      console.warn("google listing lookup failed", (error as Error).message);
      return { ok: false, message: "Google didn't answer just now. You can type your details instead." };
    }
  });
