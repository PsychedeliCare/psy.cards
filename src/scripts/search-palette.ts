import Fuse from "fuse.js";
import extendedCombosData from "../../data/combos-extended.json";
import drugsData from "../../drugs/drugs.json";
import { openModalFromHref } from "./combo-modal.ts";
import { lockPageScroll, unlockPageScroll } from "./scroll-lock.ts";
import { getPageI18n, getUiString } from "../i18n/client";
import type { GroupName } from "../data/config";
import { getInteraction } from "../data/combos";
import { pairSlug } from "../data/slug";

type PageColumn = {
  key: string;
  label: string;
  slug: string;
  group: GroupName;
};

function getPageColumns(): PageColumn[] {
  return getPageI18n()?.columns ?? [];
}

function getComboRoute(): string {
  return getPageI18n()?.comboRoute ?? "/combos";
}

function getSubstanceBase(): string {
  const base = getPageI18n()?.substanceBase ?? "/";
  return base.endsWith("/") ? base : `${base}/`;
}

function getPageLocale(): string {
  return getPageI18n()?.locale ?? "en";
}

function getColumnMap(): Map<string, PageColumn> {
  return new Map(getPageColumns().map((column) => [column.key, column]));
}

function sortPairKeys(keyA: string, keyB: string): [string, string] {
  const pageColumns = getPageColumns();
  const ia = pageColumns.findIndex((column) => column.key === keyA);
  const ib = pageColumns.findIndex((column) => column.key === keyB);
  if (ia === -1 || ib === -1) return [keyA, keyB];
  return ia <= ib ? [keyA, keyB] : [keyB, keyA];
}

type DrugRecord = {
  aliases?: string[];
  categories?: string[];
  name?: string;
  pretty_name?: string;
  properties?: {
    aliases?: unknown;
    categories?: unknown;
    summary?: unknown;
    [key: string]: unknown;
  };
};

type ExtendedSearchDocument = {
  id: string;
  kind: string;
  label: string;
  normalized?: string;
  entryId?: string;
  tripSitKeys?: string[];
  pairKeys?: string[];
  sourceTermTripSitKeys?: string[];
  combinationKey?: string;
  resolutionStatus?: string;
};

type ExtendedEntry = {
  id: string;
  tripSitKeys?: string[];
  pairKeys?: string[];
  combinationKey?: string;
  slang?: string[];
  intoxicationNames?: string[];
  comment?: string;
  sourceSlots?: Array<{
    plain?: string;
    terms?: Array<{
      source?: string;
      normalized?: string;
      matchedTerm?: string;
      tripSitKeys?: string[];
    }>;
  }>;
};

type ExtendedCombosData = {
  tripSit?: {
    comboKeys?: string[];
    comboKeyLabels?: Record<string, string>;
  };
  entriesById?: Record<string, ExtendedEntry>;
  searchDocuments?: ExtendedSearchDocument[];
};

type SearchItem = {
  id: string;
  kind: "substance" | "combo";
  title: string;
  subtitle: string;
  href: string;
  typeLabel: string;
  aliases: string[];
  keywords: string[];
  statusKey?: string;
  group?: GroupName;
  pairKeys?: [string, string];
  featured?: boolean;
};

type SearchResult = {
  item: SearchItem;
  matchedTerm?: string;
};

function getDefaultResults(): SearchItem[] {
  const byId = new Map(getSearchItems().map((item) => [item.id, item]));
  const commonKeys = [
    "amphetamines",
    "cocaine",
    "caffeine",
    "mdma",
    "lsd",
    "mushrooms",
    "ketamine",
    "alcohol",
    "ghb/gbl",
    "benzodiazepines",
    "cannabis",
  ];

  return commonKeys
    .map((key) => byId.get(`substance:${key}`))
    .filter((item): item is SearchItem => item !== undefined);
}

function getResultClass(item: SearchItem): string {
  const classes = ["search-palette__result"];

  if (item.kind === "substance" && item.group) {
    classes.push(`group-${item.group}`, "search-palette__result--substance");
  } else if (item.kind === "combo") {
    classes.push("search-palette__result--combo");
  }

  return classes.join(" ");
}

function getPairGroups(pairKeys: [string, string]): [GroupName, GroupName] {
  const columnA = getColumnMap().get(pairKeys[0]!);
  const columnB = getColumnMap().get(pairKeys[1]!);
  return [
    columnA?.group ?? "psychedelic",
    columnB?.group ?? "psychedelic",
  ];
}

function createResultBorders(item: SearchItem): HTMLElement | null {
  if (item.kind === "substance" && item.group) {
    const wrap = document.createElement("span");
    wrap.className = "search-palette__result-borders";
    wrap.setAttribute("aria-hidden", "true");

    const stripe = document.createElement("span");
    stripe.className = `search-palette__result-border group-${item.group}`;
    wrap.appendChild(stripe);
    return wrap;
  }

  if (item.kind === "combo" && item.pairKeys) {
    const wrap = document.createElement("span");
    wrap.className = "search-palette__result-borders search-palette__result-borders--combo";
    wrap.setAttribute("aria-hidden", "true");

    for (const group of getPairGroups(item.pairKeys)) {
      const stripe = document.createElement("span");
      stripe.className = `search-palette__result-border group-${group}`;
      wrap.appendChild(stripe);
    }
    return wrap;
  }

  return null;
}

function findMatchedTerm(item: SearchItem, query: string): string | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;

  const normalizedQuery = normalize(trimmed);
  const displayTitle = item.id.startsWith("combo-name:")
    ? item.aliases[0] ?? item.title
    : item.title;
  const normalizedDisplay = normalize(displayTitle);

  if (item.id.startsWith("combo-name:")) {
    const slang = item.title;
    if (normalize(slang) !== normalizedDisplay) return slang;
  }

  const candidates = uniqueStrings([
    ...item.aliases,
    ...item.keywords.filter((keyword) => normalize(keyword) !== normalizedDisplay),
  ]);

  let best: { term: string; score: number } | undefined;

  for (const term of candidates) {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm || normalizedTerm === normalizedDisplay) continue;

    let score = 0;
    if (normalizedTerm === normalizedQuery) score = 100;
    else if (normalizedTerm.startsWith(normalizedQuery)) score = 80 - normalizedTerm.length * 0.01;
    else if (normalizedQuery.startsWith(normalizedTerm)) score = 60;
    else if (normalizedTerm.includes(normalizedQuery)) score = 40;
    else if (matchesInOrder(normalizedQuery, normalizedTerm)) score = 20;

    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && term.length < best.term.length)) {
      best = { term, score };
    }
  }

  return best?.term;
}

function matchesInOrder(needle: string, haystack: string): boolean {
  if (!needle) return true;

  let index = 0;
  for (const char of needle) {
    index = haystack.indexOf(char, index);
    if (index === -1) return false;
    index += 1;
  }

  return true;
}

function toSearchResult(item: SearchItem, query: string): SearchResult {
  const matchedTerm = findMatchedTerm(item, query);
  const displayTitle = item.id.startsWith("combo-name:")
    ? item.aliases[0] ?? item.title
    : item.title;

  if (matchedTerm && normalize(matchedTerm) === normalize(displayTitle)) {
    return { item, matchedTerm: undefined };
  }

  return { item, matchedTerm };
}

function getDisplayTitle(result: SearchResult): string {
  if (result.item.id.startsWith("combo-name:")) {
    return result.item.aliases[0] ?? result.item.title;
  }
  return result.item.title;
}

type PairMeta = {
  pairKey: string;
  slug: string;
  title: string;
  subtitle: string;
  href: string;
  statusKey: string;
  keys: [string, string];
};

const drugs = drugsData as Record<string, DrugRecord>;
const extendedCombos = extendedCombosData as ExtendedCombosData;

const DRUG_KEY_ALIASES: Record<string, string> = {
  dxm: "dextromethorphan",
  "ghb/gbl": "ghb",
};

const FEATURED_COMBO_NAMES = new Set([
  "candy flip",
  "hippie flip",
  "kitty flip",
  "speedball",
  "nexus flip",
  "soul bombing",
]);

let fuse: Fuse<SearchItem> | null = null;
let searchItems: SearchItem[] | null = null;
let initialized = false;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    if (!isNonEmptyString(value)) continue;
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }

  return out;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDrugByComboKey(key: string): DrugRecord | undefined {
  return drugs[key] ?? drugs[DRUG_KEY_ALIASES[key] ?? ""];
}

function getPairKeyForExtendedIndex(keyA: string, keyB: string): string {
  const order = extendedCombos.tripSit?.comboKeys ?? [];
  const indexA = order.indexOf(keyA);
  const indexB = order.indexOf(keyB);
  const safeA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
  const safeB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;

  return safeA <= safeB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
}

function getRouteSlug(keyA: string, keyB: string): string {
  const [a, b] = sortPairKeys(keyA, keyB);
  return pairSlug(a, b);
}

function addToMapSet(map: Map<string, Set<string>>, key: string, values: unknown[]): void {
  const cleanValues = uniqueStrings(values);
  if (cleanValues.length === 0) return;

  const set = map.get(key) ?? new Set<string>();
  cleanValues.forEach((value) => set.add(value));
  map.set(key, set);
}

function getEntryKeywords(entry: ExtendedEntry): string[] {
  const sourceSlotTerms =
    entry.sourceSlots?.flatMap((slot) => [
      slot.plain,
      ...(slot.terms?.flatMap((term) => [
        term.source,
        term.normalized,
        term.matchedTerm,
      ]) ?? []),
    ]) ?? [];

  return uniqueStrings([
    entry.combinationKey,
    entry.comment,
    ...(entry.slang ?? []),
    ...(entry.intoxicationNames ?? []),
    ...sourceSlotTerms,
  ]);
}

function buildPairMeta(): Map<string, PairMeta> {
  const pairMeta = new Map<string, PairMeta>();
  const pageColumns = getPageColumns();
  const columnMap = getColumnMap();
  const comboRoute = getComboRoute();
  const locale = getPageLocale() as import("../i18n/locales").Locale;

  for (let i = 0; i < pageColumns.length; i++) {
    for (let j = i + 1; j < pageColumns.length; j++) {
      const columnA = pageColumns[i];
      const columnB = pageColumns[j];
      if (!columnA || !columnB) continue;

      const [routeKeyA, routeKeyB] = sortPairKeys(columnA.key, columnB.key);
      const routeColumnA = columnMap.get(routeKeyA);
      const routeColumnB = columnMap.get(routeKeyB);
      if (!routeColumnA || !routeColumnB) continue;

      const pairKey = getPairKeyForExtendedIndex(columnA.key, columnB.key);
      const interaction = getInteraction(routeKeyA, routeKeyB, locale);
      const title = `${routeColumnA.label} + ${routeColumnB.label}`;
      const slug = getRouteSlug(routeKeyA, routeKeyB);

      pairMeta.set(pairKey, {
        pairKey,
        slug,
        title,
        subtitle: interaction.definition.label,
        href: `${comboRoute}?combo=${encodeURIComponent(slug)}`,
        statusKey: interaction.definition.statusKey,
        keys: [routeKeyA, routeKeyB],
      });
    }
  }

  return pairMeta;
}

function buildSearchItems(): SearchItem[] {
  const pairMeta = buildPairMeta();
  const substanceAliases = new Map<string, Set<string>>();
  const comboAliases = new Map<string, Set<string>>();
  const comboKeywords = new Map<string, Set<string>>();
  const aliasItems = new Map<string, SearchItem>();

  for (const entry of Object.values(extendedCombos.entriesById ?? {})) {
    const labels = uniqueStrings([
      ...(entry.slang ?? []),
      ...(entry.intoxicationNames ?? []),
    ]);
    const keywords = getEntryKeywords(entry);

    for (const pairKey of entry.pairKeys ?? []) {
      const meta = pairMeta.get(pairKey);
      if (!meta) continue;

      addToMapSet(comboAliases, pairKey, labels);
      addToMapSet(comboKeywords, pairKey, keywords);

      for (const label of labels) {
        const normalizedLabel = normalize(label);
        const aliasId = `combo-name:${pairKey}:${normalizedLabel}`;
        if (aliasItems.has(aliasId)) continue;

        aliasItems.set(aliasId, {
          id: aliasId,
          kind: "combo",
          title: label,
          subtitle: meta.subtitle,
          href: meta.href,
          typeLabel: getUiString("search.comboName", "Combo name"),
          aliases: [meta.title],
          keywords: uniqueStrings([
            ...keywords,
            ...meta.keys,
            meta.title,
            meta.subtitle,
          ]),
          statusKey: meta.statusKey,
          pairKeys: meta.keys,
          featured: FEATURED_COMBO_NAMES.has(normalizedLabel),
        });
      }
    }
  }

  for (const doc of extendedCombos.searchDocuments ?? []) {
    const pairKeys = doc.pairKeys ?? [];
    const values = [doc.label, doc.normalized, doc.combinationKey];

    for (const pairKey of pairKeys) {
      if (!pairMeta.has(pairKey)) continue;

      if (doc.kind === "slang" || doc.kind === "intoxication-name") {
        addToMapSet(comboAliases, pairKey, values);
      } else {
        addToMapSet(comboKeywords, pairKey, values);
      }
    }

    const sourceKeys = doc.sourceTermTripSitKeys ?? [];
    if (doc.kind === "source-term" && sourceKeys.length === 1) {
      const key = sourceKeys[0];
      if (key && getColumnMap().has(key)) {
        addToMapSet(substanceAliases, key, values);
      }
    }
  }

  const items: SearchItem[] = getPageColumns().map((column) => {
    const drug = getDrugByComboKey(column.key);
    const aliases = uniqueStrings([
      column.key,
      drug?.name,
      drug?.pretty_name,
      ...(drug?.aliases ?? []),
      ...stringArray(drug?.properties?.aliases),
      ...Array.from(substanceAliases.get(column.key) ?? []),
    ]).filter((alias) => normalize(alias) !== normalize(column.label));

    return {
      id: `substance:${column.key}`,
      kind: "substance",
      title: column.label,
      subtitle: getUiString("search.substanceCard", "Substance card"),
      href: `${getSubstanceBase()}${column.slug}`,
      typeLabel: getUiString("search.substance", "Substance"),
      aliases,
      keywords: uniqueStrings([
        column.key,
        column.label,
        drug?.name,
        drug?.pretty_name,
        drug?.properties?.summary,
        ...(drug?.categories ?? []),
        ...stringArray(drug?.properties?.categories),
        ...aliases,
      ]),
      group: column.group,
    };
  });

  for (const meta of pairMeta.values()) {
    const aliases = Array.from(comboAliases.get(meta.pairKey) ?? []);
    const keywords = Array.from(comboKeywords.get(meta.pairKey) ?? []);

    items.push({
      id: `combo:${meta.pairKey}`,
      kind: "combo",
      title: meta.title,
      subtitle: meta.subtitle,
      href: meta.href,
      typeLabel: getUiString("search.combo", "Combo"),
      aliases,
      keywords: uniqueStrings([
        ...meta.keys,
        meta.title,
        meta.subtitle,
        ...aliases,
        ...keywords,
      ]),
      statusKey: meta.statusKey,
      pairKeys: meta.keys,
      featured: false,
    });
  }

  items.push(...aliasItems.values());

  return items;
}

function getSearchItems(): SearchItem[] {
  searchItems ??= buildSearchItems();
  return searchItems;
}

function getFuse(): Fuse<SearchItem> {
  fuse ??= new Fuse(getSearchItems(), {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.34,
    keys: [
      { name: "title", weight: 0.48 },
      { name: "aliases", weight: 0.34 },
      { name: "keywords", weight: 0.2 },
      { name: "subtitle", weight: 0.08 },
      { name: "typeLabel", weight: 0.05 },
    ],
  });

  return fuse;
}

function dedupeByHref(items: SearchItem[]): SearchItem[] {
  const seen = new Set<string>();
  const out: SearchItem[] = [];

  for (const item of items) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    out.push(item);
  }

  return out;
}

function search(query: string): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return getDefaultResults().map((item) => ({ item }));
  }

  const normalizedQuery = normalize(trimmed);
  return dedupeByHref(
    getFuse()
      .search(trimmed, { limit: 24 })
      .map((result) => result.item)
      .sort((a, b) => {
        const aExact =
          normalize(a.title) === normalizedQuery ||
          a.aliases.some((alias) => normalize(alias) === normalizedQuery);
        const bExact =
          normalize(b.title) === normalizedQuery ||
          b.aliases.some((alias) => normalize(alias) === normalizedQuery);
        if (aExact !== bExact) return aExact ? -1 : 1;
        return 0;
      })
  )
    .slice(0, 12)
    .map((item) => toSearchResult(item, trimmed));
}

function createSvgIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "path");
  circle.setAttribute(
    "d",
    "M10.75 4a6.75 6.75 0 1 0 4.16 12.06l3.52 3.51 1.41-1.41-3.51-3.52A6.75 6.75 0 0 0 10.75 4Zm0 2a4.75 4.75 0 1 1 0 9.5 4.75 4.75 0 0 1 0-9.5Z"
  );
  svg.appendChild(circle);

  return svg;
}

function createPaletteElements() {
  const overlay = document.createElement("div");
  overlay.className = "search-palette";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", getUiString("comboTable.searchAriaLabel", "Search substances and combinations"));
  overlay.dataset.open = "false";

  const backdrop = document.createElement("button");
  backdrop.className = "search-palette__backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close search");

  const panel = document.createElement("div");
  panel.className = "search-palette__panel";

  const form = document.createElement("form");
  form.className = "search-palette__form";

  const icon = document.createElement("span");
  icon.className = "search-palette__search-icon";
  icon.appendChild(createSvgIcon());

  const input = document.createElement("input");
  input.className = "search-palette__input";
  input.type = "search";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = getUiString("search.placeholder", "Search substances and combinations…");
  input.setAttribute("aria-label", getUiString("comboTable.searchAriaLabel", "Search substances and combinations"));
  input.setAttribute("aria-controls", "search-palette-results");
  input.setAttribute("aria-autocomplete", "list");

  form.append(icon, input);

  const results = document.createElement("div");
  results.id = "search-palette-results";
  results.className = "search-palette__results";
  results.setAttribute("role", "listbox");

  const footer = document.createElement("div");
  footer.className = "search-palette__footer";
  footer.innerHTML =
    '<span>↑↓ navigate</span><span>Enter open</span><span>Esc close</span>';

  panel.append(form, results, footer);
  overlay.append(backdrop, panel);
  document.body.appendChild(overlay);

  return { overlay, backdrop, panel, form, input, results };
}

function isCoarsePointerDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

function setModKeyHint(): void {
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  document.documentElement.dataset.modKey = isMac ? "cmd" : "ctrl";

  const shortcut = isMac ? "⌘F" : "Ctrl+F";
  const title = isCoarsePointerDevice()
    ? "Search substances and combinations"
    : `Search substances and combinations (${shortcut})`;

  document.querySelectorAll("[data-search-trigger]").forEach((trigger) => {
    if (trigger instanceof HTMLButtonElement) {
      trigger.title = title;
    }
  });
}

export function initSearchPalette(): void {
  if (initialized) return;
  initialized = true;

  setModKeyHint();

  let palette: ReturnType<typeof createPaletteElements> | null = null;
  let activeIndex = 0;
  let currentResults: SearchResult[] = [];
  let previousFocus: Element | null = null;

  const ensurePalette = () => {
    palette ??= createPaletteElements();
    return palette;
  };

  const setActive = (index: number) => {
    const { input, results } = ensurePalette();
    if (currentResults.length === 0) {
      activeIndex = 0;
      input.removeAttribute("aria-activedescendant");
      return;
    }

    activeIndex = (index + currentResults.length) % currentResults.length;
    const links = Array.from(
      results.querySelectorAll<HTMLAnchorElement>("[data-search-result]")
    );
    links.forEach((link, linkIndex) => {
      const active = linkIndex === activeIndex;
      link.classList.toggle("is-active", active);
      link.setAttribute("aria-selected", active ? "true" : "false");
      if (active) {
        link.scrollIntoView({ block: "nearest" });
      }
    });
    input.setAttribute(
      "aria-activedescendant",
      `search-palette-result-${activeIndex}`
    );
  };

  const renderResults = () => {
    const { input, results } = ensurePalette();
    currentResults = search(input.value);
    activeIndex = 0;
    results.replaceChildren();

    if (currentResults.length === 0) {
      const empty = document.createElement("p");
      empty.className = "search-palette__empty";
      empty.textContent = getUiString("search.empty", "No results found.");
      results.appendChild(empty);
      input.removeAttribute("aria-activedescendant");
      return;
    }

    currentResults.forEach((result, index) => {
      const { item, matchedTerm } = result;
      const link = document.createElement("a");
      link.id = `search-palette-result-${index}`;
      link.className = getResultClass(item);
      link.href = item.href;
      link.dataset.searchResult = String(index);
      if (item.kind === "substance") {
        link.dataset.substance = item.href;
      } else {
        try {
          const combo = new URL(item.href, window.location.origin).searchParams.get("combo");
          if (combo) link.dataset.combo = combo;
        } catch {
          // ignore malformed href
        }
      }
      link.setAttribute("role", "option");
      link.setAttribute("aria-selected", index === activeIndex ? "true" : "false");

      const borders = createResultBorders(item);
      if (borders) link.appendChild(borders);

      const titleRow = document.createElement("span");
      titleRow.className = "search-palette__result-title";

      const name = document.createElement("span");
      name.className = "search-palette__result-name";
      name.textContent = getDisplayTitle(result);
      titleRow.appendChild(name);

      if (matchedTerm) {
        const match = document.createElement("span");
        match.className = "search-palette__result-match";
        match.textContent = matchedTerm;
        titleRow.appendChild(match);
      }

      const subtitle = document.createElement("span");
      subtitle.className = "search-palette__result-subtitle";
      subtitle.textContent = item.subtitle;

      link.append(titleRow, subtitle);
      link.addEventListener("pointermove", () => setActive(index));
      results.appendChild(link);
    });

    setActive(0);
  };

  const close = (options: { restoreFocus?: boolean; unlockScroll?: boolean } = {}) => {
    const { overlay } = ensurePalette();
    overlay.dataset.open = "false";
    document.documentElement.removeAttribute("data-search-palette-open");
    if (options.unlockScroll !== false) {
      unlockPageScroll();
    }
    if (
      options.restoreFocus !== false &&
      previousFocus instanceof HTMLElement
    ) {
      previousFocus.focus({ preventScroll: true });
    }
  };

  const focusSearchInput = () => {
    const { input } = ensurePalette();
    input.focus({ preventScroll: true });
    if (input.value.length > 0) {
      input.select();
    }
  };

  const open = (initialQuery = "") => {
    const { overlay, input } = ensurePalette();
    previousFocus = document.activeElement;
    lockPageScroll();
    overlay.dataset.open = "true";
    document.documentElement.setAttribute("data-search-palette-open", "");
    input.value = initialQuery;
    renderResults();
    // Focus synchronously so mobile browsers keep the user-gesture activation chain.
    focusSearchInput();
    window.requestAnimationFrame(() => {
      if (document.activeElement !== input) {
        focusSearchInput();
      }
    });
  };

  const navigateToActive = async () => {
    const result = currentResults[activeIndex];
    if (!result) return;
    close({ restoreFocus: false, unlockScroll: false });
    const opened = await openModalFromHref(result.item.href);
    if (!opened) {
      unlockPageScroll();
      window.location.assign(result.item.href);
    }
  };

  const selectedText = () => {
    const selection = window.getSelection()?.toString().trim() ?? "";
    return selection.length > 0 && selection.length < 80 && !selection.includes("\n")
      ? selection
      : "";
  };

  const bindTriggers = () => {
    document.querySelectorAll("[data-search-trigger]").forEach((trigger) => {
      if (!(trigger instanceof HTMLButtonElement)) return;
      if (trigger.dataset.searchTriggerBound === "true") return;

      trigger.dataset.searchTriggerBound = "true";

      const openFromTrigger = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        open();
      };

      trigger.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        openFromTrigger(event);
      });
      trigger.addEventListener("click", openFromTrigger);
      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        openFromTrigger(event);
      });
    });
  };

  document.addEventListener("click", (event) => {
    const trigger =
      event.target instanceof Element
        ? event.target.closest("[data-search-trigger]")
        : null;
    if (!(trigger instanceof HTMLButtonElement)) return;

    event.preventDefault();
    open();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindTriggers, { once: true });
  } else {
    bindTriggers();
  }
  document.addEventListener("astro:page-load", bindTriggers);
  setModKeyHint();

  document.addEventListener("keydown", (event) => {
    const { overlay, input } = ensurePalette();
    const isFindShortcut =
      event.key.toLocaleLowerCase() === "f" && (event.metaKey || event.ctrlKey);

    if (isFindShortcut) {
      event.preventDefault();
      open(overlay.dataset.open === "true" ? input.value : selectedText());
      return;
    }

    if (overlay.dataset.open !== "true") return;

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(activeIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      navigateToActive();
    }
  });

  const { backdrop, form, input, results } = ensurePalette();
  backdrop.addEventListener("click", close);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    navigateToActive();
  });
  input.addEventListener("input", renderResults);
  input.addEventListener("focus", renderResults);
  results.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>("[data-search-result]")
      : null;
    if (!anchor) return;
    event.preventDefault();
    const index = Number(anchor.dataset.searchResult ?? 0);
    activeIndex = Number.isFinite(index) ? index : 0;
    navigateToActive();
  });
}
