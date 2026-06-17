import type { Locale } from "./locales";
import { mergeDrugLabels } from "./merge";

import enUi from "../../i18n/ui/en.json";
import frUi from "../../i18n/ui/fr.json";
import deUi from "../../i18n/ui/de.json";
import itUi from "../../i18n/ui/it.json";

import enTripsit from "../../drugs/translations/en.json";
import frTripsit from "../../drugs/translations/fr.json";
import deTripsit from "../../drugs/translations/de.json";
import itTripsit from "../../drugs/translations/it.json";

import enDrugLabels from "../../i18n/content/en/drug-labels.json";
import frDrugLabels from "../../i18n/content/fr/drug-labels.json";
import deDrugLabels from "../../i18n/content/de/drug-labels.json";
import itDrugLabels from "../../i18n/content/it/drug-labels.json";

import enComboNotes from "../../i18n/content/en/combo-notes.json";
import frComboNotes from "../../i18n/content/fr/combo-notes.json";
import deComboNotes from "../../i18n/content/de/combo-notes.json";
import itComboNotes from "../../i18n/content/it/combo-notes.json";

import enStatusDefs from "../../i18n/content/en/status-definitions.json";
import frStatusDefs from "../../i18n/content/fr/status-definitions.json";
import deStatusDefs from "../../i18n/content/de/status-definitions.json";
import itStatusDefs from "../../i18n/content/it/status-definitions.json";

import enClassDesc from "../../i18n/content/en/class-descriptions.json";
import frClassDesc from "../../i18n/content/fr/class-descriptions.json";
import deClassDesc from "../../i18n/content/de/class-descriptions.json";
import itClassDesc from "../../i18n/content/it/class-descriptions.json";

import type { UiMessages } from "./ui";

export type TripsitTranslation = {
  title: string;
  app: string;
  support: string;
  drugs: Record<string, string>;
  interactions: Record<string, string>;
};

export type OverlayEntry = {
  _source?: string;
  text: string;
};

export type LocaleBundle = {
  locale: Locale;
  ui: UiMessages;
  tripsit: TripsitTranslation;
  drugLabels: Record<string, string>;
  comboNotes: Record<string, OverlayEntry>;
  statusDefinitions: Record<string, OverlayEntry>;
  classDescriptions: Record<string, OverlayEntry>;
  drugOverlays: Record<string, Record<string, unknown>>;
};

const uiByLocale: Record<Locale, UiMessages> = {
  en: enUi,
  fr: frUi,
  de: deUi,
  it: itUi,
};

const tripsitByLocale: Record<Locale, TripsitTranslation> = {
  en: enTripsit,
  fr: frTripsit,
  de: deTripsit,
  it: itTripsit,
};

const drugLabelsAugment: Record<Locale, Record<string, string>> = {
  en: enDrugLabels,
  fr: frDrugLabels,
  de: deDrugLabels,
  it: itDrugLabels,
};

const comboNotesByLocale = {
  en: enComboNotes,
  fr: frComboNotes,
  de: deComboNotes,
  it: itComboNotes,
} as Record<Locale, Record<string, OverlayEntry>>;

const statusDefsByLocale = {
  en: enStatusDefs,
  fr: frStatusDefs,
  de: deStatusDefs,
  it: itStatusDefs,
} as Record<Locale, Record<string, OverlayEntry>>;

const classDescByLocale = {
  en: enClassDesc,
  fr: frClassDesc,
  de: deClassDesc,
  it: itClassDesc,
} as Record<Locale, Record<string, OverlayEntry>>;

const drugOverlayModules = import.meta.glob<Record<string, unknown>>(
  "../../i18n/content/*/drugs/*.json",
  { eager: true, import: "default" }
);

function drugFileKeyToMatrixKey(filename: string): string {
  return filename.replace(/\.json$/, "").replace(/__/g, "/");
}

function loadDrugOverlays(locale: Locale): Record<string, Record<string, unknown>> {
  const prefix = `../../i18n/content/${locale}/drugs/`;
  const overlays: Record<string, Record<string, unknown>> = {};

  for (const [path, mod] of Object.entries(drugOverlayModules)) {
    if (!path.startsWith(prefix)) continue;
    const filename = path.slice(prefix.length);
    const key = drugFileKeyToMatrixKey(filename);
    overlays[key] = mod;
  }

  return overlays;
}

const drugOverlaysCache = new Map<Locale, Record<string, Record<string, unknown>>>();

export function getDrugOverlays(locale: Locale): Record<string, Record<string, unknown>> {
  if (!drugOverlaysCache.has(locale)) {
    drugOverlaysCache.set(locale, loadDrugOverlays(locale));
  }
  return drugOverlaysCache.get(locale)!;
}

export function getLocaleBundle(locale: Locale): LocaleBundle {
  const tripsit = tripsitByLocale[locale];
  const drugLabels = mergeDrugLabels(tripsit.drugs, drugLabelsAugment[locale]);

  return {
    locale,
    ui: uiByLocale[locale],
    tripsit,
    drugLabels,
    comboNotes: comboNotesByLocale[locale],
    statusDefinitions: statusDefsByLocale[locale],
    classDescriptions: classDescByLocale[locale],
    drugOverlays: getDrugOverlays(locale),
  };
}

export function getUiMessages(locale: Locale): UiMessages {
  return uiByLocale[locale];
}

export function getComboNote(locale: Locale, pairKey: string): string | undefined {
  const entry = comboNotesByLocale[locale][pairKey];
  return entry?.text;
}

export function getStatusDefinition(locale: Locale, statusKey: string): string | undefined {
  return statusDefsByLocale[locale][statusKey]?.text;
}

export function getClassDescription(locale: Locale, key: string): string | undefined {
  return classDescByLocale[locale][key]?.text;
}

export function getInteractionLabel(locale: Locale, normalizedStatus: string): string | undefined {
  return tripsitByLocale[locale].interactions[normalizedStatus];
}

export function getDrugLabel(locale: Locale, key: string): string | undefined {
  const bundle = getLocaleBundle(locale);
  return bundle.drugLabels[key];
}
