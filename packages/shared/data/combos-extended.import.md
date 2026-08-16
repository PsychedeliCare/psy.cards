# Wikipedia Combo Import Instructions

Use `pnpm import:wikipedia-combos` to regenerate `data/combos-extended.json` from the current Wikipedia wikitext for `List_of_drug_combinations`.

The generated file is not a replacement for `drugs/combos.json`. Treat TripSit's `status`, `note`, and `sources` as the safety source of truth. Use the Wikipedia import as enrichment data for slang names, intoxication names, row comments, and provenance.

## Lookup Model

- `entriesById` preserves one Wikipedia table row per record.
- `searchDocuments` is the primary Fuse.js input for fuzzy search across slang names, intoxication names, and source drug terms.
- `byPair` maps a canonical TripSit pair key, such as `lsd|mdma`, to matching Wikipedia entry ids.
- `byCombinationKey` maps a resolved multi-substance set, such as `lsd+mdma+mushrooms`, to entry ids.
- `byTripSitKey` supports substance detail pages.
- `bySlang` supports exact normalized reverse lookup from slang names like `candy flip`.
- `bySourceTerm` records every normalized Wikipedia term seen during resolution.
- `unresolvedTerms` lists source terms that need manual review before they can enrich TripSit combo cells.

## TripSit Mapping Rules

TripSit combo identifiers are the keys in `drugs/combos.json`. Resolve source terms in this order:

1. Use `tripSit.termMap` in `data/combos-extended.json`.
2. Match a direct `drugs/combos.json` key.
3. Match the TripSit English label in `drugs/translations/en.json`.
4. Match `drugs/drugs.json` `pretty_name` or aliases only when the drug key itself exists in `drugs/combos.json`.
5. Leave terms unresolved when the source term is broader than the TripSit matrix or has no corresponding combo key.

Important class mappings:

- `2C-B`, `2C-E`, `2C-P`, `2C-B-FLY`, and related `2C-x` terms map to `2c-x`.
- `5-MeO-MiPT` maps to `5-meo-xxt`.
- `amphetamine` and `methamphetamine` map to `amphetamines`.
- `heroin`, `fentanyl`, `morphine`, `opium`, and `opiates` map to `opioids`.
- `GHB` and `GBL` map to `ghb/gbl`.
- `DXM` maps to `dextromethorphan`.
- `PCP` and `phencyclidine` map to `pcp`.
- `psilocybin`, `psilocybin mushrooms`, and `magic mushrooms` map to `mushrooms`.
- Generic `dissociative`, `depressant`, `stimulant`, `psychedelics`, and `empathogen` terms expand to multiple TripSit keys and should be reviewed before bulk-enriching cells.

## Later Enrichment Workflow

1. Run `pnpm import:wikipedia-combos`.
2. Review `unresolvedTerms` and update `tripSit.termMap` for terms that can be safely mapped.
3. Re-run the importer after mapping changes.
4. For a TripSit cell, compute the canonical pair key using `drugs/combos.json` key order and read `byPair[pairKey]`.
5. Use `searchDocuments` for fuzzy search. A result's `entryId` points back to `entriesById`; `pairKeys` can suggest combo-card destinations.
6. Add enrichment fields to a separate UI/data layer first. Do not overwrite TripSit safety statuses from Wikipedia rows.

## Manual Curation

The importer supports small manual curation rules for source quirks:

- `excludedNames` removes extracted labels that should not appear as searchable combo slang, such as `hippie heart attack`.
- `manualEntries` adds accepted combo slang missing from the current Wikipedia import, such as `Hippie flip` / `Hippie flipping` for `mdma|mushrooms`.
