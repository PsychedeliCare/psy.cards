# psy.cards i18n

Multilingual overlay system for FR, DE, and IT on top of TripSit submodule data.

## Quick start

```bash
# Regenerate English source overlays from upstream data
pnpm i18n:extract

# Fill FR/DE/IT overlays (machine-assisted via MyMemory API)
pnpm i18n:fill

# Check translation coverage
pnpm i18n:check
```

## Architecture

1. **Upstream (read-only)**: `drugs/translations/{locale}.json`, `disclaimer-{locale}.html`
2. **Augmentation**: `i18n/content/{locale}/` — combo notes, status definitions, drug overlays
3. **UI chrome**: `i18n/ui/{locale}.json`

Runtime merge lives in `src/i18n/load-locale.ts`. Locale-prefixed routes: `/fr/combos`, `/de/lsd`, etc. English stays at root (`/combos`).

## Glossary

See `i18n/glossary/README.md` and per-language `fr.md`, `de.md`, `it.md` for LLM translation guidance.

## Field manifest

See `i18n/translatable-fields.md` for which fields to translate vs keep canonical.
