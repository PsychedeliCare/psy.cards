# Translation glossary — shared LLM instructions

Use this file together with the per-language glossaries (`fr.md`, `de.md`, `it.md`) when translating psy.cards content.

## Tone and audience

- Harm-reduction, direct, non-judgmental, medically accurate
- Audience: festival-goers and people who use substances — plain language, no moralizing
- Do not add or remove safety claims; preserve the meaning of TripSit source data

## Do not translate

- Chemical formulae, SMILES strings, dosage numbers, URLs, DOIs
- Status enum keys in source JSON (`Dangerous`, `Caution`, …) — only translate display labels
- Internationally recognized slang (e.g. "candy flip") may stay in English with a localized gloss in parentheses if helpful
- Brand names: TripSit, PsychonautWiki, SmilesDrawer, Saferparty, PiHKAL, TiHKAL

## Consistency rules

- Always use glossary terms for pharmacology vocabulary (serotonin syndrome, MAOI, SSRI, etc.)
- Align status category names with existing TripSit translations in `drugs/translations/{locale}.json` where they exist
- Keep combo notes roughly similar length to the English source

## Placeholders and markup

- Preserve `{substance}`, `{label}`, `{group}`, `{link}`, `{name}`, `{row}`, `{col}` placeholders
- Preserve HTML tags in disclaimer HTML
- Preserve markdown if present in source strings

## Review workflow

1. Run `pnpm i18n:extract` after upstream English changes
2. Translate overlay files or run `pnpm i18n:fill` for machine-assisted first pass
3. Human-review medical-adjacent strings before merge
4. Flag uncertainty with a `<!-- REVIEW -->` comment in overlay JSON (as a sibling key `_review: true` if needed)
5. Run `pnpm i18n:check` before committing

## File locations

| Content | Path |
|---|---|
| UI strings | `i18n/ui/{locale}.json` |
| Substance label gaps | `i18n/content/{locale}/drug-labels.json` |
| Combo notes | `i18n/content/{locale}/combo-notes.json` |
| Status definitions | `i18n/content/{locale}/status-definitions.json` |
| Class descriptions | `i18n/content/{locale}/class-descriptions.json` |
| Drug factsheets | `i18n/content/{locale}/drugs/{key}.json` |
| Upstream labels (read-only) | `drugs/translations/{locale}.json` |
