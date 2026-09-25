// TEMPORARY one-off: removes every sign-in account except the platform owner's.
// Only the verified super admin revorabusiness0@gmail.com may call it.
import { createFileRoute } from "@tanstack/react-router";

const OWNER = "revorabusiness0@gmail.com";

export const Route = createFileRoute("/api/admin-purge-accounts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: me } = await supabaseAdmin.auth.getUser(token);
        const user = me.user;
        if (!user || user.email?.toLowerCase() !== OWNER || !user.email_confirmed_at)
          return new Response("Forbidden", { status: 403 });
        const { data: role } = await supabaseAdmin
          .from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
        if (!role) return new Response("Forbidden", { status: 403 });

        const deleted: string[] = [];
        const failed: string[] = [];
        for (let page = 1; page < 20; page += 1) {
          const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) return new Response(error.message, { status: 500 });
          const others = data.users.filter((u) => u.id !== user.id);
          for (const u of others) {
            const { error: e } = await supabaseAdmin.auth.admin.deleteUser(u.id);
            (e ? failed : deleted).push(u.email ?? u.id);
          }
          if (data.users.length < 200) break;
        }
        return Response.json({ deleted: deleted.length, failed });
      },
    },
  },
});
