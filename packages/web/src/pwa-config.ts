/**
 * Shared PWA constants used by the Vite plugin and client UI.
 * Keep manifest fields in sync with astro.config.mjs workbox settings.
 */

export const PWA_THEME_COLOR = "#0b0b0c";
export const PWA_BACKGROUND_COLOR = "#0b0b0c";
export const PWA_START_URL = "/";

export const PWA_GLOB_PATTERNS = [
  "**/*.{html,js,css,woff2,svg,png,jpg,webp,json}",
];

/**
 * Redundant font formats — woff2 is enough for offline use. The 3D logo
 * (/logo, and the /about hero that reuses it) bundles three.js into the
 * `scene` chunk; it is decoration, so offline installs skip it. /about is an
 * unlisted landing page: installs never download it or its own assets.
 */
export const PWA_GLOB_IGNORES = [
  "**/*.{ttf,woff,eot}",
  "**/node_modules/**",
  "logo/**",
  "_astro/logo.astro_*.js",
  "_astro/scene.*.js",
  "about/**",
  "_astro/AboutPage.astro_*.js",
  "_astro/about.*.css",
];

/** Allow large font assets and hero images in the precache manifest. */
export const PWA_MAX_CACHE_BYTES = 5 * 1024 * 1024;

type PrecacheEntry = { url: string; revision: string | null; size: number };

/**
 * The URL a built page is served at without a redirect. Astro writes
 * `mdma/index.html`; Cloudflare answers `/mdma/index.html` and `/mdma` with a
 * 307 to `/mdma/`. Precaching a redirecting URL costs a redirect per page at
 * install (and Safari rejects redirected responses for navigations), so each
 * page is precached once, as `mdma/`. The service worker (src/sw.ts) maps
 * the other spellings onto it.
 */
export function canonicalPageUrl(url: string): string {
  if (url === "index.html") return "./";
  if (url.endsWith("/index.html")) return url.slice(0, -"index.html".length);
  return url.replace(/\.html$/, "");
}

/** Workbox manifest transform applying `canonicalPageUrl` to every page. */
export function canonicalPageEntries(entries: PrecacheEntry[]) {
  return {
    manifest: entries.map((entry) => (entry.url.endsWith(".html") ? { ...entry, url: canonicalPageUrl(entry.url) } : entry)),
    warnings: [] as string[],
  };
}
