// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: "https://psy-cards.psychedelicare-eu.workers.dev",
  integrations: [mdx()],
  adapter: cloudflare(),

  vite: {
    plugins: [tailwindcss()]
  }
});