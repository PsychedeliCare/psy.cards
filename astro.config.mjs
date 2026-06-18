// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import icon from '@twodft/astro-icon';
import AstroPWA from '@vite-pwa/astro';

import tailwindcss from '@tailwindcss/vite';
import {
  PWA_BACKGROUND_COLOR,
  PWA_GLOB_IGNORES,
  PWA_GLOB_PATTERNS,
  PWA_MAX_CACHE_BYTES,
  PWA_NAVIGATE_FALLBACK_DENYLIST,
  PWA_START_URL,
  PWA_THEME_COLOR,
} from './src/pwa-config.ts';

// https://astro.build/config
export default defineConfig({
  site: "https://psy.cards",
  output: "static",
  integrations: [
    mdx(),
    icon(),
    AstroPWA({
      registerType: "prompt",
      minify: false,
      includeAssets: ["favicon.png", "appicon.png"],
      experimental: {
        directoryAndTrailingSlashHandler: true,
      },
      manifest: {
        name: "psy.cards",
        short_name: "psy.cards",
        description:
          "A quick harm-reduction guide to common drug combinations, based on TripSit information.",
        theme_color: PWA_THEME_COLOR,
        background_color: PWA_BACKGROUND_COLOR,
        display: "standalone",
        scope: "/",
        start_url: PWA_START_URL,
        icons: [
          {
            src: "/appicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/appicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        lang: "en",
        categories: ["health", "medical", "education"],
      },
      workbox: {
        globPatterns: PWA_GLOB_PATTERNS,
        globIgnores: PWA_GLOB_IGNORES,
        navigateFallback: "/combos/index.html",
        navigateFallbackDenylist: PWA_NAVIGATE_FALLBACK_DENYLIST,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: PWA_MAX_CACHE_BYTES,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  i18n: {
    defaultLocale: "en",
    locales: ["en", "fr", "de", "it"],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
