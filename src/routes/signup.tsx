import { createFileRoute, redirect } from "@tanstack/react-router";

/** Common typed URL; the real sign-up screen lives at /auth. */
export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    throw redirect({ to: "/auth", search: { mode: "signup" }, statusCode: 301 });
  },
});
