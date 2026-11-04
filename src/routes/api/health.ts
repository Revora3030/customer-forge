import { createFileRoute } from "@tanstack/react-router";
import { publicHealthResponse } from "@/lib/public-health";

/** Unauthenticated liveness probe for uptime monitors: GET/HEAD /api/health. */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => publicHealthResponse("GET"),
      HEAD: async () => publicHealthResponse("HEAD"),
    },
  },
});
