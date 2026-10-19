import combosData from "../../../../drugs/combos.json";
import type { Locale } from "../i18n/locales";
import { getComboNote } from "../i18n/load-locale";
import { resolveMatrixKey } from "../i18n/key-aliases";
import { resolveStatus, type Definition } from "./definitions";
import { sortPair } from "./config";

export type Source = {
  author: string;
  title: string;
  url: string;
};

type ComboEntry = {
  status?: string;
  note?: string;
  sources?: Source[];
};

type CombosMap = Record<string, Record<string, ComboEntry>>;

const combos = combosData as CombosMap;

export type Interaction = {
  definition: Definition;
  note?: string;
  sources?: Source[];
};

export function getInteraction(
  keyA: string,
  keyB: string,
  locale: Locale = "en"
): Interaction {
  // Column keys can differ from the dataset's (e.g. `dxm` vs `dextromethorphan`).
  const dataA = resolveMatrixKey(keyA);
  const dataB = resolveMatrixKey(keyB);
  const ab = combos[dataA]?.[dataB];
  const ba = combos[dataB]?.[dataA];

  let entry: ComboEntry | undefined;
  if (ab && ba) {
    entry = {
      status: ab.status ?? ba.status,
      note: ab.note ?? ba.note,
      sources: ab.sources ?? ba.sources,
    };
  } else {
    entry = ab ?? ba;
  }

  // Overlay notes are keyed by the alphabetically sorted dataset keys; the
  // column-order key is kept as a fallback for older overlay entries.
  const canonicalKey = [dataA, dataB].sort().join("|");
  const [sortedA, sortedB] = sortPair(locale, keyA, keyB);
  const localizedNote =
    getComboNote(locale, canonicalKey) ??
    getComboNote(locale, `${sortedA}|${sortedB}`) ??
    entry?.note;

  return {
    definition: resolveStatus(entry?.status, locale),
    note: localizedNote,
    sources: entry?.sources,
  };
}

export function listKnownPairs(keys: string[]): Array<[string, string]> {
  const seen = new Set<string>();
  const out: Array<[string, string]> = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i]!;
      const b = keys[j]!;
      const id = `${a}|${b}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push([a, b]);
    }
  }
  return out;
}
