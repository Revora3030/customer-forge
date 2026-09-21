/**
 * The sign-in / sign-up affordance, in one place.
 *
 * Every public page reaches the same two doors — create an account, or come
 * back to an existing one — and every one of them is driven by the live
 * session, so a signed-in visitor is never shown a "Sign in" button that
 * bounces them straight back to where they were. Signed in, the same slot
 * becomes their dashboard and a way to sign out.
 *
 * `hero` is the large pair used inside a page's opening section, `compact` is
 * the small pair that sits in the phone header beside the menu button.
 */
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, LogIn, LogOut, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-session";
import { useSignOut } from "@/lib/use-tenant";
import { GROWTH_SYSTEM } from "@/lib/offer";

/** Where a new account lands after signing up, and where a return visit lands. */
export const SIGN_UP_SEARCH = { mode: "signup", redirect: "/get-started" } as const;
export const SIGN_IN_SEARCH = { mode: "signin", redirect: "/app" } as const;

export function AuthActions({
  className = "",
  variant = "hero",
  onNavigate,
}: {
  className?: string;
  variant?: "hero" | "compact";
  onNavigate?: () => void;
}) {
  const { loading, user } = useSession();
  const signOut = useSignOut();
  const signedIn = !loading && user !== null;
  const compact = variant === "compact";
  const size = compact ? "sm" : "lg";

  if (signedIn)
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Button asChild variant="signal" size={size}>
          <Link to="/app" onClick={onNavigate}>
            <LayoutDashboard className="size-4" aria-hidden="true" />
            {compact ? "Dashboard" : "Go to my dashboard"}
          </Link>
        </Button>
        <Button
          variant={compact ? "ghost" : "outline"}
          size={size}
          onClick={() => {
            onNavigate?.();
            void signOut();
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>
    );

  return (
    <div
      className={
        compact
          ? `flex items-center gap-1.5 ${className}`
          : `flex flex-col gap-3 sm:flex-row sm:items-center ${className}`
      }
    >
      <Button asChild variant="signal" size={size}>
        <Link to="/auth" search={SIGN_UP_SEARCH} onClick={onNavigate}>
          <UserPlus className="size-4" aria-hidden="true" />
          {compact
            ? "Sign up"
            : `Sign up free — ${GROWTH_SYSTEM.fullAccessWindow} full access`}
        </Link>
      </Button>
      <Button asChild variant={compact ? "ghost" : "outline"} size={size}>
        <Link to="/auth" search={SIGN_IN_SEARCH} onClick={onNavigate}>
          <LogIn className="size-4" aria-hidden="true" />
          Sign in
        </Link>
      </Button>
    </div>
  );
}

/** One line of reassurance under the hero pair. Never shown to a signed-in visitor. */
export function AuthHint({ className = "" }: { className?: string }) {
  // Shown until we know there is a session — a visitor should never wait on a
  // session check to be told where to sign in.
  const { user } = useSession();
  if (user) return null;
  return (
    <p className={`text-[12.5px] text-muted-foreground ${className}`}>
      No card needed to start. Already have a Revora account?{" "}
      <Link
        to="/auth"
        search={SIGN_IN_SEARCH}
        className="text-primary underline-offset-2 hover:underline"
      >
        Sign in here
      </Link>
      .
    </p>
  );
}
