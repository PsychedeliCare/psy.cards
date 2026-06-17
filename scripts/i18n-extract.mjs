import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const TARGET_LOCALES = ["en", "fr", "de", "it"];
const OVERLAY_LOCALES = ["fr", "de", "it"];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeJson(relativePath, data) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

function sortKeys(obj) {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  );
}

const combos = readJson("drugs/combos.json");
const comboDefs = readJson("drugs/combo_definitions.json");
const classDescriptions = {
  dox: "DOx is a family of substituted amphetamine psychedelics (e.g. DOM, DOI, DOB, DOC) with long durations and strong stimulation.",
  nbomes:
    "NBOMes (N-Bomb) are extremely potent psychedelics active at microgram doses (25I-, 25C-, 25B-NBOMe). Narrow safety margin; deaths reported.",
  "2c-x":
    "2C-x is the 2C family of phenethylamine psychedelics (e.g. 2C-B, 2C-E, 2C-I). Varying profiles; most are active in the 10-25 mg range.",
  "2c-t-x":
    "2C-T-x is the sulfur-substituted 2C subfamily (e.g. 2C-T-2, 2C-T-7, 2C-T-21). Unpredictable and MAOI-sensitive.",
  "5-meo-xxt":
    "5-MeO-xxT covers 5-MeO tryptamines (5-MeO-DMT, 5-MeO-MiPT, 5-MeO-DiPT). Extremely potent, short and intense.",
  amphetamines:
    "Amphetamines are a class of stimulants including amphetamine, dextroamphetamine, methamphetamine, and related analogues.",
  opioids:
    "Opioids act on mu-opioid receptors, producing analgesia, sedation, and respiratory depression. Includes heroin, morphine, oxycodone, fentanyl, and others.",
  benzodiazepines:
    "Benzodiazepines are GABA-A positive allosteric modulators used as anxiolytics, sedatives, and anticonvulsants (e.g. diazepam, alprazolam, clonazepam).",
  maois:
    "Monoamine oxidase inhibitors prevent the breakdown of serotonin, dopamine, and noradrenaline. Includes harmala alkaloids, phenelzine, selegiline.",
  ssris:
    "Selective serotonin reuptake inhibitors are antidepressants that raise synaptic serotonin (e.g. fluoxetine, sertraline, citalopram).",
  "ghb/gbl":
    "GHB and its prodrug GBL are GABA-B agonists with a very narrow dose-response curve. GBL converts rapidly into GHB in the body.",
};

const enTranslations = readJson("drugs/translations/en.json");
const matrixKeys = Object.keys(combos);

const missingLabels = matrixKeys.filter((key) => {
  const translationKey = key === "dextromethorphan" ? "dxm" : key;
  return !enTranslations.drugs[translationKey] && !enTranslations.drugs[key];
});

const enDrugLabels = {};
for (const key of missingLabels) {
  const label =
    key === "dextromethorphan"
      ? "DXM"
      : key
          .split(/[-/]/)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("/");
  enDrugLabels[key] = label;
}

const comboNotes = {};
for (const keyA of matrixKeys) {
  for (const keyB of matrixKeys) {
    const entry = combos[keyA]?.[keyB];
    if (!entry?.note) continue;
    const pairKey = keyA <= keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
    if (comboNotes[pairKey]) continue;
    comboNotes[pairKey] = {
      _source: entry.note,
      text: entry.note,
    };
  }
}

const statusDefinitions = {};
for (const def of comboDefs) {
  statusDefinitions[def.status.toLowerCase()] = {
    _source: def.definition,
    text: def.definition,
  };
}
statusDefinitions.fallback = {
  _source:
    "Interaction data is unavailable for this pair. Research further before combining.",
  text: "Interaction data is unavailable for this pair. Research further before combining.",
};

const classDescOverlay = {};
for (const [key, text] of Object.entries(classDescriptions)) {
  classDescOverlay[key] = { _source: text, text };
}

const drugs = readJson("drugs/drugs.json");
const drugOverlayFields = [
  "pretty_name",
  "properties.summary",
  "dose_note",
  "avoid",
  "test_kits",
];

function getPath(obj, dotPath) {
  return dotPath.split(".").reduce((current, segment) => current?.[segment], obj);
}

function setPath(obj, dotPath, value) {
  const segments = dotPath.split(".");
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    current[segment] ??= {};
    current = current[segment];
  }
  current[segments.at(-1)] = value;
}

function extractDrugOverlay(drug) {
  const overlay = {};
  for (const field of drugOverlayFields) {
    const value = getPath(drug, field);
    if (typeof value === "string" && value.trim()) {
      setPath(overlay, field, { _source: value, text: value });
    }
  }
  if (Array.isArray(drug.formatted_effects) && drug.formatted_effects.length) {
    overlay.formatted_effects = drug.formatted_effects.map((effect) => ({
      _source: effect,
      text: effect,
    }));
  }
  if (drug.properties?.effects && typeof drug.properties.effects === "string") {
    overlay.properties ??= {};
    overlay.properties.effects = {
      _source: drug.properties.effects,
      text: drug.properties.effects,
    };
  }
  return overlay;
}

function writeDrugOverlays(localeDir) {
  const drugsDir = `${localeDir}/drugs`;
  for (const key of matrixKeys) {
    const drug = drugs[key] ?? drugs[key === "dextromethorphan" ? "dxm" : key];
    if (!drug) {
      if (classDescriptions[key]) {
        writeJson(`${drugsDir}/${key.replace(/\//g, "__")}.json`, {
          properties: {
            summary: classDescOverlay[key],
          },
        });
      }
      continue;
    }
    const overlay = extractDrugOverlay(drug);
    if (Object.keys(overlay).length) {
      writeJson(`${drugsDir}/${key.replace(/\//g, "__")}.json`, overlay);
    }
  }
}

for (const locale of TARGET_LOCALES) {
  const localeDir = `i18n/content/${locale}`;
  writeJson(`${localeDir}/drug-labels.json`, sortKeys(enDrugLabels));
  writeJson(`${localeDir}/combo-notes.json`, sortKeys(comboNotes));
  writeJson(`${localeDir}/status-definitions.json`, statusDefinitions);
  writeJson(`${localeDir}/class-descriptions.json`, classDescOverlay);
  writeDrugOverlays(localeDir);
}


console.log(`Extracted ${Object.keys(comboNotes).length} combo notes`);
console.log(`Missing upstream labels: ${missingLabels.join(", ")}`);
console.log(`Generated overlays for: ${TARGET_LOCALES.join(", ")}`);
