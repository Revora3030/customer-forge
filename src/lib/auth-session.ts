/**
 * Client-side session helpers.
 *
 * Supabase persists the session in local storage and refreshes it silently, so
 * a returning client is signed in automatically. These helpers expose that
 * session to the UI and make sure every account has a saved profile row.
 */
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SessionState = {
  loading: boolean;
  user: User | null;
};

/** Live session state for marketing/public surfaces (client-only). */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ loading: true, user: null });

  useEffect(() => {
    let active = true;
    // Public surfaces must keep rendering as signed-out when the auth client
    // cannot start, instead of throwing out of render and blanking the page.
    let unsubscribe: (() => void) | undefined;
    try {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (active) setState({ loading: false, user: data.session?.user ?? null });
        })
        .catch(() => {
          if (active) setState({ loading: false, user: null });
        });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (active) setState({ loading: false, user: session?.user ?? null });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      setState({ loading: false, user: null });
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return state;
}

/* ------------------------------------------------------------------ *
 * "Remember me"
 *
 * Supabase always persists the session on the device. When a client opts
 * OUT of being remembered we keep the session for the life of the browser
 * tab only: the choice lives in local storage, and a per-tab marker in
 * session storage proves the tab is the same one that signed in. A fresh
 * tab/relaunch with no marker means the session must be ended.
 * ------------------------------------------------------------------ */
const REMEMBER_KEY = "revora:remember";
const TAB_KEY = "revora:tab-session";

export function setRememberPreference(remember: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    if (remember) sessionStorage.removeItem(TAB_KEY);
    else sessionStorage.setItem(TAB_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export function rememberPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Ends session-only logins that outlived their tab. Returns true when the
 * session was cleared (caller should treat the visitor as signed out).
 */
export async function enforceSessionPolicy(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (rememberPreference()) return false;
  let sameTab = true;
  try {
    sameTab = sessionStorage.getItem(TAB_KEY) === "1";
  } catch {
    return false;
  }
  if (sameTab) return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  await supabase.auth.signOut();
  return true;
}

export function clearSessionPolicy(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TAB_KEY);
    localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function displayName(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata as { full_name?: string; name?: string } | null;
  return meta?.full_name || meta?.name || user.email?.split("@")[0] || "Your account";
}

/**
 * Saves the signed-in client's details so they persist across sessions and
 * devices. Safe to call repeatedly — it upserts on the user id.
 */
export async function ensureProfile(user?: User | null): Promise<void> {
  const current = user ?? (await supabase.auth.getUser()).data.user;
  if (!current) return;
  const meta = current.user_metadata as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  } | null;
  await supabase.from("profiles").upsert(
    {
      id: current.id,
      email: current.email ?? null,
      full_name: meta?.full_name || meta?.name || null,
      avatar_url: meta?.avatar_url || meta?.picture || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

/**
 * Resolves where a signed-in client belongs based on their tenant/workspace
 * access, so login always lands on the right dashboard:
 *  - no workspace yet -> onboarding
 *  - workspace with incomplete onboarding -> onboarding
 *  - workspace ready -> /app
 *  - platform staff with no client workspace -> /admin
 */
export async function resolvePostLoginPath(): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return "/auth";

  const [{ data: memberships }, { data: roles }] = await Promise.all([
    supabase
      .from("memberships")
      .select("organization_id, organizations(onboarding_completed)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const first = (memberships ?? []).find((m) => m.organizations);
  if (first?.organizations) {
    const org = first.organizations as { onboarding_completed: boolean | null };
    return org.onboarding_completed ? "/app" : "/onboarding";
  }

  const isSuperAdmin = (roles ?? []).some((r) => r.role === "super_admin");
  return isSuperAdmin ? "/admin" : "/onboarding";
}
