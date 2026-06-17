import type { Locale } from "../i18n/locales";
import { getDrugLabel, getLocaleBundle } from "../i18n/load-locale";
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
  key: string;
  label: string;
  slug: string;
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

function buildColumns(locale: Locale): Column[] {
  const bundle = getLocaleBundle(locale);
  const originalColumns: Column[] = combogenConfig.tableOrder.flatMap(
    (groupLabels, groupIndex) =>
      groupLabels.map((label) => {
        const key = labelToKey[label] ?? label.toLowerCase();
        const localizedLabel = bundle.drugLabels[key] ?? label;
        return {
          key,
          label: localizedLabel,
          slug: keyToSlug(key),
          group: groupOverrides[key] ?? groupNames[groupIndex]!,
        } satisfies Column;
      })
  );

  const originalOrder = new Map<string, number>(
    originalColumns.map((column, index) => [column.key, index])
  );

  return [...originalColumns].sort((a, b) => {
    const groupA = groupOrder.indexOf(a.group);
    const groupB = groupOrder.indexOf(b.group);
    const safeGroupA = groupA === -1 ? groupOrder.length : groupA;
    const safeGroupB = groupB === -1 ? groupOrder.length : groupB;

    if (safeGroupA !== safeGroupB) return safeGroupA - safeGroupB;
    return (originalOrder.get(a.key) ?? 0) - (originalOrder.get(b.key) ?? 0);
  });
}

const columnsCache = new Map<Locale, Column[]>();

export function getColumns(locale: Locale = "en"): Column[] {
  if (!columnsCache.has(locale)) {
    columnsCache.set(locale, buildColumns(locale));
  }
  return columnsCache.get(locale)!;
}

/** @deprecated Use getColumns(locale) */
export const columns = getColumns("en");

export function getColumnBySlug(locale: Locale, slug: string): Column | undefined {
  return getColumns(locale).find((c) => c.slug === slug);
}

export function getColumnByKey(locale: Locale, key: string): Column | undefined {
  return getColumns(locale).find((c) => c.key === key);
}

export const columnBySlug = new Map(columns.map((c) => [c.slug, c]));
export const columnByKey = new Map(columns.map((c) => [c.key, c]));

export function getColumnIndex(locale: Locale, key: string): number {
  return getColumns(locale).findIndex((c) => c.key === key);
}

export function sortPair(locale: Locale, keyA: string, keyB: string): [string, string] {
  const ia = getColumnIndex(locale, keyA);
  const ib = getColumnIndex(locale, keyB);
  if (ia === -1 || ib === -1) return [keyA, keyB];
  return ia <= ib ? [keyA, keyB] : [keyB, keyA];
}

export function getGroupLabels(locale: Locale): Record<GroupName, string> {
  const ui = getLocaleBundle(locale).ui as {
    groups: Record<GroupName, string>;
  };
  return ui.groups;
}

export const groupLabels: Record<GroupName, string> = getGroupLabels("en");

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

export function getDisplayLabel(locale: Locale, key: string): string {
  return getDrugLabel(locale, key) ?? getColumnByKey(locale, key)?.label ?? key;
}
