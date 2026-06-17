/* Service Worker de Forward_Chat: cachea estáticos para carga instantánea y soporte offline básico. */
const CACHE_NAME = "forward-chat-v1";
const PRECACHE = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Nunca interceptar tiempo real ni subidas
  if (url.pathname.startsWith("/socket.io") || url.pathname.startsWith("/upload")) return;

  // Estáticos con hash (assets/, fuentes, íconos, sonidos): cache-first
  const isStatic = /^\/(assets|icons|Sounds)\//.test(url.pathname) || /\.(css|js|woff2?|png|svg|jpe?g|webp|mp3)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navegación: red primero, caché como respaldo offline
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
  }
});
