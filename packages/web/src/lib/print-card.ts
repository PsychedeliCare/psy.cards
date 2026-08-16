import { getColumnByKey, type GroupName } from "../data/config";
import {
  getClassDescriptionText,
  getDisplayName,
  getDrugByKey,
} from "../data/drugs";
import { getSubstanceStructure } from "../data/substances";
import type { Locale } from "../i18n/locales";
import { localePath } from "../i18n/locales";
import { buildDoseCharts, type DoseChart } from "./dose-chart";

export function firstDurationValue(
  d: Record<string, unknown> | undefined
): string | undefined {
  if (!d) return undefined;
  const entries = Object.entries(d).filter(
    ([k, v]) => k !== "_unit" && typeof v === "string" && v
  );
  if (!entries.length) return undefined;
  return entries.map(([k, v]) => (k === "value" ? v : `${v} (${k})`)).join(", ");
}

export function truncateText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const slice = normalized.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${trimmed}…`;
}

export type PrintTiming = {
  onset?: { value: string; unit?: string };
  duration?: { value: string; unit?: string };
  afterEffects?: { value: string; unit?: string };
  halfLife?: string;
};

export type PrintCardData = {
  substanceKey: string;
  displayName: string;
  group: GroupName | "unknown";
  categories: string[];
  summary?: string;
  warning?: string;
  avoid?: string;
  testKits?: string;
  doseNote?: string;
  effects: string[];
  timing: PrintTiming;
  primaryChart?: DoseChart;
  cardUrl: string;
  hasStructure: boolean;
};

function timingEntry(
  d: Record<string, unknown> | undefined
): { value: string; unit?: string } | undefined {
  const value = firstDurationValue(d);
  if (!value) return undefined;
  const unit = typeof d?._unit === "string" ? d._unit : undefined;
  return { value, unit };
}

export function getPrintCardData(
  substanceKey: string,
  locale: Locale,
  siteOrigin = "https://psy.cards"
): PrintCardData {
  const column = getColumnByKey(locale, substanceKey);
  const drug = getDrugByKey(substanceKey, locale);
  const classNote = getClassDescriptionText(substanceKey, locale);
  const displayName = drug?.pretty_name ?? getDisplayName(substanceKey, locale);
  const slug = column?.slug ?? substanceKey;
  const cardUrl = new URL(localePath(locale, `/${slug}`), siteOrigin).href;

  const props = drug?.properties ?? {};
  const summary = props.summary ?? classNote;

  const charts = drug?.formatted_dose
    ? buildDoseCharts(drug.formatted_dose)
    : [];
  const primaryChart = charts.find(
    (chart): chart is DoseChart => chart.chartable
  );

  return {
    substanceKey,
    displayName,
    group: column?.group ?? "unknown",
    categories: drug?.categories ?? drug?.properties?.categories ?? [],
    summary: summary ? truncateText(summary, 220) : undefined,
    warning: props.warning ? truncateText(props.warning, 180) : undefined,
    avoid: props.avoid ? truncateText(props.avoid, 160) : undefined,
    testKits: props["test-kits"]
      ? truncateText(props["test-kits"], 140)
      : undefined,
    doseNote: drug?.dose_note ? truncateText(drug.dose_note, 160) : undefined,
    effects: (drug?.formatted_effects ?? []).slice(0, 6),
    timing: {
      onset: timingEntry(
        drug?.formatted_onset as Record<string, unknown> | undefined
      ),
      duration: timingEntry(
        drug?.formatted_duration as Record<string, unknown> | undefined
      ),
      afterEffects: timingEntry(
        drug?.formatted_aftereffects as Record<string, unknown> | undefined
      ),
      halfLife: props["half-life"] as string | undefined,
    },
    primaryChart,
    cardUrl,
    hasStructure: Boolean(getSubstanceStructure(substanceKey)),
  };
}
