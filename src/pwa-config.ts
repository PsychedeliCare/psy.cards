/**
 * Shared PWA constants used by the Vite plugin and client UI.
 * Keep manifest fields in sync with astro.config.mjs workbox settings.
 */

export const PWA_THEME_COLOR = "#0b0b0c";
export const PWA_BACKGROUND_COLOR = "#0b0b0c";
export const PWA_START_URL = "/combos";

/** HTML/JSON routes that should not fall back to the combos shell. */
export const PWA_NAVIGATE_FALLBACK_DENYLIST = [
  /^\/card\//,
  /^\/combo-data\//,
  /^\/data\//,
  /^\/(?:fr|de|it)\/card\//,
  /^\/(?:fr|de|it)\/combo-data\//,
  /^\/burning-mountain\//,
  /^\/(?:fr|de|it)\/burning-mountain\//,
];

export const PWA_GLOB_PATTERNS = [
  "**/*.{html,js,css,woff2,svg,png,jpg,webp,json}",
];

/** Redundant font formats — woff2 is enough for offline use. */
export const PWA_GLOB_IGNORES = [
  "**/*.{ttf,woff,eot}",
  "**/node_modules/**",
];

/** Allow large font assets and hero images in the precache manifest. */
export const PWA_MAX_CACHE_BYTES = 5 * 1024 * 1024;
