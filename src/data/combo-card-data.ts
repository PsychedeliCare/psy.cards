import { columnBySlug, columns, sortPair, type GroupName } from "./config";
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

export function getComboCardData(keyA: string, keyB: string): ComboCardData | null {
  const [a, b] = sortPair(keyA, keyB);
  const colA = columns.find((col) => col.key === a);
  const colB = columns.find((col) => col.key === b);
  if (!colA || !colB) return null;

  const { definition, note, sources } = getInteraction(a, b);

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

export function getComboCardDataBySlug(slug: string): ComboCardData | null {
  const parsed = parsePairSlug(slug);
  if (!parsed) return null;

  const colA = columnBySlug.get(parsed[0]);
  const colB = columnBySlug.get(parsed[1]);
  if (!colA || !colB) return null;

  return getComboCardData(colA.key, colB.key);
}

export function listComboSlugs(): string[] {
  const slugs: string[] = [];

  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const a = columns[i]!;
      const b = columns[j]!;
      const [keyA, keyB] = sortPair(a.key, b.key);
      slugs.push(pairSlug(keyA, keyB));
    }
  }

  return slugs;
}
