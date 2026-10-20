/// <reference lib="webworker" />
/**
 * The psy.cards service worker (built by @vite-pwa/astro, `injectManifest`).
 *
 * It only ever answers with the document that was asked for:
 *
 * - Every page is precached once, under its canonical URL (`/mdma/`), which
 *   Cloudflare serves without a redirect. `/mdma`, `/mdma/index.html` and
 *   any query string (`?combo=…`, `?s=…`) find that same entry, so offline
 *   use and the app's own slash-less links work without a network trip.
 * - Nothing else stands in for a page. There is no catch-all "offline
 *   shell": a URL that isn't precached (a page added after this worker was
 *   installed, an unlisted page, a typo) goes to the network, so a new page
 *   can never be replaced by another one — which previously sent /about into
 *   a reload loop, as the combos shell kept re-requesting its own URL.
 * - A new deploy takes over as soon as its worker is installed instead of
 *   waiting for every tab to close; the page reloads into it (pwa.ts).
 *
 * scripts/check-service-worker.mjs verifies the built worker after every
 * build.
 */
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Answers "which worker are you?" so a page left over from an older worker
// (see the update card in src/worker.js) knows it can reload into this one.
const WORKER_VERSION = 2;
self.addEventListener("message", (event) => {
  if (event.data?.type === "psy:version") event.ports[0]?.postMessage(WORKER_VERSION);
});

// Workers before this one kept card fragments in "psy-cards-content", served
// cache-first for a year; drop it so nothing from them outlives the switch.
const LEGACY_CACHES = ["psy-cards-content"];
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all(LEGACY_CACHES.map((name) => caches.delete(name))));
});

/** A path to a page rather than a file: no extension in its last segment. */
function isPagePath(pathname: string): boolean {
  const last = pathname.split("/").pop() ?? "";
  return !last.includes(".") || last === "index.html";
}

precacheAndRoute(self.__WB_MANIFEST, {
  // Pages are precached as `x/`; the lookups below cover the other spellings.
  directoryIndex: "",
  cleanURLs: false,
  ignoreURLParametersMatching: [/.*/],
  urlManipulation: ({ url }) => {
    if (!isPagePath(url.pathname)) return [];
    const canonical = new URL(url.origin);
    canonical.pathname = url.pathname.replace(/index\.html$/, "").replace(/\/?$/, "/");
    return [canonical];
  },
});

// Card fragments, combination data and country files that are not in the
// precache (or were fetched before it finished) are kept once seen.
registerRoute(
  ({ url, request }) =>
    request.method === "GET" && /^\/(?:(?:fr|de|it)\/)?(?:card|combo-data|data)\//.test(url.pathname),
  new CacheFirst({
    cacheName: "psy-cards-content-v2",
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);
