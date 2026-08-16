#!/usr/bin/env node
/**
 * Builds a Swift-friendly offline data pack for the iOS app.
 * Output: packages/ios/PsyCards/Resources/DataPack/{locale}/*.json
 *         packages/ios/PsyCards/{locale}.lproj/Localizable.strings
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../../..");
const sharedRoot = path.resolve(__dirname, "..");
const iosRoot = path.join(monorepoRoot, "packages/ios/PsyCards");
const dataPackRoot = path.join(iosRoot, "Resources/DataPack");

const LOCALES = ["en", "fr", "de", "it"];

const groupOverrides = {
  cannabis: "cannabinoid",
  mdma: "empathogen",
  opioids: "opioid",
  tramadol: "opioid",
};

const visibleGroupOrder = [
  "stimulant",
  "empathogen",
  "psychedelic",
  "dissociative",
  "depressant",
  "opioid",
  "cannabinoid",
];

const groupOrder = ["antidepressant", ...visibleGroupOrder];

const keyAlias = {
  dxm: "dextromethorphan",
  "ghb/gbl": "ghb",
};

const faToIcon = {
  "fa-arrow-up": "arrow-fat-line-up",
  "fa-dot-circle-o": "arrow-fat-line-right",
  "fa-arrow-down": "arrow-fat-line-down",
  "fa-warning": "warning",
  "fa-heartbeat": "heartbeat",
  "fa-times": "warning-octagon",
  "fa-flash": "flash",
  "fa-question": "question",
};

const legendOrder = [
  "Dangerous",
  "Unsafe",
  "Caution",
  "Low Risk & Synergy",
  "Low Risk & No Synergy",
  "Low Risk & Decrease",
];

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(monorepoRoot, relativePath), "utf8")
  );
}

function readSharedJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(sharedRoot, relativePath), "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function overlayText(value) {
  if (value && typeof value === "object" && "text" in value) return value.text;
  return value;
}

function applyOverlay(base, overlay) {
  if (overlay === undefined || overlay === null) return base;
  if (typeof overlay === "object" && overlay !== null && "text" in overlay) {
    return overlay.text;
  }
  if (Array.isArray(base) && Array.isArray(overlay)) {
    return overlay.map((item, i) => {
      if (item && typeof item === "object" && "text" in item) return item.text;
      return base[i] ?? item;
    });
  }
  if (
    base &&
    typeof base === "object" &&
    !Array.isArray(base) &&
    overlay &&
    typeof overlay === "object" &&
    !Array.isArray(overlay)
  ) {
    const result = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      result[key] = applyOverlay(base[key], value);
    }
    return result;
  }
  return overlay ?? base;
}

function keyToSlug(key) {
  return key.replace(/\//g, "-");
}

function loadDrugOverlays(locale) {
  const dir = path.join(sharedRoot, `i18n/content/${locale}/drugs`);
  const overlays = {};
  if (!fs.existsSync(dir)) return overlays;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const key = file.replace(/\.json$/, "").replace(/__/g, "/");
    overlays[key] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return overlays;
}

function flattenMessages(obj, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...flattenMessages(value, full));
    } else if (typeof value === "string") {
      out.push([full, value]);
    }
  }
  return out;
}

function iosStringValue(value) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/%(\d+)\$[sd@]/g, "%$1$@")
    .replace(/\{(\w+)\}/g, "%@");
}

function mergeDrugLabels(tripsitDrugs, augment) {
  return { ...tripsitDrugs, ...augment };
}

function resolveStatus(raw, localeBundle, comboDefs, combogen) {
  const rewrite = combogen.rewriteInteraction ?? {};
  const interactionClass = combogen.interactionClass;
  const lower = (raw ?? "").toLowerCase();
  const normalised = rewrite[lower] ?? (raw ? lower : "fallback");
  const [statusKey, faIcon] =
    interactionClass[normalised] ?? interactionClass.fallback;
  const labelByRaw = Object.fromEntries(
    comboDefs.map((d) => [d.status.toLowerCase(), d.status])
  );
  const emojiByRaw = Object.fromEntries(
    comboDefs.map((d) => [d.status.toLowerCase(), d.emoji])
  );
  const definitionByRaw = Object.fromEntries(
    comboDefs.map((d) => [d.status.toLowerCase(), d.definition])
  );

  const localizedLabel =
    localeBundle.tripsit.interactions?.[normalised] ??
    localeBundle.tripsit.interactions?.[raw] ??
    null;
  const statusOverlay = localeBundle.statusDefinitions[normalised];
  const fallbackOverlay = localeBundle.statusDefinitions.fallback;

  return {
    statusKey,
    icon: faToIcon[faIcon] ?? "question",
    rawStatus: normalised,
    label:
      localizedLabel ??
      labelByRaw[normalised] ??
      (normalised === "fallback"
        ? localeBundle.ui.status?.unknown ?? "Unknown"
        : normalised),
    emoji: emojiByRaw[normalised] ?? "",
    definition:
      overlayText(statusOverlay) ??
      definitionByRaw[normalised] ??
      overlayText(fallbackOverlay) ??
      localeBundle.ui.status?.unknownDefinition ??
      "Interaction data is unavailable for this pair.",
  };
}

function buildColumns(localeBundle, combogen) {
  const labelToKey = {};
  for (const [key, label] of Object.entries(localeBundle.tripsit.drugs)) {
    labelToKey[label] = key;
  }
  // Prefer English labels for key resolution (matrix uses English labels)
  const enTripsit = readJson("drugs/translations/en.json");
  const enLabelToKey = {};
  for (const [key, label] of Object.entries(enTripsit.drugs)) {
    enLabelToKey[label] = key;
  }

  const groupNames = combogen.groupNames;
  const originalColumns = combogen.tableOrder.flatMap((groupLabels, groupIndex) =>
    groupLabels.map((label) => {
      const key = enLabelToKey[label] ?? labelToKey[label] ?? label.toLowerCase();
      const localizedLabel = localeBundle.drugLabels[key] ?? label;
      return {
        key,
        label: localizedLabel,
        slug: keyToSlug(key),
        group: groupOverrides[key] ?? groupNames[groupIndex],
      };
    })
  );

  const originalOrder = new Map(
    originalColumns.map((column, index) => [column.key, index])
  );

  return [...originalColumns].sort((a, b) => {
    const groupA = groupOrder.indexOf(a.group);
    const groupB = groupOrder.indexOf(b.group);
    const safeGroupA = groupA === -1 ? groupOrder.length : groupA;
    const safeGroupB = groupB === -1 ? groupOrder.length : groupB;
    if (safeGroupA !== safeGroupB) return safeGroupA - safeGroupB;
    return (originalOrder.get(a.key) ?? 0) - (originalOrder.get(b.key) ?? 0);
  });
}

function getDrug(drugs, key, overlays) {
  const base = drugs[key] ?? (keyAlias[key] ? drugs[keyAlias[key]] : undefined);
  if (!base) return undefined;
  const overlay = overlays[key];
  return overlay ? applyOverlay(structuredClone(base), overlay) : base;
}

function buildSubstance(key, column, drug, substances, classDescriptions, slangIndex) {
  const structure = substances[key];
  const props = drug?.properties ?? {};
  const aliases = [
    ...(drug?.aliases ?? []),
    ...(Array.isArray(props.aliases) ? props.aliases : []),
  ];
  const uniqueAliases = [...new Set(aliases.map(String))];

  return {
    key,
    slug: column.slug,
    label: column.label,
    prettyName: drug?.pretty_name ?? column.label,
    group: column.group,
    aliases: uniqueAliases,
    searchTerms: [
      column.label,
      drug?.pretty_name,
      ...uniqueAliases,
      ...(slangIndex[key] ?? []),
    ]
      .filter(Boolean)
      .map(String),
    summary: props.summary ?? null,
    isClass: key in classDescriptions,
    classDescription: overlayText(classDescriptions[key]) ?? null,
    dose: drug?.formatted_dose ?? null,
    doseNote: typeof props.dose === "string" ? props.dose : null,
    onset: drug?.formatted_onset ?? null,
    duration: drug?.formatted_duration ?? null,
    afterEffects: props["after-effects"] ?? null,
    effects: drug?.formatted_effects ?? null,
    avoid: props.avoid ?? null,
    halfLife: props["half-life"] ?? null,
    molecule: structure
      ? {
          smiles: structure.smiles,
          compound: structure.compound,
          representative: Boolean(structure.representative),
          assetName: `molecule_${keyToSlug(key).replace(/-/g, "_")}`,
        }
      : null,
  };
}

function buildCombos(columns, combos, localeBundle, comboDefs, combogen) {
  const keys = columns.map((c) => c.key);
  const matrix = {};
  const pairs = [];

  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;
      const a = keys[i];
      const b = keys[j];
      const ab = combos[a]?.[b];
      const ba = combos[b]?.[a];
      const entry = ab || ba
        ? {
            status: ab?.status ?? ba?.status,
            note: ab?.note ?? ba?.note,
            sources: ab?.sources ?? ba?.sources,
          }
        : undefined;

      const sorted = [a, b].sort();
      const pairKey = `${sorted[0]}|${sorted[1]}`;
      const note =
        overlayText(localeBundle.comboNotes[pairKey]) ?? entry?.note ?? null;
      const definition = resolveStatus(
        entry?.status,
        localeBundle,
        comboDefs,
        combogen
      );

      const cell = {
        a,
        b,
        statusKey: definition.statusKey,
        label: definition.label,
        icon: definition.icon,
        emoji: definition.emoji,
        definition: definition.definition,
        note,
        sources: entry?.sources ?? [],
      };

      if (!matrix[a]) matrix[a] = {};
      matrix[a][b] = {
        statusKey: cell.statusKey,
        label: cell.label,
        icon: cell.icon,
      };

      if (i < j) {
        pairs.push({
          id: `${keyToSlug(a)}~${keyToSlug(b)}`,
          ...cell,
        });
      }
    }
  }

  const legend = legendOrder.map((raw) =>
    resolveStatus(raw, localeBundle, comboDefs, combogen)
  );

  return { matrix, pairs, legend };
}

function buildSlangIndex(extended) {
  const index = {};
  const entries = Array.isArray(extended)
    ? extended
    : extended?.entries ?? Object.values(extended ?? {});
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const terms = [
      ...(entry.slang ?? []),
      ...(entry.intoxicationNames ?? []),
    ].filter(Boolean);
    const keys = entry.tripSitKeys ?? entry.pairKeys ?? [];
    for (const key of keys) {
      if (!index[key]) index[key] = [];
      index[key].push(...terms.map(String));
    }
  }
  for (const key of Object.keys(index)) {
    index[key] = [...new Set(index[key])];
  }
  return index;
}

function buildLocaleBundle(locale) {
  const ui = readSharedJson(`i18n/ui/${locale}.json`);
  const tripsit = readJson(`drugs/translations/${locale}.json`);
  const drugLabelsAugment = readSharedJson(`i18n/content/${locale}/drug-labels.json`);
  const comboNotes = readSharedJson(`i18n/content/${locale}/combo-notes.json`);
  const statusDefinitions = readSharedJson(
    `i18n/content/${locale}/status-definitions.json`
  );
  const classDescriptions = readSharedJson(
    `i18n/content/${locale}/class-descriptions.json`
  );
  return {
    locale,
    ui,
    tripsit,
    drugLabels: mergeDrugLabels(tripsit.drugs, drugLabelsAugment),
    comboNotes,
    statusDefinitions,
    classDescriptions,
    drugOverlays: loadDrugOverlays(locale),
  };
}

function writeStrings(locale, ui) {
  const lines = [
    "/* Generated by packages/shared/scripts/build-datapack.mjs. Do not edit directly. */",
  ];
  for (const [key, value] of flattenMessages(ui)) {
    lines.push(`"${key}" = "${iosStringValue(value)}";`);
  }
  lines.push("");
  const out = path.join(iosRoot, `${locale}.lproj/Localizable.strings`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join("\n"));
  return out;
}

function main() {
  const combogen = readJson("combogen/config.json");
  const drugs = readJson("drugs/drugs.json");
  const combos = readJson("drugs/combos.json");
  const comboDefs = readJson("drugs/combo_definitions.json");
  const substances = readSharedJson("data/substances.json");
  const extended = readSharedJson("data/combos-extended.json");
  const slangIndex = buildSlangIndex(extended);

  fs.mkdirSync(dataPackRoot, { recursive: true });

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    locales: LOCALES,
    substanceCount: 0,
  };

  for (const locale of LOCALES) {
    const localeBundle = buildLocaleBundle(locale);
    const columns = buildColumns(localeBundle, combogen);
    const substanceList = columns.map((column) => {
      const drug = getDrug(drugs, column.key, localeBundle.drugOverlays);
      return buildSubstance(
        column.key,
        column,
        drug,
        substances,
        localeBundle.classDescriptions,
        slangIndex
      );
    });

    const { matrix, pairs, legend } = buildCombos(
      columns,
      combos,
      localeBundle,
      comboDefs,
      combogen
    );

    const localeDir = path.join(dataPackRoot, locale);
    writeJson(path.join(localeDir, "substances.json"), {
      locale,
      groups: visibleGroupOrder,
      groupLabels: localeBundle.ui.groups ?? {},
      substances: substanceList,
    });
    writeJson(path.join(localeDir, "combos.json"), {
      locale,
      columns: columns.map((c) => ({
        key: c.key,
        slug: c.slug,
        label: c.label,
        group: c.group,
      })),
      matrix,
      pairs,
      legend,
    });
    writeJson(path.join(localeDir, "meta.json"), {
      locale,
      siteTitle: localeBundle.ui.meta?.siteTitle ?? "psy.cards",
      siteDescription: localeBundle.ui.meta?.siteDescription ?? "",
      disclaimer: localeBundle.ui.landing?.disclaimer ?? "",
      about: localeBundle.ui.landing?.about ?? "",
    });

    const stringsPath = writeStrings(locale, localeBundle.ui);
    console.log(`Wrote ${locale} datapack (${substanceList.length} substances) + ${stringsPath}`);
    manifest.substanceCount = substanceList.length;
  }

  writeJson(path.join(dataPackRoot, "manifest.json"), manifest);
  console.log(`Data pack ready at ${dataPackRoot}`);
}

main();
