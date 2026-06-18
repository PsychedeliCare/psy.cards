import type { Locale } from "../i18n/locales";
import { localePath } from "../i18n/locales";
import { getColumns } from "../data/config";
import { listComboSlugs } from "../data/combo-card-data";

/** Paths (not full URLs) that should be cached for offline use in a locale. */
export function getOfflineCachePaths(locale: Locale): string[] {
  const columns = getColumns(locale);
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  const paths: string[] = [
    localePath(locale, "/combos"),
    localePath(locale, "/burning-mountain"),
    `${localePrefix || ""}/data/substances.json`,
  ];

  for (const column of columns) {
    paths.push(`${localePrefix}/card/${column.slug}`);
    paths.push(localePath(locale, `/${column.slug}`));
  }

  for (const slug of listComboSlugs(locale)) {
    paths.push(`${localePrefix}/combo-data/${slug}.json`);
  }

  return paths;
}
