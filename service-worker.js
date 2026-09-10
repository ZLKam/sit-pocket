const CACHE_NAME = "sit-pocket-v11";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=9",
  "./app.js?v=7",
  "./calendar.js?v=2",
  "./manifest.webmanifest",
  "./icons/app-icon.svg",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
const APP_SHELL_URLS = new Set(APP_SHELL.map((path) => new URL(path, self.location.href).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html"))),
    );
    return;
  }

  if (!APP_SHELL_URLS.has(url.href)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() || {};
  } catch {
    message = { body: event.data?.text() || "A class is starting. Tap to check in." };
  }

  const title = String(message.title || "Class starting — check in").slice(0, 120);
  const options = {
    body: String(message.body || "Tap to open DigiPen Attendance.").slice(0, 240),
    icon: message.icon || "./icons/icon-192.png",
    badge: message.badge || "./icons/icon-192.png",
    tag: String(message.tag || "sit-pocket-attendance").slice(0, 180),
    data: {
      action: "attendance",
      eventId: String(message.data?.eventId || "").slice(0, 128),
    },
  };

  const work = [self.registration.showNotification(title, options)];
  if (self.navigator?.setAppBadge) work.push(self.navigator.setAppBadge(1).catch(() => {}));
  event.waitUntil(Promise.all(work));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL("./?action=attendance", self.registration.scope).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        const appClient = clientList.find((client) => client.url.startsWith(self.registration.scope));
        if (appClient) {
          try {
            if ("navigate" in appClient) await appClient.navigate(targetUrl);
            if ("focus" in appClient) return appClient.focus();
          } catch {
            // Fall through to opening a fresh app window if this client cannot navigate.
          }
        }
        return self.clients.openWindow(targetUrl);
      })
      .then(() => (self.navigator?.clearAppBadge ? self.navigator.clearAppBadge().catch(() => {}) : undefined)),
  );
});
