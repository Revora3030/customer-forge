import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/industries")({
  head: () => ({ meta: [{"title": "Business industries — Revora Growth Systems"}, {"name": "description", "content": "Explore Revora website and growth tools by industry."}, {"property": "og:title", "content": "Business industries — Revora Growth Systems"}, {"property": "og:description", "content": "Explore Revora website and growth tools by industry."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: () => <Outlet />,
});
