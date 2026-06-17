import drugsData from "../../drugs/drugs.json";
import type { Drug } from "../../drugs/types/tripsit";
import type { Locale } from "../i18n/locales";
import { getClassDescription, getLocaleBundle } from "../i18n/load-locale";
import { getColumnByKey, getDisplayLabel } from "./config";

type DrugsMap = Record<string, Drug>;
const drugs = drugsData as unknown as DrugsMap;

const keyAlias: Record<string, string> = {
  dxm: "dextromethorphan",
  "ghb/gbl": "ghb",
};

type OverlayEntry = { _source?: string; text: string };

function applyOverlayValue<T>(base: T, overlay: unknown): T {
  if (overlay === undefined || overlay === null) return base;
  if (typeof overlay === "object" && overlay !== null && "text" in overlay) {
    return (overlay as OverlayEntry).text as T;
  }
  if (Array.isArray(base) && Array.isArray(overlay)) {
    return overlay.map((item, i) => {
      if (typeof item === "object" && item !== null && "text" in item) {
        return item.text;
      }
      return base[i] ?? item;
    }) as T;
  }
  if (
    typeof base === "object" &&
    base !== null &&
    typeof overlay === "object" &&
    overlay !== null &&
    !Array.isArray(base) &&
    !Array.isArray(overlay)
  ) {
    const result = { ...base } as Record<string, unknown>;
    for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
      result[key] = applyOverlayValue(
        (base as Record<string, unknown>)[key],
        value
      );
    }
    return result as T;
  }
  return base;
}

function mergeDrugOverlay(drug: Drug, overlay: Record<string, unknown>): Drug {
  return applyOverlayValue(drug, overlay);
}

export function getDrugByKey(key: string, locale: Locale = "en"): Drug | undefined {
  const direct = drugs[key];
  const aliased = keyAlias[key] ? drugs[keyAlias[key]!] : undefined;
  const base = direct ?? aliased;
  if (!base) return undefined;

  const overlay = getLocaleBundle(locale).drugOverlays[key];
  if (!overlay) return base;
  return mergeDrugOverlay(structuredClone(base), overlay);
}

export function isDrugClass(key: string): boolean {
  const bundle = getLocaleBundle("en");
  return key in bundle.classDescriptions;
}

export function getClassDescriptionText(
  key: string,
  locale: Locale = "en"
): string | undefined {
  return getClassDescription(locale, key);
}

export function getDisplayName(key: string, locale: Locale = "en"): string {
  const drug = getDrugByKey(key, locale);
  return drug?.pretty_name ?? getDisplayLabel(locale, key);
}
