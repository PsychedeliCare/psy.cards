import { sleep, writeJson } from "../lib/shared.mjs";

const LANG_CODES = { fr: "fr-FR", de: "de-DE", it: "it-IT" };
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 800;

async function translateText(text, targetLang, retries = 8) {
  const langpair = `en|${LANG_CODES[targetLang]}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await sleep(BATCH_DELAY_MS * (attempt + 2) ** 2);
        continue;
      }
      if (!res.ok) throw new Error(`Translate failed: ${res.status}`);
      const data = await res.json();
      const translated = data.responseData?.translatedText;
      if (!translated || translated === text) return text;
      return translated;
    } catch (error) {
      const retryable =
        error instanceof TypeError ||
        (error && typeof error === "object" && "code" in error &&
          ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(error.code));
      if (!retryable || attempt === retries) throw error;
      await sleep(BATCH_DELAY_MS * (attempt + 2) ** 2);
    }
  }
  return text;
}

function isTranslated(entry) {
  return Boolean(entry?.text && entry?._source && entry.text !== entry._source);
}

async function translateOverlayValue(value, targetLang) {
  if (typeof value === "string") {
    const text = await translateText(value, targetLang);
    return { _source: value, text };
  }
  if (value && typeof value === "object" && "text" in value) {
    const source = value._source ?? value.text;
    const text = await translateText(source, targetLang);
    return { _source: source, text };
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      out.push(await translateOverlayValue(item, targetLang));
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = await translateOverlayValue(v, targetLang);
    }
    return out;
  }
  return value;
}

export async function translateNotes({
  entries,
  locale,
  existing = {},
  savePath,
  onProgress,
}) {
  const result = { ...existing };
  const pending = entries.filter(([key]) => !isTranslated(result[key]));

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ([key, value]) => {
        try {
          const source = value._source ?? value.text ?? value;
          const text = await translateText(source, locale);
          result[key] = { _source: source, text };
        } catch {
          result[key] = value;
        }
      })
    );
    if (savePath) writeJson(savePath, result);
    onProgress?.(
      entries.length - pending.length + Math.min(i + BATCH_SIZE, pending.length),
      entries.length
    );
    if (i + BATCH_SIZE < pending.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return result;
}

export async function translateDrugFile(enPath, localePath, locale) {
  const { readJson } = await import("../lib/shared.mjs");
  const enData = readJson(enPath);
  const translated = await translateOverlayValue(enData, locale);
  writeJson(localePath, translated);
}

export function describeProvider() {
  return "mymemory (free API)";
}
