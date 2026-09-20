// Editorial descriptions of actual consumers. Metadata and file inventories are
// generated separately by scripts/sources.mjs; never put guessed dates here.
const field = (path, web, ios, transformation = "None; retained from the source.") => ({ path, web, ios, transformation });
const file = (path) => ({ path });
const directory = (path, extension) => ({ path, extension });
const locales = ["en", "fr", "de", "it"];

export const providers = [
  {
    id: "tripsit-facts", name: "TripSit · substance factsheets", kind: "direct",
    role: "Substance information", url: "https://github.com/TripSit/drugs",
    description: "The upstream factsheet database contains 555 substances; the site and native app expose the 25 entries selected by the combination-chart configuration, including substance classes.",
    repository: "drugs", inputs: [file("drugs/drugs.json")],
    licenseStatement: "The repository package declares ISC. This is a recorded declaration, not a separate assessment of every embedded reference.",
    fields: [
      field("[substance].name, pretty_name, aliases, properties.aliases, categories, properties.categories", "Names, aliases, category tags and search terms.", "Names, aliases and search terms; groups come from configuration.", "Local labels and text overlays take precedence. dxm resolves to dextromethorphan; ghb/gbl resolves to ghb."),
      field("[substance].properties.summary", "Substance summary and search keywords.", "Substance summary.", "Local text overlay takes precedence; class descriptions supply separate fallback copy."),
      field("[substance].formatted_dose, dose_note, properties.dose", "Dose chart uses formatted_dose and dose_note.", "Dose uses formatted_dose; doseNote currently uses properties.dose.", "Dose levels, routes and numeric strings are kept; chart rendering derives visual ranges."),
      field("[substance].formatted_onset, formatted_duration, formatted_aftereffects, properties.peak, properties.after-effects, properties.half-life", "Timings, peak chart, after-effects and half-life.", "Formatted onset/duration; afterEffects uses properties.after-effects; halfLife uses properties.half-life.", "Web timing charts parse source values. Native and web after-effects inputs differ."),
      field("[substance].formatted_effects, properties.effects", "Effect labels; properties.effects is extracted into overlays but not the displayed effect list.", "formatted_effects becomes effects.", "Effect-array overlays are applied by position, then web labels receive icons and title casing."),
      field("[substance].properties.avoid, properties.warning, properties[\"test-kits\"]", "Safety advice.", "Only properties.avoid is exported.", "Current extraction targets some incorrect top-level field names; not all displayed advice is localized."),
      field("[substance].links, pweffects", "Reference links and linked PsychonautWiki effect names.", "Not exported in the current data pack.", "Inherited links; no independent PsychonautWiki or Erowid fetch."),
      field("[substance].sources, combos", "Present in the loaded upstream file; not used as the card's bibliography or interaction source.", "Not exported from this file.", "Interaction status, notes and bibliography are read from combos.json instead."),
    ],
    limitations: ["An upstream revision is not a psy.cards scientific approval.", "Individual facts do not carry psy.cards reviewer identities or validation dates."],
  },
  {
    id: "tripsit-interactions", name: "TripSit · interactions", kind: "direct",
    role: "Interaction classifications and evidence", url: "https://github.com/TripSit/drugs",
    description: "Interaction data has 31 matrix keys. The current 25-column interface exposes 300 distinct pairs.",
    repository: "drugs", inputs: [file("drugs/combos.json"), file("drugs/combo_definitions.json")],
    licenseStatement: "The repository package declares ISC.",
    fields: [
      field("combos.json: [substanceA][substanceB].status, note, sources[].{author,title,url}", "Interaction cards, matrix, search status and references.", "Matrix status summaries and pair records with notes and sources.", "Read either pair direction, preferring the requested direction's available fields; overlay the translated note. Web and iOS currently order translation keys differently."),
      field("combo_definitions.json: [].status, definition, emoji", "Legend labels, explanations and emoji.", "Legend and pair explanations.", "Normalize statuses using combogen configuration; local translated definitions take precedence."),
    ],
    limitations: ["Citations are inherited from TripSit and are not evidence of an independent psy.cards review.", "Missing interactions use an unknown fallback; low-risk labels are source categories, not guarantees."],
  },
  {
    id: "tripsit-translations", name: "TripSit · translations", kind: "direct",
    role: "Upstream labels and disclaimer", url: "https://github.com/TripSit/drugs/tree/main/translations",
    repository: "drugs", inputs: locales.flatMap((locale) => [file(`drugs/translations/${locale}.json`), file(`drugs/translations/disclaimer-${locale}.html`)]),
    description: "English, French, German and Italian labels are combined with local overlays.",
    licenseStatement: "The repository package declares ISC.",
    fields: [
      field("{locale}.json: drugs.*, interactions.*", "Substance and interaction labels; English labels resolve configured columns.", "Substance and interaction labels; English labels resolve configured columns.", "Local drug-label augmentations override upstream labels. Web additionally bridges dxm to dextromethorphan."),
      field("disclaimer-{locale}.html: complete HTML", "Disclaimer component, with English fallback if absent.", "Not imported; native disclaimer comes from local UI strings.", "Rendered as upstream HTML."),
      field("{locale}.json: title, app, support", "Loaded in the bundle but not used as current UI copy.", "Read with the file but not exported as current UI copy.", "UI chrome is maintained locally."),
    ],
    limitations: ["The imported files do not record per-string generation providers or psy.cards validation history."],
  },
  {
    id: "combogen", name: "TripSit · combogen", kind: "direct",
    role: "Chart selection and presentation mappings", url: "https://github.com/TripSit/combogen",
    repository: "combogen", inputs: [file("combogen/config.json")],
    description: "The chart configuration selects the visible substances and maps interaction categories to presentation tokens.",
    licenseStatement: "No license declaration was found in the imported repository's package metadata.",
    fields: [
      field("tableOrder, groupNames", "Column selection and original within-group order.", "Same column selection.", "Local category overrides and group ordering are applied."),
      field("rewriteInteraction, interactionClass", "Status normalization, semantic status keys and icons.", "Status normalization, keys and icons.", "Font Awesome identifiers are mapped to the app's icon identifiers; the chart generator itself is not run."),
    ],
    limitations: ["Configuration ordering is editorial presentation, not a prevalence or evidence ranking."],
  },
  {
    id: "wikipedia", name: "Wikipedia · combination names", kind: "enrichment",
    role: "Slang and search enrichment", url: "https://en.wikipedia.org/wiki/List_of_drug_combinations",
    inputs: [file("packages/shared/data/combos-extended.json")], metadata: "wikipedia",
    description: "A saved import of the List of drug combinations supplies slang, intoxication names and terms for search, alongside separately identified manual entries.",
    licenseStatement: "The saved import records CC BY-SA 4.0; the revision and article history provide attribution to Wikipedia contributors.",
    fields: [
      field("entriesById.*: slang, intoxicationNames, comment, sourceSlots, tripSitKeys, pairKeys, combinationKey", "Slang labels and search aliases/keywords.", "Intended for search terms, but the current generator does not read entriesById correctly.", "Wiki markup is cleaned, terms are mapped to TripSit identifiers, and combinations produce pair indexes."),
      field("searchDocuments[], byPair, tripSit.comboKeys", "Search term indexes and pair-name lookup.", "Not consumed directly.", "Cards restrict names to two-key/single-pair entries; search also indexes broad class and multi-pair mappings."),
      field("source.{revisionId,revisionTimestamp,retrievedAt,url,license}, sourceRow, resolutionStatus, unresolvedTerms, tripSit.termMap", "Import provenance and mapping audit; not a scientific score.", "Not exported.", "Manual mappings and exclusions are in the importer or generated seed; row-based IDs currently move when source rows move."),
    ],
    limitations: ["Wikipedia enrichment never replaces TripSit interaction status, note or sources.", "The retained snapshot has 47 entries (including manual curation) and 13 unresolved source terms.", "A revision is recorded, but the original raw wikitext snapshot and its checksum are not retained; the current importer is not fully reproducible."],
  },
  {
    id: "local-language", name: "psy.cards · language and editorial content", kind: "local",
    role: "Local overlays, interface copy and terminology", url: "https://github.com/psychedelicare/psy.cards/tree/main/packages/shared/i18n",
    inputs: [directory("packages/shared/i18n/content", ".json"), directory("packages/shared/i18n/ui", ".json"), directory("packages/shared/i18n/glossary", ".md"), file("packages/shared/i18n/translatable-fields.md")],
    description: "Local English source overlays, translated content, class descriptions and UI copy, with human-readable terminology guidance.",
    licenseStatement: "No separate license is asserted here for local editorial content.",
    fields: [
      field("ui/{locale}.json: all message keys", "Interface labels, descriptions and local editorial summaries.", "Generated Localizable.strings and data-pack metadata.", "Web replaces named placeholders; iOS currently converts them to unnumbered %@ placeholders."),
      field("content/{locale}/drug-labels.json: [key]", "Label augmentation.", "Label augmentation.", "Overrides upstream labels."),
      field("content/{locale}/{combo-notes,status-definitions,class-descriptions}.json: [key].{_source,text}", "Translated notes, definitions and class text.", "Same inputs, resolved independently.", "text replaces source copy. _source is retained for comparison but runtime does not check drift."),
      field("content/{locale}/drugs/*.json: pretty_name, properties.summary, properties.effects, dose_note, formatted_effects[].{_source,text}", "Factsheet overlays; additional existing overlay keys are recursively applied.", "Overlays are applied before data-pack projection.", "Source identity is the substance key/file; array elements use positional identity. Extractor also attempts top-level avoid/test_kits, which do not match the rendered upstream fields."),
      field("glossary/*.md; translatable-fields.md", "Contributor/translation guidance, not loaded by the site.", "Not loaded by the app.", "The separate OpenAI provider reads this guidance; the currently wired fill command uses MyMemory directly."),
    ],
    limitations: ["No structured per-string generation/provider/reviewer history exists. The current fill script cannot establish who produced existing translations.", "Translation coverage is not scientific or language validation. The current i18n:check command reads the wrong directory and can falsely pass.", "Class descriptions and local summaries need their own evidence and scientific review; they are not automatically upstream-validated."],
  },
  {
    id: "local-chemistry", name: "psy.cards · molecular structures", kind: "local",
    role: "Curated chemical structure strings", url: "https://github.com/psychedelicare/psy.cards/blob/main/packages/shared/data/substances.json",
    inputs: [file("packages/shared/data/substances.json")],
    description: "Locally maintained SMILES strings and compound labels, including representative structures for some classes.",
    licenseStatement: "Original per-entry provenance is not recorded in this file.",
    fields: [field("[key].smiles, compound, representative", "Molecular diagrams and structure data endpoint.", "Molecule metadata and generated image assets.", "SmilesDrawer renders the strings; representative marks a class illustration rather than every member's structure.")],
    limitations: ["The local Git date records a repository change, not chemical validation or retrieval from a scientific provider.", "Do not infer an unrecorded PubChem or other external import."],
  },
  {
    id: "psychonautwiki", name: "PsychonautWiki · inherited effect links", kind: "indirect",
    role: "Linked effect vocabulary", url: "https://psychonautwiki.org", inputs: [], inheritedFrom: "tripsit-facts",
    description: "Effect names and URLs arrive through TripSit's pweffects field; there is no independent PsychonautWiki importer.",
    fields: [field("drugs.json: [substance].pweffects.{effectName: URL}", "Expandable linked effect list.", "Not exported.", "Inherited through TripSit; the upstream page revisions are not recorded.")],
    limitations: ["TripSit's snapshot date is not a PsychonautWiki page revision date."],
  },
  {
    id: "references", name: "Research citations and reference sites", kind: "indirect",
    role: "Inherited bibliography and external links", url: "https://github.com/TripSit/drugs", inputs: [], inheritedFrom: "tripsit-interactions",
    description: "Journal articles, books, Erowid and other references are linked from TripSit records. psy.cards does not independently synchronize those publications.",
    fields: [field("combos.json: sources[].{author,title,url}; drugs.json: links.*", "Pair bibliographies and factsheet links.", "Pair bibliographies only.", "Citation strings are preserved. Publication dates in citation text are not verification dates.")],
    limitations: ["Independent retrieval, revisions and psy.cards assessment of the cited works are not recorded. Individual links remain on their corresponding cards."],
  },
  {
    id: "drugs-wheel", name: "The Drugs Wheel", kind: "reference", role: "Credited classification inspiration",
    url: "https://www.thedrugswheel.com/", inputs: [],
    description: "Credited by the site for its classification approach. Groups, overrides and summaries are held in local code and UI copy; no Drugs Wheel dataset is fetched.", fields: [],
    limitations: ["No external dataset revision or retrieval date is recorded."],
  },
  {
    id: "drugwatch", name: "Drugwatch", kind: "reference", role: "Acknowledgement",
    url: "https://www.drugwatch.org", inputs: [],
    description: "Appears in the site's acknowledgements. The current pipeline contains no separate Drugwatch data import.", fields: [],
    limitations: ["An acknowledgement does not establish a data feed or scientific endorsement."],
  },
  {
    id: "smilesdrawer", name: "SmilesDrawer", kind: "software", role: "Molecule rendering software",
    url: "https://pubs.acs.org/doi/10.1021/acs.jcim.7b00425", inputs: [],
    description: "Draws molecular diagrams from local SMILES strings. This is a software credit, not the provider of the chemical structures.", fields: [],
    limitations: ["Dependency versions are pinned by pnpm-lock.yaml; a software release is not a scientific data revision."],
  },
];
