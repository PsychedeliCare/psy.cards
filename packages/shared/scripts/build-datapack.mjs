#!/usr/bin/env node
/**
 * Builds the offline data pack shared by the native apps.
 *
 * iOS:     packages/ios/PsyCards/Resources/DataPack/{locale}/*.json
 *          packages/ios/PsyCards/{locale}.lproj/Localizable.strings
 *          packages/ios/PsyCards/Resources/Assets.xcassets/Phosphor/*
 * Android: packages/android/app/src/main/assets/datapack/{locale}/*.json
 *          (including ui.json: flattened UI strings, named {placeholders})
 *          packages/android/app/src/main/res/drawable/ph_*.xml
 *          (Android outputs are skipped until packages/android exists.)
 *
 * Card data mirrors packages/web/src/data/harm-reduction.ts (getCardData) and
 * reuses the web's own dose parser, so every platform shows the same numbers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDoseCharts, formatDoseTick, getRouteIcon, getRouteLabel } from "../../web/src/lib/dose-chart.ts";
import { statusIcons } from "../../web/src/data/status-icons.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../../..");
const sharedRoot = path.resolve(__dirname, "..");
const iosRoot = path.join(monorepoRoot, "packages/ios/PsyCards");
const dataPackRoot = path.join(iosRoot, "Resources/DataPack");
const iosPhosphorRoot = path.join(iosRoot, "Resources/Assets.xcassets/Phosphor");
const androidRoot = path.join(monorepoRoot, "packages/android/app/src/main");
const hasAndroid = fs.existsSync(path.join(monorepoRoot, "packages/android"));

const LOCALES = ["en", "fr", "de", "it"];
const DATAPACK_VERSION = 2;

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

/** Card "Don't mix with" chips (web AVOID_STATUSES), most severe first. */
const AVOID_STATUSES = ["dangerous", "serotoninsyndrome", "unsafe"];

/** Gable rows whose key is a class keep the paper's compound name (web MarginChart). */
const GABLE_COMPOUND_KEYS = new Set(["opioids", "amphetamines", "benzodiazepines", "ssris", "mushrooms"]);

/** Phosphor icons used by card chrome on every platform (web CardFront/CardBack/BodyDock). */
const UI_ICONS = [
  "scales-fill",
  "shield-warning-fill",
  "user-fill",
  "sparkle-fill",
  "clock-fill",
  "skull-fill",
  "chart-bar-horizontal-fill",
  "test-tube-fill",
  "arrows-clockwise-bold",
  "arrows-counter-clockwise-bold",
  "calendar-dots-fill",
  "link-break-fill",
  "info-bold",
  "warning-fill",
  "prohibit-fill",
  "siren-fill",
  "phone-call-fill",
  "wine-fill",
  "caret-down-bold",
  "timer-fill",
  "hourglass-medium-fill",
  "moon-stars-fill",
  "gender-male-bold",
  "gender-female-bold",
  "minus-bold",
  "plus-bold",
  "x-bold",
  "timer",
  "hourglass-medium",
  "pill",
  "github-logo-fill",
  "book-open-text-fill",
  "flask-fill",
  "globe-hemisphere-west-fill",
  "list-bullets-bold",
  "magnifying-glass-bold",
  "caret-left-bold",
  "caret-right-bold",
  "cards-fill",
  "grid-nine-fill",
  "gear-six-fill",
  "record-fill",
  "hand-heart-fill",
  "gavel-fill",
  "first-aid-kit-fill",
  "phone-fill",
  "arrow-square-out-bold",
];

const LEGAL_STATUSES = ["legal", "medical", "decriminalised", "grey", "illegal", "unknown"];

/** The first dialable number in a field like "112 or 999" (web local-info.ts). */
function dialable(value) {
  return value?.match(/\+?\d[\d\s-]*\d|\d/)?.[0].trim();
}

/**
 * Country-specific card data (legal status, emergency numbers, harm
 * reduction organisations), shared by every locale. Mirrors
 * packages/web/src/data/local-info.ts (getLocalInfo).
 */
function buildLocalInfo() {
  const dir = path.join(sharedRoot, "data/legality");
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /^[A-Z]{2}\.json$/.test(name) && name !== "ZZ.json")
    : [];
  const organisations = readSharedJsonIfExists("data/organisations.json", { organisations: [] }).organisations ?? [];
  const score = (org) => (org.featured ? 4 : 0) + (org.scope === "national" ? 2 : org.scope === "online" ? 1 : 0);
  const countries = {};
  for (const name of files.sort()) {
    const file = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    const code = file.country.toUpperCase();
    const sources = file.sources ?? {};
    const substances = {};
    for (const [key, entry] of Object.entries(file.substances ?? {})) {
      substances[key] = {
        status: LEGAL_STATUSES.includes(entry.status) ? entry.status : "unknown",
        note: entry.note ?? null,
        confidence: entry.confidence ?? null,
        sources: (entry.sources ?? []).flatMap((id) => (sources[id] ? [{ title: sources[id].title, url: sources[id].url ?? null }] : [])),
      };
    }
    countries[code] = {
      country: code,
      name: file.name,
      asOf: file.asOf,
      summary: file.summary ?? null,
      emergency: {
        number: dialable(file.emergency?.ambulance) ?? dialable(file.emergency?.general) ?? "112",
        general: file.emergency?.general ?? null,
        poison: dialable(file.emergency?.poisonControl?.phone)
          ? { name: file.emergency.poisonControl.name, phone: dialable(file.emergency.poisonControl.phone) }
          : null,
        poisonNote: file.poisonControlNote ?? null,
      },
      callingForHelp: file.callingForHelp ?? null,
      drugChecking: file.drugChecking ?? null,
      substances,
      organisations: organisations
        .filter((org) => org.country?.toUpperCase() === code)
        .sort((a, b) => score(b) - score(a))
        .map((org) => ({
          id: org.id,
          name: org.name,
          city: org.city ?? null,
          scope: org.scope,
          services: org.services ?? [],
          url: org.url ?? null,
          phone: org.phone ?? null,
          substances: org.substances ?? ["all"],
          featured: Boolean(org.featured),
          description: org.description ?? {},
        })),
    };
  }
  return { countries };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(monorepoRoot, relativePath), "utf8"));
}

function readSharedJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(sharedRoot, relativePath), "utf8"));
}

function readSharedJsonIfExists(relativePath, fallback) {
  const file = path.join(sharedRoot, relativePath);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function overlayText(value) {
  if (value && typeof value === "object" && "text" in value) return value.text;
  return value;
}

/** Same semantics as the web's applyOverlayValue (packages/web/src/data/drugs.ts). */
function applyOverlay(base, overlay) {
  if (overlay === undefined || overlay === null) return base;
  if (typeof overlay === "object" && "text" in overlay) return overlay.text;
  if (Array.isArray(base) && Array.isArray(overlay)) {
    return overlay.map((item, i) => {
      if (item && typeof item === "object" && "text" in item) return item.text;
      return base[i] ?? item;
    });
  }
  if (base && typeof base === "object" && !Array.isArray(base) && typeof overlay === "object" && !Array.isArray(overlay)) {
    const result = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      result[key] = applyOverlay(base[key], value);
    }
    return result;
  }
  return base;
}

function keyToSlug(key) {
  return key.replace(/\//g, "-");
}

function toTitleCase(text) {
  return text.replace(/\b\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
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

function getNested(obj, dotted) {
  return dotted.split(".").reduce((current, part) => (current && typeof current === "object" ? current[part] : undefined), obj);
}

function makeT(ui) {
  return (key, vars = {}) => {
    const value = getNested(ui, key);
    let text = typeof value === "string" ? value : key;
    for (const [name, replacement] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, replacement);
    return text;
  };
}

/**
 * Named `{placeholders}` are kept verbatim: the apps substitute them by name,
 * so translations may reorder arguments freely.
 */
function iosStringValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function resolveStatus(raw, localeBundle, comboDefs, combogen) {
  const rewrite = combogen.rewriteInteraction ?? {};
  const interactionClass = combogen.interactionClass;
  const lower = (raw ?? "").toLowerCase();
  const normalised = rewrite[lower] ?? (raw ? lower : "fallback");
  const [statusKey, faIcon] = interactionClass[normalised] ?? interactionClass.fallback;
  const labelByRaw = Object.fromEntries(comboDefs.map((d) => [d.status.toLowerCase(), d.status]));
  const emojiByRaw = Object.fromEntries(comboDefs.map((d) => [d.status.toLowerCase(), d.emoji]));
  const definitionByRaw = Object.fromEntries(comboDefs.map((d) => [d.status.toLowerCase(), d.definition]));

  const localizedLabel =
    localeBundle.tripsit.interactions?.[normalised] ?? localeBundle.tripsit.interactions?.[raw] ?? null;
  const statusOverlay = localeBundle.statusDefinitions[normalised];
  const fallbackOverlay = localeBundle.statusDefinitions.fallback;

  return {
    statusKey,
    icon: faToIcon[faIcon] ?? "question",
    rawStatus: normalised,
    label:
      localizedLabel ??
      labelByRaw[normalised] ??
      (normalised === "fallback" ? localeBundle.ui.status?.unknown ?? "Unknown" : normalised),
    emoji: emojiByRaw[normalised] ?? "",
    definition:
      overlayText(statusOverlay) ??
      definitionByRaw[normalised] ??
      overlayText(fallbackOverlay) ??
      localeBundle.ui.status?.unknownDefinition ??
      "Interaction data is unavailable for this pair.",
  };
}

function buildColumns(localeBundle, combogen, enLabelToKey) {
  const labelToKey = {};
  for (const [key, label] of Object.entries(localeBundle.tripsit.drugs)) labelToKey[label] = key;

  const groupNames = combogen.groupNames;
  const originalColumns = combogen.tableOrder.flatMap((groupLabels, groupIndex) =>
    groupLabels.map((label) => {
      const key = enLabelToKey[label] ?? labelToKey[label] ?? label.toLowerCase();
      return {
        key,
        label: localeBundle.drugLabels[key] ?? label,
        slug: keyToSlug(key),
        group: groupOverrides[key] ?? groupNames[groupIndex],
      };
    })
  );

  const originalOrder = new Map(originalColumns.map((column, index) => [column.key, index]));
  const rank = (group) => {
    const index = groupOrder.indexOf(group);
    return index === -1 ? groupOrder.length : index;
  };
  return [...originalColumns].sort(
    (a, b) => rank(a.group) - rank(b.group) || (originalOrder.get(a.key) ?? 0) - (originalOrder.get(b.key) ?? 0)
  );
}

function getDrug(drugs, key, overlays) {
  const base = drugs[key] ?? (keyAlias[key] ? drugs[keyAlias[key]] : undefined);
  if (!base) return undefined;
  const overlay = overlays[key];
  return overlay ? applyOverlay(structuredClone(base), overlay) : base;
}

/** First non-unit entry of a TripSit duration object (web SubstanceListCard). */
function firstDurationValue(duration) {
  if (!duration) return undefined;
  const entry = Object.entries(duration).find(([key, value]) => key !== "_unit" && typeof value === "string" && value);
  return entry?.[1];
}

function listMetaFor(drug) {
  const onset = firstDurationValue(drug?.formatted_onset);
  const duration = firstDurationValue(drug?.formatted_duration);
  const doseMap = drug?.formatted_dose ?? {};
  const oral = doseMap.Oral ?? doseMap.oral;
  const commonDose = oral?.Common ?? oral?.common;
  return {
    onset: onset ? `${onset}${drug.formatted_onset._unit ? ` ${drug.formatted_onset._unit}` : ""}` : null,
    duration: duration ? `${duration}${drug.formatted_duration._unit ? ` ${drug.formatted_duration._unit}` : ""}` : null,
    commonDose: commonDose ?? null,
  };
}

function buildSubstance(key, column, drug, substances, classDescriptions, slangIndex) {
  const structure = substances[key];
  const props = drug?.properties ?? {};
  const aliases = [...(drug?.aliases ?? []), ...(Array.isArray(props.aliases) ? props.aliases : [])];
  const uniqueAliases = [...new Set(aliases.map(String))];
  const prettyName = drug?.pretty_name ?? column.label;
  const listAliases = [
    ...new Set(
      (drug?.aliases ?? [])
        .filter((alias) => typeof alias === "string" && alias.trim())
        .map((alias) => alias.trim())
        .filter(
          (alias) =>
            alias.toLocaleLowerCase() !== prettyName.toLocaleLowerCase() &&
            alias.toLocaleLowerCase() !== key.toLocaleLowerCase()
        )
    ),
  ].slice(0, 3);

  return {
    key,
    slug: column.slug,
    label: column.label,
    prettyName,
    group: column.group,
    aliases: uniqueAliases,
    listAliases,
    listMeta: listMetaFor(drug),
    searchTerms: [column.label, drug?.pretty_name, ...uniqueAliases, ...(slangIndex[key] ?? [])].filter(Boolean).map(String),
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

/** Column keys that differ from the combo dataset's (web i18n/key-aliases.ts). */
const matrixKeyAlias = { dxm: "dextromethorphan" };
const resolveMatrixKey = (key) => matrixKeyAlias[key] ?? key;

/** Mirrors the web's getInteraction (packages/web/src/data/combos.ts). */
function buildCombos(columns, combos, localeBundle, comboDefs, combogen) {
  const keys = columns.map((c) => c.key);
  const matrix = {};
  const pairs = [];

  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;
      const a = keys[i];
      const b = keys[j];
      const dataA = resolveMatrixKey(a);
      const dataB = resolveMatrixKey(b);
      const ab = combos[dataA]?.[dataB];
      const ba = combos[dataB]?.[dataA];
      const entry =
        ab && ba ? { status: ab.status ?? ba.status, note: ab.note ?? ba.note, sources: ab.sources ?? ba.sources } : ab ?? ba;

      // Overlay notes are keyed by sorted dataset keys, then column order.
      const [first, second] = i < j ? [a, b] : [b, a];
      const note =
        overlayText(localeBundle.comboNotes[[dataA, dataB].sort().join("|")]) ??
        overlayText(localeBundle.comboNotes[`${first}|${second}`]) ??
        entry?.note ??
        null;
      const definition = resolveStatus(entry?.status, localeBundle, comboDefs, combogen);
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

      matrix[a] ??= {};
      matrix[a][b] = { statusKey: cell.statusKey, label: cell.label, icon: cell.icon };
      if (i < j) pairs.push({ id: `${keyToSlug(a)}~${keyToSlug(b)}`, ...cell });
    }
  }

  const legend = legendOrder.map((raw) => resolveStatus(raw, localeBundle, comboDefs, combogen));
  return { matrix, pairs, legend };
}

function buildSlangIndex(extended) {
  const index = {};
  const entries = Array.isArray(extended) ? extended : extended?.entries ?? Object.values(extended ?? {});
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const terms = [...(entry.slang ?? []), ...(entry.intoxicationNames ?? [])].filter(Boolean);
    for (const key of entry.tripSitKeys ?? entry.pairKeys ?? []) {
      index[key] ??= [];
      index[key].push(...terms.map(String));
    }
  }
  for (const key of Object.keys(index)) index[key] = [...new Set(index[key])];
  return index;
}

function buildLocaleBundle(locale) {
  const ui = readSharedJson(`i18n/ui/${locale}.json`);
  const tripsit = readJson(`drugs/translations/${locale}.json`);
  return {
    locale,
    ui,
    t: makeT(ui),
    tripsit,
    drugLabels: { ...tripsit.drugs, ...readSharedJson(`i18n/content/${locale}/drug-labels.json`) },
    comboNotes: readSharedJson(`i18n/content/${locale}/combo-notes.json`),
    statusDefinitions: readSharedJson(`i18n/content/${locale}/status-definitions.json`),
    classDescriptions: readSharedJson(`i18n/content/${locale}/class-descriptions.json`),
    drugOverlays: loadDrugOverlays(locale),
    harmReduction: readSharedJsonIfExists(`i18n/content/${locale}/harm-reduction.json`, {}),
  };
}

/* ---------------------------------------------------------------- Cards */

const round = (n) => Math.round(n * 100) / 100;

function routeKey(route) {
  return route.toLowerCase().replace(/[^a-z]/g, "");
}

/** Locale text wins field by field; anything untranslated falls back to English (web mergeContent). */
function mergeContent(base = {}, overlay = {}) {
  return {
    ...base,
    ...overlay,
    spacing: overlay.spacing ? { ...base.spacing, ...overlay.spacing } : base.spacing,
    overdose: overlay.overdose ? { ...base.overdose, ...overlay.overdose } : base.overdose,
    risks: base.risks?.map((risk, index) => ({ ...risk, ...overlay.risks?.[index], icon: risk.icon })),
    effects: base.effects?.map((effect, index) => ({ ...effect, ...overlay.effects?.[index], icon: effect.icon })),
  };
}

function pickTiming(duration, route) {
  if (!duration) return null;
  const entries = Object.entries(duration).filter(
    ([key, value]) => key !== "_unit" && typeof value === "string" && Boolean(value)
  );
  if (!entries.length) return null;
  const wanted = route ? routeKey(route) : "";
  const match = entries.find(([key]) => routeKey(key) === wanted) ?? entries.find(([key]) => key === "value") ?? entries[0];
  return { value: match[1].replace(/-/g, "–"), unit: duration._unit };
}

/**
 * Serialises a web DoseRouteChart and adds the label/tick candidates that
 * DoseScale.astro derives. Apps run the same overlap-free placement
 * (web spreadLabels) against measured text widths.
 */
function chartForApps(chart, t) {
  const base = { route: chart.route, routeLabel: getRouteLabel(chart.route), routeIcon: getRouteIcon(chart.route) };
  if (!chart.chartable) {
    return { ...base, chartable: false, rows: chart.rows.map(({ level, amount }) => ({ level, amount })) };
  }

  const levelLabel = (level) => {
    const value = t(`doseChart.${level}`);
    return value === `doseChart.${level}` ? level : value;
  };
  const labels = chart.segments.map((segment) => ({
    text: levelLabel(segment.level),
    pos: round(segment.isPoint ? segment.left : segment.center),
    color: segment.color,
    priority: segment.level === "common" ? 3 : segment.level === "threshold" ? 0 : 1,
  }));

  const tickMap = new Map();
  chart.segments.forEach((segment, index) => {
    const priority = segment.level === "common" ? 3 : index === 0 ? 2 : 1;
    const add = (value) => {
      const existing = tickMap.get(value);
      if (!existing || existing.priority < priority) {
        tickMap.set(value, { value, text: formatDoseTick(value), pos: round((value / chart.scaleMax) * 100), priority, suffix: "" });
      }
    };
    add(segment.start);
    if (segment.openEnd) {
      const tick = tickMap.get(segment.start);
      tick.text = `${formatDoseTick(segment.start)}+`;
      tick.suffix = "+";
    } else if (!segment.isPoint) {
      add(segment.end);
    }
  });

  return {
    ...base,
    chartable: true,
    unit: chart.unit,
    perKg: chart.unit.endsWith("/kg"),
    scaleMax: chart.scaleMax,
    segments: chart.segments.map((segment) => ({
      level: segment.level,
      amount: segment.amount,
      color: segment.color,
      left: round(segment.left),
      width: round(segment.width),
      start: segment.start,
      end: segment.end,
      openEnd: segment.openEnd,
      isPoint: segment.isPoint,
    })),
    labels,
    ticks: [...tickMap.values()].sort((a, b) => a.value - b.value),
  };
}

function cardAliases(drug, displayName, key) {
  const props = drug?.properties ?? {};
  return [
    ...new Set(
      [...(drug?.aliases ?? []), ...(props.aliases ?? [])]
        .filter((alias) => typeof alias === "string" && alias.trim().length > 0)
        .map((alias) => alias.trim().replace(/_/g, " ").toLocaleLowerCase())
        .filter((alias) => alias !== displayName.toLocaleLowerCase() && alias !== key.toLocaleLowerCase())
    ),
  ];
}

function effectIconResolver() {
  const icons = readJson("packages/web/src/data/effect-icons.json");
  const aliases = readJson("packages/web/src/data/phosphor-icon-aliases.json");
  const fallback = icons._default ?? "circle-dot";
  return (effect) => {
    const icon = icons[effect] ?? fallback;
    return `${aliases[icon] ?? icon}-fill`;
  };
}

function buildCards({ localeBundle, enBundle, columns, matrix, drugs, hr, substancesData, effectIcon, iconSet }) {
  const { t } = localeBundle;
  const en = enBundle.harmReduction;
  const local = localeBundle.locale === "en" ? {} : localeBundle.harmReduction;
  const labelOf = Object.fromEntries(columns.map((column) => [column.key, column.label]));
  const cards = {};

  for (const column of columns) {
    const { key } = column;
    const data = hr.substances[key];
    if (!data) throw new Error(`Missing harm reduction data for "${key}"`);
    const content = mergeContent(en[key], local[key]);
    for (const risk of content.risks ?? []) iconSet.add(risk.icon);
    for (const effect of content.effects ?? []) iconSet.add(effect.icon);

    const ownDrug = getDrug(drugs, key, localeBundle.drugOverlays);
    const doseDrug =
      data.doseFrom === undefined ? ownDrug : data.doseFrom ? getDrug(drugs, data.doseFrom, localeBundle.drugOverlays) : undefined;
    const charts = doseDrug?.formatted_dose ? buildDoseCharts(doseDrug.formatted_dose) : [];
    const wanted = data.primaryRoute ? routeKey(data.primaryRoute) : "";
    const primary =
      charts.find((chart) => routeKey(chart.route) === wanted) ?? charts.find((chart) => chart.chartable) ?? charts[0];
    const timingDrug = ownDrug?.formatted_duration ? ownDrug : doseDrug;
    const timingRoute = primary?.route ?? data.primaryRoute;
    const primaryApp = primary ? chartForApps(primary, t) : null;

    const avoid = columns
      .filter((other) => other.key !== key)
      .flatMap((other) => {
        const cell = matrix[key]?.[other.key] ?? matrix[other.key]?.[key];
        if (!cell || !AVOID_STATUSES.includes(cell.statusKey)) return [];
        return [{ key: other.key, label: other.label, statusKey: cell.statusKey, statusLabel: cell.label, icon: cell.icon }];
      })
      .sort((a, b) => AVOID_STATUSES.indexOf(a.statusKey) - AVOID_STATUSES.indexOf(b.statusKey));

    const sourceIds = new Set(["tripsit"]);
    if (data.margin || data.marginDanger) sourceIds.add("gable2004");
    if (data.dependence.nutt !== undefined) sourceIds.add("nutt2007");
    if (data.personal && "source" in data.personal) sourceIds.add(data.personal.source);
    if (key === "alcohol") sourceIds.add("ukcmo2016");
    if (key === "caffeine") sourceIds.add("efsa2015");

    let personal = data.personal ?? null;
    if (personal?.kind === "perKgChart") {
      const common = primaryApp?.chartable ? primaryApp.segments.find((segment) => segment.level === "common") : undefined;
      personal = { ...personal, minMgPerKg: common?.start ?? null, maxMgPerKg: common?.end ?? null };
    }

    // Details under the card (web SubstanceCard .psy-details).
    const displayName = (ownDrug?.pretty_name ?? labelOf[key] ?? key).replace(/^N2O$/, "N₂O");
    const props = ownDrug?.properties ?? {};
    const effects = (ownDrug?.formatted_effects ?? []).map((effect) => {
      const icon = effectIcon(effect);
      iconSet.add(icon);
      return { text: toTitleCase(effect), icon };
    });
    const doseCharts = ownDrug?.formatted_dose ? buildDoseCharts(ownDrug.formatted_dose).map((chart) => chartForApps(chart, t)) : [];
    for (const chart of [primaryApp, ...charts.map((chart) => chartForApps(chart, t)), ...doseCharts]) {
      if (chart) iconSet.add(chart.routeIcon);
    }

    cards[key] = {
      key,
      slug: column.slug,
      group: column.group,
      displayName,
      groupLabel: localeBundle.ui.groups?.[column.group] ?? column.group,
      aliases: cardAliases(ownDrug, displayName, key),
      content,
      primary: primaryApp,
      otherRoutes: charts.filter((chart) => chart !== primary).map((chart) => chartForApps(chart, t)),
      referenceName: data.doseFrom && doseDrug ? doseDrug.pretty_name : null,
      doseNote: doseDrug?.dose_note?.replace(/^\s*note:\s*/i, "").trim() || null,
      timing: {
        onset: pickTiming(timingDrug?.formatted_onset, timingRoute),
        duration: pickTiming(timingDrug?.formatted_duration, timingRoute),
        after: pickTiming(timingDrug?.formatted_aftereffects, timingRoute),
      },
      margin: data.margin ?? null,
      marginDanger: Boolean(data.marginDanger),
      dependence: data.dependence,
      spacing: data.spacing ?? {},
      personal,
      avoid,
      sources: [...sourceIds].flatMap((id) => (hr.sources[id] ? [{ id, ...hr.sources[id] }] : [])),
      details: {
        summary: props.summary ?? overlayText(localeBundle.classDescriptions[key]) ?? null,
        isClassFallback: !ownDrug && key in enBundle.classDescriptions,
        warning: props.warning ?? null,
        avoidText: props.avoid ?? null,
        testKits: props["test-kits"] ?? null,
        effects,
        pwEffects: Object.entries(ownDrug?.pweffects ?? {}).map(([label, url]) => ({ label, url })),
        links: {
          experiences: ownDrug?.links?.experiences ?? null,
          pihkal: ownDrug?.links?.pihkal ?? null,
          tihkal: ownDrug?.links?.tihkal ?? null,
        },
        doseCharts,
        doseNote: ownDrug?.dose_note ?? null,
        hasStructure: Boolean(substancesData[key]),
      },
    };
  }
  return cards;
}

/* ---------------------------------------------------------------- Icons */

function phosphorBody(name, iconify) {
  const icon = iconify.icons[name];
  if (icon) return icon.body;
  const alias = iconify.aliases?.[name];
  if (alias) return phosphorBody(alias.parent, iconify);
  throw new Error(`Unknown Phosphor icon "${name}"`);
}

function pathsFromBody(body) {
  const paths = [];
  for (const match of body.matchAll(/<path([^>]*)\/?>/g)) {
    const attrs = match[1];
    const d = attrs.match(/\sd="([^"]+)"/)?.[1];
    if (!d) continue;
    const opacity = attrs.match(/opacity="([^"]+)"/)?.[1];
    paths.push({ d, opacity: opacity ? Number(opacity) : 1 });
  }
  if (!paths.length) throw new Error(`No paths in icon body: ${body.slice(0, 80)}`);
  return paths;
}

function svgDocument(paths) {
  const body = paths
    .map(({ d, opacity }) => `<path fill="#000000"${opacity < 1 ? ` fill-opacity="${opacity}"` : ""} d="${d}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 256">${body}</svg>\n`;
}

function vectorDrawable(paths) {
  const body = paths
    .map(
      ({ d, opacity }) =>
        `    <path android:fillColor="#FF000000"${opacity < 1 ? ` android:fillAlpha="${opacity}"` : ""} android:pathData="${d}" />`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Phosphor Icons (MIT). Generated by packages/shared/scripts/build-datapack.mjs. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="256"
    android:viewportHeight="256">
${body}
</vector>
`;
}

function writeIcons(iconSet) {
  const iconify = readJson("packages/web/node_modules/@iconify-json/ph/icons.json");
  const icons = [...iconSet].sort().map((name) => ({ asset: `ph-${name}`, paths: pathsFromBody(phosphorBody(name, iconify)) }));
  // Combo status icons are Phosphor duotone; the secondary layer sits at 20% (web Icon.astro).
  for (const [name, duo] of Object.entries(statusIcons)) {
    icons.push({ asset: `status-${name}`, paths: [{ d: duo.secondary, opacity: 0.2 }, { d: duo.primary, opacity: 1 }] });
  }

  fs.rmSync(iosPhosphorRoot, { recursive: true, force: true });
  writeJson(path.join(iosPhosphorRoot, "Contents.json"), {
    info: { author: "xcode", version: 1 },
    properties: { "provides-namespace": false },
  });
  for (const { asset, paths } of icons) {
    const dir = path.join(iosPhosphorRoot, `${asset}.imageset`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${asset}.svg`), svgDocument(paths));
    writeJson(path.join(dir, "Contents.json"), {
      images: [{ filename: `${asset}.svg`, idiom: "universal" }],
      info: { author: "xcode", version: 1 },
      properties: { "preserves-vector-representation": true, "template-rendering-intent": "template" },
    });
  }

  if (hasAndroid) {
    writeAndroidAssetIndex(icons.map(({ asset }) => asset));
    const drawables = path.join(androidRoot, "res/drawable");
    fs.mkdirSync(drawables, { recursive: true });
    for (const file of fs.readdirSync(drawables)) {
      if (/^(ph|status)_.*\.xml$/.test(file)) fs.rmSync(path.join(drawables, file));
    }
    for (const { asset, paths } of icons) {
      fs.writeFileSync(path.join(drawables, `${asset.replace(/-/g, "_")}.xml`), vectorDrawable(paths));
    }
  }
  return icons.length;
}

/**
 * Resource ids by name, so the app never resolves drawables reflectively
 * (which would also defeat resource shrinking).
 */
function writeAndroidAssetIndex(iconAssets) {
  const substances = readSharedJson("data/substances.json");
  const resName = (asset) => asset.replace(/-/g, "_");
  const icons = iconAssets.map((asset) => `        "${asset.replace(/^(ph|status)-/, "$1:")}" to R.drawable.${resName(asset)},`);
  const molecules = Object.keys(substances).map((key) => {
    const asset = `molecule_${keyToSlug(key).replace(/-/g, "_")}`;
    return `        "${asset}" to R.drawable.${asset},`;
  });
  const source = `// Generated by packages/shared/scripts/build-datapack.mjs. Do not edit directly.
package cards.psy.app.generated

import cards.psy.app.R

/** Phosphor icons (\`ph:<name>\`) and duotone combo status icons (\`status:<name>\`). */
object GeneratedIcons {
    val byName: Map<String, Int> = mapOf(
${icons.join("\n")}
    )
}

/** Prerendered molecule structures, keyed by the data pack's \`assetName\`. */
object GeneratedMolecules {
    val byAsset: Map<String, Int> = mapOf(
${molecules.join("\n")}
    )
}
`;
  const out = path.join(androidRoot, "kotlin/cards/psy/app/generated/GeneratedAssets.kt");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, source);
}

/* -------------------------------------------------------------- Strings */

function writeIosStrings(locale, ui) {
  const lines = ["/* Generated by packages/shared/scripts/build-datapack.mjs. Do not edit directly. */"];
  for (const [key, value] of flattenMessages(ui)) lines.push(`"${key}" = "${iosStringValue(value)}";`);
  lines.push("");
  const out = path.join(iosRoot, `${locale}.lproj/Localizable.strings`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join("\n"));
}

/**
 * Android reads UI strings from the data pack (like the web's `t()`), so the
 * in-app language, dynamic keys (`card.dependenceLevels.3`) and named
 * placeholders behave exactly as on the other platforms.
 */
function writeAndroidStrings(locale, ui) {
  if (!hasAndroid) return;
  writeJson(path.join(androidRoot, "assets/datapack", locale, "ui.json"), Object.fromEntries(flattenMessages(ui)));
}

/* ----------------------------------------------------------------- Main */

function main() {
  const combogen = readJson("combogen/config.json");
  const drugs = readJson("drugs/drugs.json");
  const combos = readJson("drugs/combos.json");
  const comboDefs = readJson("drugs/combo_definitions.json");
  const substancesData = readSharedJson("data/substances.json");
  const hr = readSharedJson("data/harm-reduction.json");
  const slangIndex = buildSlangIndex(readSharedJson("data/combos-extended.json"));
  const effectIcon = effectIconResolver();
  const enLabelToKey = Object.fromEntries(Object.entries(readJson("drugs/translations/en.json").drugs).map(([key, label]) => [label, key]));
  const enBundle = buildLocaleBundle("en");
  const iconSet = new Set(UI_ICONS);

  const outputRoots = [dataPackRoot, ...(hasAndroid ? [path.join(androidRoot, "assets/datapack")] : [])];
  const manifest = {
    version: DATAPACK_VERSION,
    generatedAt: new Date().toISOString(),
    locales: LOCALES,
    substanceCount: 0,
  };

  for (const locale of LOCALES) {
    const localeBundle = locale === "en" ? enBundle : buildLocaleBundle(locale);
    const columns = buildColumns(localeBundle, combogen, enLabelToKey);
    const substanceList = columns.map((column) =>
      buildSubstance(
        column.key,
        column,
        getDrug(drugs, column.key, localeBundle.drugOverlays),
        substancesData,
        localeBundle.classDescriptions,
        slangIndex
      )
    );
    const { matrix, pairs, legend } = buildCombos(columns, combos, localeBundle, comboDefs, combogen);
    const cards = buildCards({ localeBundle, enBundle, columns, matrix, drugs, hr, substancesData, effectIcon, iconSet });
    const labelOf = Object.fromEntries(columns.map((column) => [column.key, column.label]));

    const files = {
      "substances.json": {
        locale,
        groups: visibleGroupOrder,
        groupLabels: localeBundle.ui.groups ?? {},
        substances: substanceList,
      },
      "combos.json": {
        locale,
        columns: columns.map(({ key, slug, label, group }) => ({ key, slug, label, group })),
        matrix,
        pairs,
        legend,
      },
      "cards.json": {
        locale,
        sources: hr.sources,
        gable: hr.gable2004.map((row) => ({
          ...row,
          label: row.key && !GABLE_COMPOUND_KEYS.has(row.key) ? labelOf[row.key] ?? row.name : row.name,
        })),
        cards,
      },
      "meta.json": {
        locale,
        siteTitle: localeBundle.ui.meta?.siteTitle ?? "psy.cards",
        siteDescription: localeBundle.ui.meta?.siteDescription ?? "",
        disclaimer: localeBundle.ui.landing?.disclaimer ?? "",
        about: localeBundle.ui.landing?.about ?? "",
      },
    };

    for (const root of outputRoots) {
      for (const [name, data] of Object.entries(files)) writeJson(path.join(root, locale, name), data);
    }
    writeIosStrings(locale, localeBundle.ui);
    writeAndroidStrings(locale, localeBundle.ui);
    manifest.substanceCount = substanceList.length;
    console.log(`Wrote ${locale} datapack (${substanceList.length} substances, ${Object.keys(cards).length} cards)`);
  }

  const local = buildLocalInfo();
  for (const root of outputRoots) writeJson(path.join(root, "local.json"), local);
  console.log(`Wrote local info (${Object.keys(local.countries).length} countries)`);
  for (const root of outputRoots) writeJson(path.join(root, "manifest.json"), manifest);
  const iconCount = writeIcons(iconSet);
  console.log(`Wrote ${iconCount} vector icons${hasAndroid ? " (iOS + Android)" : " (iOS)"}`);
  console.log(`Data pack ready at ${outputRoots.join(", ")}`);
}

main();
