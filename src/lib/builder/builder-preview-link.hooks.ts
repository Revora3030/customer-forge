import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createPreviewLink } from "@/lib/preview-links.functions";
import {
  BUILDER_PREVIEW_HOURS,
  BUILDER_PREVIEW_LABEL,
  BUILDER_PREVIEW_REFRESH_MS,
  isFreshBuilderToken,
  readCachedBuilderToken,
  writeCachedBuilderToken,
  type BuilderPreviewToken,
} from "@/lib/builder/builder-preview-link";

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * The builder's own private preview link (see builder-preview-link.ts), or
 * a null token while it is being fetched, for members who may not create links, or
 * when anything fails — the builder then keeps the signed-in `/draft` frame,
 * exactly as before. It never shows a toast and never touches the share list.
 *
 * Order: this tab's cached link → a still-valid builder link already saved for
 * the workspace (no new row) → a new link minted by the normal server check.
 */
export function useBuilderPreviewToken(
  organizationId: string | null | undefined,
  canManage: boolean,
): { token: string | null; settled: boolean } {
  const create = useServerFn(createPreviewLink);
  const query = useQuery({
    queryKey: ["builder-preview-token", organizationId],
    enabled: Boolean(organizationId) && canManage,
    retry: false,
    // Re-checked often enough that a link is replaced before it runs out.
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<BuilderPreviewToken | null> => {
      const orgId = String(organizationId);
      const storage = sessionStore();
      const cached = readCachedBuilderToken(storage, orgId);
      if (cached) return cached;
      try {
        const { data } = await supabase
          .from("website_preview_links")
          .select("token, expires_at")
          .eq("organization_id", orgId)
          .eq("label", BUILDER_PREVIEW_LABEL)
          .eq("revoked", false)
          .gt("expires_at", new Date(Date.now() + BUILDER_PREVIEW_REFRESH_MS).toISOString())
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const existing = data ? { token: String(data.token), expiresAt: String(data.expires_at) } : null;
        if (existing && isFreshBuilderToken(existing)) {
          writeCachedBuilderToken(storage, orgId, existing);
          return existing;
        }
        const startedAt = Date.now();
        const { token } = await create({ data: { organizationId: orgId, label: BUILDER_PREVIEW_LABEL, hours: BUILDER_PREVIEW_HOURS } });
        const minted = { token, expiresAt: new Date(startedAt + BUILDER_PREVIEW_HOURS * 3600_000).toISOString() };
        writeCachedBuilderToken(storage, orgId, minted);
        return minted;
      } catch {
        return null;
      }
    },
  });
  const enabled = Boolean(organizationId) && canManage;
  const value = query.data ?? null;
  return {
    token: value && isFreshBuilderToken(value) ? value.token : null,
    // Settled: the frame can load now without switching address a moment later.
    settled: !enabled || query.isFetched || query.isError,
  };
}
