/**
 * Service worker — la app funciona sin red de verdad.
 *
 * Sin esto, "funciona offline" dependería de que el servidor de desarrollo
 * siguiera corriendo, lo cual no es una demostración honesta. Con esto, la app
 * queda instalada y cacheada en el dispositivo.
 *
 * Dos cachés:
 *  - app-shell: el HTML, JS y CSS de la app. Cache-first tras la instalación.
 *  - modelos:   los pesos de Whisper. Se descargan una vez y quedan para siempre.
 */

const VERSION = 'rebuild-v1';
const SHELL = `${VERSION}-shell`;
const MODELOS = `${VERSION}-modelos`;

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(SHELL).then((cache) =>
      // Solo lo mínimo indispensable: el resto entra por runtime caching.
      cache.addAll(['./', './index.html', './manifest.webmanifest', './rumi.svg']).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca cachear las llamadas al modelo local ni a Gemini.
  if (url.port === '11434' || url.hostname.includes('googleapis.com')) return;

  // Pesos de Whisper: cache-first y para siempre. Es lo que permite que el
  // oído offline funcione tras la primera carga.
  if (url.hostname.includes('huggingface.co') || url.hostname.includes('hf.co')) {
    evento.respondWith(
      caches.open(MODELOS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // Navegación: la app shell, con la red como refuerzo.
  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put('./index.html', res.clone()));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Resto de recursos: cache-first, se rellena solo.
  evento.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request)
          .then((res) => {
            if (res.ok && url.origin === self.location.origin) {
              caches.open(SHELL).then((c) => c.put(request, res.clone()));
            }
            return res;
          })
          .catch(() => hit)
    )
  );
});
