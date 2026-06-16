import combogenConfig from "../../combogen/config.json";
import enTranslations from "../../drugs/translations/en.json";
import { keyToSlug } from "./slug";

export type GroupName =
  | "psychedelic"
  | "dissociative"
  | "stimulant"
  | "depressant"
  | "antidepressant"
  | "empathogen"
  | "opioid"
  | "cannabinoid";

export type Column = {
  /** Key used in `drugs/combos.json` (e.g. "benzodiazepines", "ghb/gbl"). */
  key: string;
  /** Display label matching the original table (e.g. "Benzos"). */
  label: string;
  /** URL-safe slug (e.g. "ghb-gbl"). */
  slug: string;
  /** Category used for colour + header styling. */
  group: GroupName;
};

const labelToKey: Record<string, string> = {};
for (const [key, label] of Object.entries(enTranslations.drugs)) {
  labelToKey[label] = key;
}

const groupNames = combogenConfig.groupNames as GroupName[];

const groupOverrides: Record<string, GroupName> = {
  cannabis: "cannabinoid",
  mdma: "empathogen",
  opioids: "opioid",
  tramadol: "opioid",
};

export const visibleGroupOrder: GroupName[] = [
  "stimulant",
  "empathogen",
  "psychedelic",
  "dissociative",
  "depressant",
  "opioid",
  "cannabinoid",
];

const groupOrder: GroupName[] = ["antidepressant", ...visibleGroupOrder];

const originalColumns: Column[] = combogenConfig.tableOrder.flatMap(
  (groupLabels, groupIndex) =>
    groupLabels.map((label) => {
      const key = labelToKey[label] ?? label.toLowerCase();
      return {
        key,
        label,
        slug: keyToSlug(key),
        group: groupOverrides[key] ?? groupNames[groupIndex]!,
      } satisfies Column;
    })
);

const originalOrder = new Map<string, number>(
  originalColumns.map((column, index) => [column.key, index])
);

export const columns: Column[] = [...originalColumns].sort((a, b) => {
  const groupA = groupOrder.indexOf(a.group);
  const groupB = groupOrder.indexOf(b.group);
  const safeGroupA = groupA === -1 ? groupOrder.length : groupA;
  const safeGroupB = groupB === -1 ? groupOrder.length : groupB;

  if (safeGroupA !== safeGroupB) return safeGroupA - safeGroupB;
  return (originalOrder.get(a.key) ?? 0) - (originalOrder.get(b.key) ?? 0);
});

export const columnBySlug = new Map<string, Column>(
  columns.map((c) => [c.slug, c])
);

export const columnByKey = new Map<string, Column>(
  columns.map((c) => [c.key, c])
);

export function getColumnIndex(key: string): number {
  return columns.findIndex((c) => c.key === key);
}

/** Canonical sort order: lower tableOrder index first. */
export function sortPair(keyA: string, keyB: string): [string, string] {
  const ia = getColumnIndex(keyA);
  const ib = getColumnIndex(keyB);
  if (ia === -1 || ib === -1) return [keyA, keyB];
  return ia <= ib ? [keyA, keyB] : [keyB, keyA];
}

export const groupLabels: Record<GroupName, string> = {
  psychedelic: "Psychedelics",
  dissociative: "Dissociatives",
  stimulant: "Stimulants",
  depressant: "Depressants",
  antidepressant: "Antidepressants",
  empathogen: "Empathogens",
  opioid: "Opioids",
  cannabinoid: "Cannabinoids",
};

/** Substances shown in the table's "common" set and search default results. */
export const commonSubstanceKeys = [
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
] as const;

export const commonSubstanceKeySet = new Set<string>(commonSubstanceKeys);
