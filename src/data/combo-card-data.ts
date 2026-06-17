import type { Locale } from "../i18n/locales";
import {
  getColumnByKey,
  getColumns,
  sortPair,
  type GroupName,
} from "./config";
import { getInteraction, type Source } from "./combos";
import type { Definition } from "./definitions";
import { keyToSlug, pairSlug, parsePairSlug } from "./slug";

export type ComboSubstanceData = {
  key: string;
  label: string;
  slug: string;
  group: GroupName;
};

export type ComboCardData = {
  slug: string;
  substances: [ComboSubstanceData, ComboSubstanceData];
  definition: Definition;
  note?: string;
  sources?: Source[];
};

export function getComboCardData(
  keyA: string,
  keyB: string,
  locale: Locale = "en"
): ComboCardData | null {
  const [a, b] = sortPair(locale, keyA, keyB);
  const colA = getColumnByKey(locale, a);
  const colB = getColumnByKey(locale, b);
  if (!colA || !colB) return null;

  const { definition, note, sources } = getInteraction(a, b, locale);

  return {
    slug: pairSlug(a, b),
    substances: [
      {
        key: a,
        label: colA.label,
        slug: keyToSlug(a),
        group: colA.group,
      },
      {
        key: b,
        label: colB.label,
        slug: keyToSlug(b),
        group: colB.group,
      },
    ],
    definition,
    note,
    sources,
  };
}

export function getComboCardDataBySlug(
  slug: string,
  locale: Locale = "en"
): ComboCardData | null {
  const parsed = parsePairSlug(slug);
  if (!parsed) return null;

  const colA = getColumnByKey(locale, parsed[0]);
  const colB = getColumnByKey(locale, parsed[1]);
  if (!colA || !colB) return null;

  return getComboCardData(colA.key, colB.key, locale);
}

export function listComboSlugs(locale: Locale = "en"): string[] {
  const columns = getColumns(locale);
  const slugs: string[] = [];

  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const a = columns[i]!;
      const b = columns[j]!;
      const [keyA, keyB] = sortPair(locale, a.key, b.key);
      slugs.push(pairSlug(keyA, keyB));
    }
  }

  return slugs;
}
