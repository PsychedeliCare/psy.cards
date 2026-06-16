// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import icon from '@twodft/astro-icon';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: "https://psy.cards",
  integrations: [mdx(), icon()],

  vite: {
    plugins: [tailwindcss()]
  }
});
