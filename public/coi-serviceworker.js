/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
/*
 * This service worker ensures the page is served in a cross-origin isolated
 * context (crossOriginIsolated = true) by injecting the required headers:
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: credentialless
 *
 * expo-sqlite on the web uses OPFS (Origin Private File System) via
 * navigator.storage.getDirectory(), which requires crossOriginIsolated = true.
 * Without it, a SecurityError is thrown even if the server sends the headers,
 * because some CDN edges (including Vercel) may not propagate them reliably.
 */
let coepCredentialless = true;

if (typeof window === 'undefined') {
  // ---- Service worker context ----

  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('message', (ev) => {
    if (!ev.data) return;
    if (ev.data.type === 'deregister') {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => clients.forEach((c) => c.navigate(c.url)));
    } else if (ev.data.type === 'coepCredentialless') {
      coepCredentialless = ev.data.value;
    }
  });

  self.addEventListener('fetch', (event) => {
    const r = event.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

    const request =
      coepCredentialless && r.mode === 'no-cors'
        ? new Request(r, { credentials: 'omit' })
        : r;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) return response;
          const newHeaders = new Headers(response.headers);
          newHeaders.set(
            'Cross-Origin-Embedder-Policy',
            coepCredentialless ? 'credentialless' : 'require-corp',
          );
          if (!coepCredentialless) {
            newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
          }
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e)),
    );
  });
} else {
  // ---- Window context: register the service worker ----

  (() => {
    if (!window.crossOriginIsolated) {
      // Not yet isolated — register (or re-use) this service worker, then reload
      // so the next request is served by the SW with the proper headers.
      navigator.serviceWorker
        .register(window.location.pathname.replace(/\/[^/]*$/, '/') + 'coi-serviceworker.js')
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            // New SW installed — reload once it activates.
            reg.installing?.addEventListener('statechange', (e) => {
              if (e.target.state === 'activated') window.location.reload();
            });
          });
          if (reg.active && !navigator.serviceWorker.controller) {
            // SW already active but not yet controlling this page — reload.
            window.location.reload();
          }
        })
        .catch((e) => console.warn('coi-serviceworker registration failed:', e));
    }
  })();
}
