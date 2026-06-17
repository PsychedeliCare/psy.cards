#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const TARGET_LOCALES = ["fr", "de", "it"];
const THRESHOLD = Number(process.env.I18N_COVERAGE_THRESHOLD ?? 0.95);

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function countTranslated(entries) {
  let total = 0;
  let translated = 0;
  for (const value of Object.values(entries ?? {})) {
    if (!value || typeof value !== "object") continue;
    total += 1;
    const source = value._source ?? "";
    const text = value.text ?? "";
    if (text && text !== source) translated += 1;
  }
  return { total, translated };
}

let failed = false;

for (const locale of TARGET_LOCALES) {
  console.log(`\n${locale.toUpperCase()} coverage:`);
  for (const file of ["combo-notes.json", "status-definitions.json", "class-descriptions.json"]) {
    const data = readJson(`i18n/content/${locale}/${file}`);
    const { total, translated } = countTranslated(data);
    const ratio = total ? translated / total : 1;
    console.log(`  ${file}: ${translated}/${total} (${(ratio * 100).toFixed(1)}%)`);
    if (file !== "class-descriptions.json" && ratio < THRESHOLD) {
      console.error(`  FAIL: ${file} below ${THRESHOLD * 100}% threshold`);
      failed = true;
    }
  }

  const drugsDir = path.join(root, `i18n/content/${locale}/drugs`);
  if (fs.existsSync(drugsDir)) {
    const drugFiles = fs.readdirSync(drugsDir).filter((f) => f.endsWith(".json"));
    console.log(`  drugs/: ${drugFiles.length} overlay files`);
  } else {
    console.warn(`  drugs/: missing`);
  }
}

if (failed) {
  process.exit(1);
}

console.log("\nAll locale checks passed.");
