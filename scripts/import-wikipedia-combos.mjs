#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const defaultOutputPath = "data/combos-extended.json";
const defaultWikipediaTitle = "List_of_drug_combinations";
const defaultWikipediaUrl = `https://en.wikipedia.org/wiki/${defaultWikipediaTitle}`;
const entryIdPrefix = "wiki-combo";

const stopTerms = new Set([
  "",
  "and",
  "or",
  "any",
  "any of",
  "any of the",
  "closely related",
  "containing plant",
  "drug",
  "especially",
  "especially long-lasting ones such as",
  "other",
  "the closely related",
]);

const excludedNames = new Set([
  "hippie heart attack",
]);

const manualEntries = [
  {
    id: "manual-combo-hippie-flip",
    sourceSlots: [],
    tripSitKeys: ["mdma", "mushrooms"],
    slang: ["Hippie flip"],
    intoxicationNames: ["Hippie flipping"],
    comment: "",
    resolutionStatus: "manual",
    unresolvedTerms: [],
  },
];

const unresolved = (note) => ({
  keys: [],
  confidence: "unresolved",
  ...(note ? { note } : {}),
});

const defaultTermMap = {
  "antiretroviral drug": unresolved("No antiretroviral TripSit combo key exists."),
  "beta-carboline": {
    keys: ["maois"],
    confidence: "class",
    note: "Beta-carbolines such as harmala alkaloids are mapped to TripSit's MAOI key.",
  },
  "beta-carboline containing plant": {
    keys: ["maois"],
    confidence: "class",
  },
  depressant: {
    keys: ["alcohol", "ghb/gbl", "opioids", "tramadol", "benzodiazepines"],
    confidence: "class",
  },
  dissociative: {
    keys: ["ketamine", "mxe", "dextromethorphan", "nitrous", "pcp"],
    confidence: "class",
  },
  lysergamide: {
    keys: ["lsd"],
    confidence: "class",
  },
  "n n-dimethyltryptamine": {
    keys: ["dmt"],
    confidence: "exact",
  },
  pharmaceutical: unresolved("Too broad to map to a TripSit combo key."),
  psychedelic: {
    keys: ["lsd", "mushrooms", "dmt", "mescaline", "dox", "nbomes", "2c-x", "2c-t-x", "5-meo-xxt"],
    confidence: "class",
  },
  stimulant: {
    keys: ["amphetamines", "cocaine", "caffeine", "mdma"],
    confidence: "class",
  },
};

function parseArgs(argv) {
  const options = {
    output: defaultOutputPath,
    source: null,
    stdin: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--stdin") {
      options.stdin = true;
    } else if (arg === "--source") {
      options.source = argv[++index];
    } else if (arg === "--output") {
      options.output = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/import-wikipedia-combos.mjs [--source PATH_OR_URL] [--output data/combos-extended.json]
  node scripts/import-wikipedia-combos.mjs --stdin < list-of-drug-combinations.wikitext

When --source is omitted, the script fetches the current Wikipedia wikitext via the MediaWiki API.
The output keeps one entry per Wikipedia table row and builds lookup indexes by TripSit pair, source term, slang, and resolved TripSit key.
`);
}

async function readJson(relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

async function readOptionalJson(relativePath) {
  try {
    return await readJson(relativePath);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchWikipediaWikitext() {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("titles", defaultWikipediaTitle);
  url.searchParams.set("rvprop", "ids|timestamp|content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const response = await fetch(url, {
    headers: {
      "user-agent": "psy.cards combo importer (https://psy.cards)",
    },
  });
  if (!response.ok) {
    throw new Error(`Wikipedia API request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const page = payload.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const content = revision?.slots?.main?.content;
  if (!content) {
    throw new Error("Could not find Wikipedia wikitext in API response.");
  }

  return {
    wikitext: content,
    source: {
      name: "Wikipedia: List of drug combinations",
      url: defaultWikipediaUrl,
      license: "CC BY-SA 4.0",
      retrievedAt: new Date().toISOString(),
      revisionId: revision.revid ?? null,
      revisionTimestamp: revision.timestamp ?? null,
    },
  };
}

async function readSource(options) {
  if (options.stdin) {
    return {
      wikitext: await readStdin(),
      source: {
        name: "Wikipedia: List of drug combinations",
        url: defaultWikipediaUrl,
        license: "CC BY-SA 4.0",
        retrievedAt: new Date().toISOString(),
        revisionId: null,
      },
    };
  }

  if (!options.source) {
    return fetchWikipediaWikitext();
  }

  if (/^https?:\/\//i.test(options.source)) {
    if (/en\.wikipedia\.org\/wiki\/List_of_drug_combinations/i.test(options.source)) {
      return fetchWikipediaWikitext();
    }

    const response = await fetch(options.source, {
      headers: {
        "user-agent": "psy.cards combo importer (https://psy.cards)",
      },
    });
    if (!response.ok) {
      throw new Error(`Source request failed: ${response.status} ${response.statusText}`);
    }
    return {
      wikitext: await response.text(),
      source: {
        name: "Wikipedia: List of drug combinations",
        url: options.source,
        license: "CC BY-SA 4.0",
        retrievedAt: new Date().toISOString(),
        revisionId: null,
      },
    };
  }

  return {
    wikitext: await readFile(path.resolve(repoRoot, options.source), "utf8"),
    source: {
      name: "Wikipedia: List of drug combinations",
      url: options.source,
      license: "CC BY-SA 4.0",
      retrievedAt: new Date().toISOString(),
      revisionId: null,
    },
  };
}

function stripRefs(text) {
  return text
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref\b[^/>]*\/>/gi, "");
}

function cleanWikiMarkup(value) {
  return stripRefs(value)
    .replace(/{{shy}}/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<nowiki>\s*<\/nowiki>/gi, " ")
    .replace(/\{\{citation needed[^}]*\}\}/gi, "")
    .replace(/\{\{anchor\|[^}]*\}\}/gi, "")
    .replace(/\{\{sort under\}\}/gi, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => label ?? target)
    .replace(/'{2,5}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTerm(value) {
  return cleanWikiMarkup(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[βΒ]/g, "beta")
    .toLowerCase()
    .replace(/\bmedication\b/g, "")
    .replace(/\bmedicines?\b/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^\p{Letter}\p{Number}+./ -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/^any of the /, "")
    .replace(/^any /, "")
    .replace(/\s+or any$/, "")
    .trim();
}

function normalizeIndexKey(value) {
  return normalizeTerm(value)
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

function extractWikiLinks(value) {
  const links = [];
  const text = stripRefs(value);
  const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
  let match;

  while ((match = linkRegex.exec(text))) {
    const target = cleanWikiMarkup(match[1]);
    const label = cleanWikiMarkup(match[2] ?? match[1]);
    if (target) links.push(target);
    if (label && label !== target) links.push(label);
  }

  return links;
}

function extractSourceTerms(cell) {
  const terms = new Set();
  const plain = cleanWikiMarkup(cell);
  const links = extractWikiLinks(cell);

  for (const link of links) {
    terms.add(link);
  }

  if (plain) {
    if (links.length === 0) terms.add(plain);
    const candidates = plain
      .replace(/\band\/or\b/gi, "|")
      .replace(/\bor\b/gi, "|")
      .replace(/\band\b/gi, "|")
      .replace(/\bespecially\b/gi, "|")
      .replace(/\bsuch as\b/gi, "|")
      .replace(/[(),;]/g, "|")
      .split("|")
      .map((term) =>
        term
          .replace(/\bclosely related\b/gi, "")
          .replace(/\bcontaining plant\b/gi, "")
          .replace(/\be\.g\.\s*/gi, "")
          .replace(/\bother\b/gi, "")
          .replace(/\bany of the\b/gi, "")
          .replace(/\bany\b/gi, "")
          .trim(),
      );

    for (const candidate of candidates) {
      terms.add(candidate);
    }
  }

  const byNormalizedTerm = new Map();
  for (const term of terms) {
    const normalized = normalizeIndexKey(term);
    if (!stopTerms.has(normalized) && !byNormalizedTerm.has(normalized)) {
      byNormalizedTerm.set(normalized, term.trim());
    }
  }

  return [...byNormalizedTerm.values()]
    .map((term) => term.trim())
    .filter(Boolean);
}

function parseWikiTableRows(wikitext) {
  const text = stripRefs(wikitext);
  const tableStart = text.indexOf('{| class="wikitable sortable sort-under"');
  if (tableStart === -1) {
    throw new Error("Could not find the drug combinations wikitable.");
  }

  const tableEnd = text.indexOf("\n|}", tableStart);
  if (tableEnd === -1) {
    throw new Error("Could not find the end of the drug combinations wikitable.");
  }

  const table = text.slice(tableStart, tableEnd);
  const rowChunks = table.split(/\n\|-/).slice(1);
  const rows = [];

  for (const chunk of rowChunks) {
    const cells = [];
    let current = null;

    for (const line of chunk.split("\n")) {
      if (/^[!|](?![}-])/.test(line)) {
        if (current !== null) cells.push(current.trim());
        current = line.replace(/^[!|]\s?/, "");
      } else if (current !== null) {
        current += `\n${line}`;
      }
    }

    if (current !== null) cells.push(current.trim());
    if (cells.length === 0) continue;

    const plainCells = cells.map(cleanWikiMarkup);
    if (plainCells[0]?.toLowerCase() === "drug 1") continue;

    rows.push({
      sourceRow: rows.length + 1,
      cells: cells.slice(0, 7),
      plainCells: plainCells.slice(0, 7),
    });
  }

  return rows;
}

function addResolution(index, term, resolution) {
  const normalized = normalizeIndexKey(term);
  if (!normalized) return;
  index.set(normalized, resolution);
}

function buildResolver({ comboKeys, drugs, translations, termMap }) {
  const index = new Map();
  const comboKeySet = new Set(comboKeys);

  for (const [term, resolution] of Object.entries(termMap ?? {})) {
    addResolution(index, term, resolution);
  }

  for (const key of comboKeys) {
    addResolution(index, key, { keys: [key], confidence: "exact" });
    const translatedLabel = translations.drugs?.[key];
    const prettyName = drugs[key]?.pretty_name;
    if (translatedLabel) addResolution(index, translatedLabel, { keys: [key], confidence: "exact" });
    if (prettyName) addResolution(index, prettyName, { keys: [key], confidence: "exact" });
  }

  for (const [drugKey, drug] of Object.entries(drugs)) {
    if (!comboKeySet.has(drugKey)) continue;

    addResolution(index, drugKey, { keys: [drugKey], confidence: "exact" });
    if (drug.pretty_name) addResolution(index, drug.pretty_name, { keys: [drugKey], confidence: "exact" });
    for (const alias of drug.aliases ?? drug.properties?.aliases ?? []) {
      addResolution(index, alias, { keys: [drugKey], confidence: "exact" });
    }
  }

  return (term) => {
    const normalized = normalizeIndexKey(term);
    const direct = index.get(normalized);
    if (direct) return { ...direct, matchedTerm: normalized };

    if (normalized.endsWith("s")) {
      const singular = index.get(normalized.slice(0, -1));
      if (singular) return { ...singular, matchedTerm: normalized.slice(0, -1) };
    }

    return {
      ...unresolved("No TripSit combo key mapping found."),
      matchedTerm: normalized,
    };
  };
}

function makeComboKeyLabels(comboKeys, drugs, translations) {
  return Object.fromEntries(
    comboKeys.map((key) => [
      key,
      translations.drugs?.[key] ?? drugs[key]?.pretty_name ?? key,
    ]),
  );
}

function makePairKeyFactory(comboKeys) {
  const order = new Map(comboKeys.map((key, index) => [key, index]));

  return (keyA, keyB) => {
    const aOrder = order.get(keyA) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = order.get(keyB) ?? Number.MAX_SAFE_INTEGER;
    const [first, second] =
      aOrder < bOrder || (aOrder === bOrder && keyA <= keyB)
        ? [keyA, keyB]
        : [keyB, keyA];
    return `${first}|${second}`;
  };
}

function uniqueSortedKeys(keys, comboKeys) {
  const order = new Map(comboKeys.map((key, index) => [key, index]));
  return [...new Set(keys)].sort((a, b) => {
    const aOrder = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b);
  });
}

function makePairKeys(keys, comboKeys) {
  const makePairKey = makePairKeyFactory(comboKeys);
  const uniqueKeys = uniqueSortedKeys(keys, comboKeys);
  const pairs = [];

  for (let a = 0; a < uniqueKeys.length; a += 1) {
    for (let b = a + 1; b < uniqueKeys.length; b += 1) {
      pairs.push(makePairKey(uniqueKeys[a], uniqueKeys[b]));
    }
  }

  return pairs;
}

function splitNameList(value) {
  return cleanWikiMarkup(value)
    .replace(/^other names:\s*/i, "")
    .split(/\s*,\s*|\s*;\s*/)
    .map((part) => part.trim().replace(/[.:]$/, ""))
    .filter((part) => !excludedNames.has(normalizeIndexKey(part)))
    .filter(Boolean);
}

function makeEntry(row, resolveTerm, comboKeys) {
  const [drug1 = "", drug2 = "", drug3 = "", drug4 = "", slang = "", intoxicationName = "", comment = ""] =
    row.cells;

  const sourceSlots = [drug1, drug2, drug3, drug4]
    .map((raw, index) => {
      const plain = cleanWikiMarkup(raw);
      const terms = extractSourceTerms(raw).map((term) => {
        const resolution = resolveTerm(term);
        return {
          source: term,
          normalized: normalizeIndexKey(term),
          tripSitKeys: resolution.keys,
          confidence: resolution.confidence,
          ...(resolution.note ? { note: resolution.note } : {}),
          ...(resolution.matchedTerm ? { matchedTerm: resolution.matchedTerm } : {}),
        };
      });

      return {
        position: index + 1,
        raw: raw.trim(),
        plain,
        terms,
      };
    })
    .filter((slot) => slot.raw || slot.plain || slot.terms.length > 0);

  const tripSitKeys = uniqueSortedKeys(
    sourceSlots.flatMap((slot) => slot.terms.flatMap((term) => term.tripSitKeys)),
    comboKeys,
  );
  const pairKeys = makePairKeys(tripSitKeys, comboKeys);
  const unresolvedTerms = sourceSlots.flatMap((slot) =>
    slot.terms
      .filter((term) => term.tripSitKeys.length === 0)
      .map((term) => term.normalized),
  );
  const slotsWithTerms = sourceSlots.filter((slot) => slot.terms.length > 0);
  const resolvedSlots = slotsWithTerms.filter((slot) =>
    slot.terms.some((term) => term.tripSitKeys.length > 0),
  );

  let resolutionStatus = "unresolved";
  if (slotsWithTerms.length > 0 && resolvedSlots.length === slotsWithTerms.length) {
    resolutionStatus = unresolvedTerms.length > 0 ? "partial" : "resolved";
  } else if (resolvedSlots.length > 0) {
    resolutionStatus = "partial";
  }

  return {
    sourceRow: row.sourceRow,
    sourceSlots,
    tripSitKeys,
    pairKeys,
    combinationKey: tripSitKeys.join("+"),
    slang: splitNameList(slang),
    intoxicationNames: splitNameList(intoxicationName),
    comment: cleanWikiMarkup(comment),
    resolutionStatus,
    unresolvedTerms: [...new Set(unresolvedTerms)].sort(),
  };
}

function addIndexValue(index, key, id) {
  if (!key) return;
  if (!index[key]) index[key] = [];
  if (!index[key].includes(id)) index[key].push(id);
}

function slugForId(value) {
  return normalizeIndexKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "term";
}

function addSearchDocument(searchDocuments, seen, entryId, entry, kind, label, overrides = {}) {
  const normalized = normalizeIndexKey(label);
  if (!normalized) return;
  if (excludedNames.has(normalized)) return;

  const documentId = `${entryId}:${kind}:${slugForId(normalized)}`;
  if (seen.has(documentId)) return;
  seen.add(documentId);

  searchDocuments.push({
    id: documentId,
    kind,
    label,
    normalized,
    entryId,
    sourceRow: entry.sourceRow,
    tripSitKeys: entry.tripSitKeys,
    pairKeys: entry.pairKeys,
    combinationKey: entry.combinationKey,
    resolutionStatus: entry.resolutionStatus,
    ...overrides,
  });
}

function buildIndexes(entriesById) {
  const byPair = {};
  const byCombinationKey = {};
  const byTripSitKey = {};
  const bySlang = {};
  const bySourceTerm = {};
  const unresolvedTerms = {};
  const searchDocuments = [];
  const seenSearchDocuments = new Set();

  for (const [id, entry] of Object.entries(entriesById)) {
    for (const pairKey of entry.pairKeys) addIndexValue(byPair, pairKey, id);
    addIndexValue(byCombinationKey, entry.combinationKey, id);
    for (const key of entry.tripSitKeys) addIndexValue(byTripSitKey, key, id);

    for (const name of entry.slang) {
      addIndexValue(bySlang, normalizeIndexKey(name), id);
      addSearchDocument(searchDocuments, seenSearchDocuments, id, entry, "slang", name);
    }

    for (const name of entry.intoxicationNames) {
      addIndexValue(bySlang, normalizeIndexKey(name), id);
      addSearchDocument(searchDocuments, seenSearchDocuments, id, entry, "intoxication-name", name);
    }

    for (const slot of entry.sourceSlots) {
      for (const term of slot.terms) {
        addIndexValue(bySourceTerm, term.normalized, id);
        if (term.tripSitKeys.length === 0) addIndexValue(unresolvedTerms, term.normalized, id);
        addSearchDocument(searchDocuments, seenSearchDocuments, id, entry, "source-term", term.source, {
          sourcePosition: slot.position,
          sourceTermTripSitKeys: term.tripSitKeys,
          sourceTermConfidence: term.confidence,
        });
      }
    }
  }

  return {
    searchDocuments,
    byPair,
    byCombinationKey,
    byTripSitKey,
    bySlang,
    bySourceTerm,
    unresolvedTerms,
  };
}

function addManualEntries(entriesById, comboKeys) {
  for (const entry of manualEntries) {
    const tripSitKeys = uniqueSortedKeys(entry.tripSitKeys, comboKeys);
    entriesById[entry.id] = {
      ...entry,
      tripSitKeys,
      pairKeys: makePairKeys(tripSitKeys, comboKeys),
      combinationKey: tripSitKeys.join("+"),
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const outputPath = path.resolve(repoRoot, options.output);
  const outputRelativePath = path.relative(repoRoot, outputPath);

  const [combos, drugs, translations, seed, sourceData] = await Promise.all([
    readJson("drugs/combos.json"),
    readJson("drugs/drugs.json"),
    readJson("drugs/translations/en.json"),
    readOptionalJson(outputRelativePath),
    readSource(options),
  ]);

  const comboKeys = Object.keys(combos);
  const termMap = {
    ...defaultTermMap,
    ...(seed.tripSit?.termMap ?? {}),
  };
  const resolveTerm = buildResolver({
    comboKeys,
    drugs,
    translations,
    termMap,
  });

  const rows = parseWikiTableRows(sourceData.wikitext);
  const entriesById = {};

  for (const row of rows) {
    const id = `${entryIdPrefix}-${String(row.sourceRow).padStart(3, "0")}`;
    entriesById[id] = {
      id,
      ...makeEntry(row, resolveTerm, comboKeys),
    };
  }
  addManualEntries(entriesById, comboKeys);

  const indexes = buildIndexes(entriesById);
  const output = {
    schemaVersion: seed.schemaVersion ?? 1,
    generatedAt: new Date().toISOString(),
    source: {
      ...(seed.source ?? {}),
      ...sourceData.source,
    },
    design: seed.design ?? {},
    tripSit: {
      comboKeys,
      comboKeyLabels: makeComboKeyLabels(comboKeys, drugs, translations),
      termMap,
    },
    entriesById,
    ...indexes,
  };

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  const unresolvedCount = Object.keys(indexes.unresolvedTerms).length;
  console.log(
    `Wrote ${Object.keys(entriesById).length} entries to ${outputRelativePath} with ${Object.keys(indexes.byPair).length} TripSit pair indexes and ${unresolvedCount} unresolved source terms.`,
  );
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
