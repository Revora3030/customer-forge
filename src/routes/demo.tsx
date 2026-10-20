import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/demo")({
  head: () => ({ meta: [{"title": "Workspace demo — Revora Growth Systems"}, {"name": "description", "content": "Explore the Revora workspace demonstration."}, {"property": "og:title", "content": "Workspace demo — Revora Growth Systems"}, {"property": "og:description", "content": "Explore the Revora workspace demonstration."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: () => <Outlet />,
});
