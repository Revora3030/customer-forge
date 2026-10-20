import { createFileRoute } from "@tanstack/react-router";

/**
 * Live Google Maps photo for a prospect demo. Public because demo previews are
 * public links; it only serves photos of the place recorded on that demo, and
 * redirects to Google instead of storing copies (Google's terms).
 */
export const Route = createFileRoute("/api/public/maps-photo/$org/$index")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleMapsPhotoRequest } = await import("@/lib/maps-photos.server");
        return handleMapsPhotoRequest(supabaseAdmin as never, params.org, params.index);
      },
    },
  },
});
