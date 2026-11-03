import { createFileRoute } from "@tanstack/react-router";

/**
 * Web app manifest so the Revora dashboard can be installed to a phone or
 * desktop home screen and open in its own window.
 */
export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          JSON.stringify({
            name: "Revora Growth Systems",
            short_name: "Revora",
            description:
              "Your website, quotes, bookings, follow-up and reviews in one growth system.",
            start_url: "/app",
            scope: "/",
            display: "standalone",
            orientation: "portrait-primary",
            background_color: "#0A0A0C",
            theme_color: "#0A0A0C",
            icons: [
              { src: "/favicon.png", sizes: "64x64", type: "image/png" },
              {
                src: "/apple-touch-icon.png",
                sizes: "180x180",
                type: "image/png",
                purpose: "any maskable",
              },
              {
                src: "/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any maskable",
              },
              {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any maskable",
              },
            ],
            shortcuts: [
              { name: "My dashboard", url: "/app" },
              { name: "My leads", url: "/app/leads" },
              { name: "My website", url: "/app/website" },
            ],
          }),
          {
            headers: {
              "content-type": "application/manifest+json; charset=utf-8",
              "cache-control": "public, max-age=3600",
            },
          },
        ),
    },
  },
});
