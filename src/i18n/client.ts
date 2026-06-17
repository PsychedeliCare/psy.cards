import type { Locale } from "./locales";
import type { UiMessages } from "./ui";
import type { GroupName } from "../data/config";

export type PageI18n = {
  locale: Locale;
  ui: UiMessages;
  columns: Array<{
    key: string;
    label: string;
    slug: string;
    group: GroupName;
  }>;
  comboRoute: string;
  substanceBase: string;
};

export function getPageI18n(): PageI18n | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("psy-i18n");
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as PageI18n;
  } catch {
    return null;
  }
}

export function getUiString(key: string, fallback: string): string {
  const pageI18n = getPageI18n();
  if (!pageI18n) return fallback;
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, pageI18n.ui);
  return typeof value === "string" ? value : fallback;
}
