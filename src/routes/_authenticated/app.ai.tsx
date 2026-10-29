import { createFileRoute, redirect } from "@tanstack/react-router";

/** Older links used /app/ai. The command center lives at /app/command. */
export const Route = createFileRoute("/_authenticated/app/ai")({
  beforeLoad: () => {
    throw redirect({ to: "/app/command" });
  },
});
