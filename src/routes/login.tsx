import { createFileRoute, redirect } from "@tanstack/react-router";

/** Common typed URL; the real sign-in screen lives at /auth. */
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    throw redirect({ to: "/auth", search: { mode: "signin" }, statusCode: 301 });
  },
});
