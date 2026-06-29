self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Marison - SIGAP";
  const body = payload.message || "Ada pembaruan yang perlu dicek.";
  const link = payload.link || "/dashboard";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.tag || "sigap-attention",
      renotify: true,
      data: { link },
      icon: "/marison-sigap-logo-v2.png",
      badge: "/marison-sigap-logo-v2.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.link || "/dashboard", self.location.origin).href;

  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientList) {
      if ("focus" in client) {
        client.navigate(targetUrl);
        return client.focus();
      }
    }
    return clients.openWindow(targetUrl);
  })());
});
