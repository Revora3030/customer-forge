import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { reportRouteError } from "@/lib/route-error-reporting";

type AuthorizationDetails = {
  client?: { name?: string; redirect_uris?: string[] } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // SSR has no localStorage session and would redirect signed-in users.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // Preserve the full consent URL through sign-in and sign-up.
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const details = data as AuthorizationDetails | null;
    const immediate = details?.redirect_url ?? details?.redirect_to;
    if (immediate && !details?.client) throw redirect({ href: immediate });
    return details;
  },
  head: () => ({
    meta: [
      { title: "Connect an app — Revora" },
      { name: "description", content: "Authorize an app to use your Revora account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-md p-6 text-center">
        <h1 className="font-display text-[19px] font-semibold">Connection request unavailable</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          The link may have expired — start the connection again from the app you're linking.
        </p>
        <Link to="/" className="mt-4 inline-block text-[13px] text-primary hover:underline">
          Back to Revora
        </Link>
      </div>
    </main>
  ),
});

const IDENTITY_SCOPES: Record<string, string> = {
  openid: "Confirm your identity",
  email: "Share your email address",
  profile: "Share your basic profile",
};

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useState(() => {
    void supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch((err: unknown) => reportRouteError(err, { boundary: "oauth_consent_user" }));
  });

  const clientName = details?.client?.name ?? "an app";
  const redirectUri = details?.client?.redirect_uris?.[0] ?? null;
  const scopes = (details?.scope ?? "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: decisionError } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorization_id)
      : await supabase.auth.oauth.denyAuthorization(authorization_id);
    if (decisionError) {
      setBusy(false);
      setError(decisionError.message);
      return;
    }
    const target = (data as AuthorizationDetails | null)?.redirect_url ??
      (data as AuthorizationDetails | null)?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
          <Logo />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="panel w-full max-w-md p-6">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-5 text-primary" />
            <h1 className="font-display text-[19px] font-semibold leading-tight">
              Connect {clientName} to Revora
            </h1>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            This lets <span className="text-foreground">{clientName}</span> use Revora as you —
            it can call this app's enabled tools while you are signed in.
          </p>
          {email ? (
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Signed in as <span className="gold-hl">{email}</span>
            </p>
          ) : null}
          {redirectUri ? (
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Returns to <span className="break-all text-foreground">{redirectUri}</span>
            </p>
          ) : null}
          {scopes.length ? (
            <ul className="mt-4 space-y-1.5 text-[12.5px] text-muted-foreground">
              {scopes.map((scope) => (
                <li key={scope} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {IDENTITY_SCOPES[scope] ?? `Additional permission requested: ${scope}`}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-4 border-t border-border pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
            This does not bypass Revora's permissions or backend policies — you only share what
            your account can already see.
          </p>
          {error ? (
            <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-foreground">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex gap-3">
            <Button
              variant="signal"
              className="flex-1"
              disabled={busy}
              onClick={() => void decide(true)}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Approve
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => void decide(false)}
            >
              Cancel connection
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
