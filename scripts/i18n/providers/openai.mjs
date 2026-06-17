import {
  LOCALE_NAMES,
  readText,
  root,
  sleep,
  writeJson,
} from "../lib/shared.mjs";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-5.5";
const NOTE_BATCH_SIZE = 20;
const MAX_RETRIES = 5;

function getModel() {
  return process.env.I18N_MODEL ?? DEFAULT_MODEL;
}

function getApiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is required for the OpenAI translation provider. Set it in your environment or use --provider=mymemory."
    );
  }
  return key;
}

function buildGlossaryPrompt(locale) {
  const shared = readText("i18n/glossary/README.md");
  const localeGlossary = readText(`i18n/glossary/${locale}.md`);
  const fields = readText("i18n/translatable-fields.md");
  return [shared, localeGlossary, fields].filter(Boolean).join("\n\n---\n\n");
}

async function callOpenAI({ system, user, retries = MAX_RETRIES }) {
  const apiKey = getApiKey();
  const model = getModel();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        const wait = 1000 * (attempt + 1) ** 2;
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${body}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned empty content");
      return JSON.parse(content);
    } catch (error) {
      const retryable =
        attempt < retries &&
        (error instanceof TypeError ||
          (error && typeof error === "object" && "code" in error &&
            ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(error.code)) ||
          String(error.message).includes("OpenAI API error 429") ||
          String(error.message).includes("OpenAI API error 5"));
      if (!retryable) throw error;
      await sleep(1000 * (attempt + 1) ** 2);
    }
  }

  throw new Error("OpenAI request failed after retries");
}

function systemPrompt(locale) {
  const language = LOCALE_NAMES[locale] ?? locale;
  return `You translate harm-reduction content for psy.cards into ${language}.

Rules:
- Preserve meaning exactly; do not add or remove safety claims.
- Keep dosage numbers, units, chemical names, URLs, SMILES, and brand names unchanged unless the glossary says otherwise.
- Preserve placeholders like {label}, {group}, {name} unchanged.
- Return valid JSON only, matching the requested schema exactly.

Glossary and field rules:
${buildGlossaryPrompt(locale)}`;
}

export async function translateNoteBatch(items, locale) {
  const payload = {
    items: items.map(({ key, source }) => ({ id: key, en: source })),
  };

  const response = await callOpenAI({
    system: systemPrompt(locale),
    user: `Translate each "en" string to ${LOCALE_NAMES[locale] ?? locale}.
Return JSON: {"items":[{"id":"...","text":"..."}]}
Input:
${JSON.stringify(payload)}`,
  });

  const byId = new Map(
    (response.items ?? []).map((item) => [item.id, item.text])
  );

  const result = {};
  for (const { key, source } of items) {
    result[key] = {
      _source: source,
      text: byId.get(key) ?? source,
    };
  }
  return result;
}

export async function translateNotes({
  entries,
  locale,
  existing = {},
  savePath,
  onProgress,
}) {
  const result = { ...existing };
  const pending = entries.filter(([key]) => !result[key] || !isTranslated(result[key]));

  for (let i = 0; i < pending.length; i += NOTE_BATCH_SIZE) {
    const batch = pending.slice(i, i + NOTE_BATCH_SIZE).map(([key, value]) => ({
      key,
      source: value._source ?? value.text ?? value,
    }));

    const translated = await translateNoteBatch(batch, locale);
    Object.assign(result, translated);

    if (savePath) writeJson(savePath, result);
    onProgress?.(
      entries.length - pending.length + Math.min(i + NOTE_BATCH_SIZE, pending.length),
      entries.length
    );
  }

  return result;
}

function isTranslated(entry) {
  return Boolean(entry?.text && entry?._source && entry.text !== entry._source);
}

export async function translateOverlayObject(data, locale) {
  const response = await callOpenAI({
    system: systemPrompt(locale),
    user: `Translate this JSON overlay for psy.cards.
- Keep the exact same JSON structure and keys.
- For each object with "_source" and "text", keep "_source" identical and put the ${LOCALE_NAMES[locale] ?? locale} translation in "text".
- Do not translate values that are numbers, ranges with units, URLs, or chemical identifiers.
- Return the full translated JSON object only.

Input:
${JSON.stringify(data)}`,
  });

  return response;
}

export async function translateDrugFile(enPath, localePath, locale) {
  const enData = (await import("../lib/shared.mjs")).readJson(enPath);
  const translated = await translateOverlayObject(enData, locale);
  writeJson(localePath, translated);
}

export function describeProvider() {
  return `openai (${getModel()})`;
}
