# Translatable fields manifest

This document defines which fields in psy.cards data layers should be translated vs kept canonical. Use it for human review and LLM translation tooling.

## Translate

| Domain | Fields | Storage |
|---|---|---|
| UI chrome | All visible strings, aria-labels, meta descriptions | `i18n/ui/{locale}.json` |
| Substance labels | Display names keyed by combo matrix key | `drugs/translations/{locale}.json` + `i18n/content/{locale}/drug-labels.json` |
| Category groups | psychedelic, stimulant, … | `i18n/ui/{locale}.json` → `groups.*` |
| Status labels | synergy, caution, dangerous, … | `drugs/translations/{locale}.json` → `interactions.*` |
| Status definitions | Legend paragraphs | `i18n/content/{locale}/status-definitions.json` |
| Combo notes | Pair-specific warnings | `i18n/content/{locale}/combo-notes.json` keyed by `keyA\|keyB` |
| Drug class blurbs | dox, nbomes, 2c-x, … | `i18n/content/{locale}/class-descriptions.json` |
| Drug factsheets | `pretty_name`, `properties.summary`, `formatted_effects[]`, `dose_note`, `avoid`, `test_kits` | `i18n/content/{locale}/drugs/{key}.json` |
| Disclaimer | Full HTML body | `drugs/translations/disclaimer-{locale}.html` |
| Category summaries | Drugs Wheel effect lists | `i18n/ui/{locale}.json` → `groupSummaries.*` |

## Do NOT translate

| Domain | Fields | Reason |
|---|---|---|
| Identity | substance keys, slugs, pair keys, entry IDs | Lookup / routing |
| Safety codes | `status` enum in `combos.json` | Canonical; map to localized label separately |
| Chemistry | `smiles`, `compound` (often kept as proper nouns) | Scientific notation |
| Numbers & ranges | `formatted_dose.*` values, `_unit` | Numeric data; translate unit labels in UI only |
| Visual codes | `emoji`, `color`, `statusKey`, icon names | Presentation tokens |
| URLs & DOIs | `sources[].url`, `links.*` | Stable references |
| Source metadata | `sources[].author`, `sources[].title` | Bibliographic (optional future pass) |
| Resolution metadata | `confidence`, `tripSitKeys[]`, `pairKeys[]` | Internal indexes |

## Partial translation pattern

For dose/timing UI: translate section headings (`Doses`, `Onset`, `Duration`) and tier names (`threshold`, `light`, …) in UI JSON. Leave numeric range strings as-is unless they embed English words.

## Overlay format

```json
{
  "lsd|mdma": {
    "_source": "English source for drift detection",
    "text": "Localized string"
  }
}
```

When upstream English changes, re-run `pnpm i18n:extract` and compare `_source` fields.
