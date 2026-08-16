import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(__dirname, "../../..");

export const TARGET_LOCALES = ["fr", "de", "it"];

export const LOCALE_NAMES = {
  fr: "French",
  de: "German",
  it: "Italian",
};

export function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

export function writeJson(relativePath, data) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

export function readText(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return "";
  return fs.readFileSync(fullPath, "utf8");
}

export function isTranslatedEntry(entry) {
  return Boolean(entry?.text && entry._source && entry.text !== entry._source);
}

export function drugFileIsTranslated(localePath) {
  const data = readJson(localePath);
  if (!data) return false;
  const walk = (value) => {
    if (Array.isArray(value)) return value.some(walk);
    if (value && typeof value === "object") {
      if ("text" in value && "_source" in value) return isTranslatedEntry(value);
      return Object.values(value).some(walk);
    }
    return false;
  };
  return walk(data);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveProvider(argv = process.argv) {
  const flag = argv.find((arg) => arg.startsWith("--provider="));
  if (flag) return flag.split("=")[1];
  if (process.env.I18N_PROVIDER) return process.env.I18N_PROVIDER;
  if (process.env.OPENAI_API_KEY) return "openai";
  return "mymemory";
}
