# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

psy.cards is a multilingual harm reduction card project that turns verified substance knowledge bases into compact, readable guidance across print, web, and native apps. Content is authored as JSON overlays on TripSit datasets and published as a static site plus an iOS/iPadOS app.

## Monorepo layout

```
packages/web/      Astro 7 static site (Cloudflare Pages + Worker)
packages/ios/      Native SwiftUI iOS/iPadOS 26 app
packages/shared/   Shared JSON datasets (data/, i18n/) + datapack generator
drugs/             TripSit/drugs git submodule
combogen/          TripSit/combogen git submodule
```

## Tech Stack

- **Web**: Astro 7, Tailwind CSS v4 (Vite plugin), Cloudflare Pages Worker
- **iOS**: SwiftUI, iOS/iPadOS 26, Liquid Glass
- **Package manager**: pnpm (required)
- **Node**: >= 22.12.0

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start web local dev server |
| `pnpm build` | Production web build |
| `pnpm preview` | Preview production web build locally |
| `pnpm datapack` | Regenerate iOS data pack from shared JSON |
| `pnpm generate-types` | Generate Cloudflare worker types via wrangler |

## Architecture

- `packages/web/src/pages/` — Astro page routes (file-based routing)
- `packages/web/src/styles/global.css` — Tailwind v4 entry point
- `packages/web/public/assets/` — Static assets
- `packages/web/astro.config.mjs` — Astro config (static output + PWA)
- `packages/shared/data/` — substances SMILES + extended combos
- `packages/shared/i18n/` — UI strings + content overlays (en/fr/de/it)
- Output mode is **static** (not SSR); Cloudflare Worker only remaps event domains

## Notes

- Vite 7 is used via an override in `packages/web/package.json`
- TypeScript is configured in strict mode (`astro/tsconfigs/strict`)
- Matrix covers 25 curated substances from `combogen/config.json`
