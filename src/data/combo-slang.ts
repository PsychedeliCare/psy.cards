import extendedCombosData from "../../data/combos-extended.json";

type ExtendedEntry = {
  id: string;
  tripSitKeys?: string[];
  pairKeys?: string[];
  slang?: string[];
  intoxicationNames?: string[];
};

type ExtendedCombos = {
  tripSit?: { comboKeys?: string[] };
  entriesById?: Record<string, ExtendedEntry>;
  byPair?: Record<string, string[]>;
};

const extendedCombos = extendedCombosData as ExtendedCombos;

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Pair key ordered by TripSit comboKeys (matches combos-extended indexes). */
export function getExtendedPairKey(keyA: string, keyB: string): string {
  const order = extendedCombos.tripSit?.comboKeys ?? [];
  const indexA = order.indexOf(keyA);
  const indexB = order.indexOf(keyB);
  const safeA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
  const safeB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
  return safeA <= safeB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
}

function entryNames(entry: ExtendedEntry): string[] {
  const slang = uniqueStrings(entry.slang ?? []);
  if (slang.length > 0) return slang;
  return uniqueStrings(entry.intoxicationNames ?? []);
}

function isExactPairEntry(
  entry: ExtendedEntry,
  keyA: string,
  keyB: string
): boolean {
  const keys = entry.tripSitKeys ?? [];
  if (keys.length === 2 && keys.includes(keyA) && keys.includes(keyB)) {
    return true;
  }
  // Single mapped pair only — skip broad class rows (e.g. Speedball).
  return (entry.pairKeys?.length ?? 0) === 1;
}

/**
 * Best slang / intoxication names for a TripSit pair.
 * Only uses Wikipedia/manual rows that resolve to this exact two-drug combo.
 */
export function getComboSlangNames(keyA: string, keyB: string): string[] {
  const pairKey = getExtendedPairKey(keyA, keyB);
  const entryIds = extendedCombos.byPair?.[pairKey] ?? [];
  if (entryIds.length === 0) return [];

  const names: string[] = [];

  for (const id of entryIds) {
    const entry = extendedCombos.entriesById?.[id];
    if (!entry || !isExactPairEntry(entry, keyA, keyB)) continue;
    names.push(...entryNames(entry));
  }

  return uniqueStrings(names);
}

export function getPrimaryComboSlang(
  keyA: string,
  keyB: string
): string | undefined {
  return getComboSlangNames(keyA, keyB)[0];
}
