# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

psy.cards is a multilingual harm reduction card project that turns verified substance knowledge bases into compact, readable guidance across print, web, and social media formats. Content is authored in MDX and published as a static site.

## Tech Stack

- **Framework**: Astro 6 with MDX integration
- **Styling**: Tailwind CSS v4 (via Vite plugin, not PostCSS — config lives in `src/styles/global.css`)
- **Deployment**: Cloudflare Pages (via `@astrojs/cloudflare` adapter)
- **Package manager**: pnpm (required)
- **Node**: >= 22.12.0

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start local dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build locally |
| `pnpm generate-types` | Generate Cloudflare worker types via wrangler |

## Architecture

- `src/pages/` — Astro page routes (file-based routing)
- `src/styles/global.css` — Tailwind v4 entry point (`@import "tailwindcss"`)
- `public/assets/` — Static assets (logos, images)
- `astro.config.mjs` — Astro config with MDX, Cloudflare adapter, and Tailwind Vite plugin
- Output mode is SSR (Cloudflare adapter), not static

## Notes

- Vite 7 is used via an override in `package.json`
- TypeScript is configured in strict mode (`astro/tsconfigs/strict`)
- The project is in early scaffolding phase — the data model for substance cards and the multilingual content pipeline are not yet built
