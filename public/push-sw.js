/* Revora owner push alerts service worker.
 * Registered by the dashboard with scope /app/__push/ so it never controls or
 * caches any page; it only shows lead notifications and opens the lead. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_error) {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title : "New lead — reply fast";
  const url = typeof data.url === "string" && data.url.startsWith("/app") ? data.url : "/app/leads";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "Open Revora to respond.",
      icon: "/icon-192.png",
      badge: "/favicon.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      renotify: true,
      requireInteraction: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/app/leads", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin && "focus" in client) {
          return client.navigate(target.href).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
