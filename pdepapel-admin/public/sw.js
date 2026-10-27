// Avisos push del panel. A propósito sin `fetch` ni caché: el panel siempre
// va a la red y este archivo solo muestra el aviso y abre la conversación.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_error) {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title : "P de Papel";
  const body = typeof data.body === "string" ? data.body : "Una clienta te está esperando";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof data.tag === "string" ? data.tag : "clientas-esperando",
      renotify: true,
      icon: "/icons/icon-512.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          // Una pestaña que este worker no controla no se deja llevar: entonces se abre otra.
          return client.focus().then((focused) =>
            focused && "navigate" in focused ? focused.navigate(url).catch(() => self.clients.openWindow(url)) : self.clients.openWindow(url),
          );
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
