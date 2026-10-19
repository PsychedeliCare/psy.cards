/**
 * Everything a two-sided substance card needs, resolved at build time:
 * TripSit dosing/timing for the most common route, authored harm reduction
 * content (localized, falling back to English per field) and the sourced
 * ratings (acute toxicity margin, dependence, spacing).
 */
import hrData from "../../../../packages/shared/data/harm-reduction.json";
import type { Duration } from "../../../../drugs/types/tripsit";
import { buildDoseCharts, type DoseRouteChart } from "../lib/dose-chart";
import type { Locale } from "../i18n/locales";
import { localePath } from "../i18n/locales";
import { getColumnByKey, getColumns, sortPair, type GroupName } from "./config";
import { getInteraction } from "./combos";
import type { IconName, StatusKey } from "./definitions";
import { getDrugByKey } from "./drugs";
import { pairSlug } from "./slug";

const contentModules = import.meta.glob<Record<string, SubstanceContent>>(
  "../../../../packages/shared/i18n/content/*/harm-reduction.json",
  { eager: true, import: "default" }
);

export type RiskItem = { icon: string; title: string; text: string };
export type EffectItem = { icon: string; label: string };

export type SubstanceContent = {
  dose?: string;
  prepare?: string;
  marginNote?: string;
  spacing?: { value: string; label: string; text: string };
  dependence?: string;
  risks?: RiskItem[];
  effects?: EffectItem[];
  overdose?: { signs: string[]; actions: string[] };
};

export type SourceId = keyof typeof hrData.sources;
export type Source = { author: string; title: string; publication?: string; url?: string };

export type Margin = {
  ratio: number;
  source: SourceId;
  extrapolated?: boolean;
  atLeast?: boolean;
  compound?: string;
};

export type Personal =
  | { kind: "mgPerKg"; male: number; female: number; source: SourceId }
  | { kind: "perKgChart" }
  | { kind: "referenceWeight"; weightKg: number }
  | { kind: "caffeine"; singleMgPerKg: number; singleMaxMg: number; dailyMg: number; source: SourceId }
  | { kind: "bac"; gramsPerUnit: number; rMale: number; rFemale: number; limitPermille: number; source: SourceId };

type SubstanceData = {
  doseFrom?: string | null;
  primaryRoute: string | null;
  margin: Margin | null;
  marginDanger?: boolean;
  dependence: { level: number; nutt?: number; nuttDrug?: string; editorial?: boolean };
  spacing: { pattern?: string; unit?: "week" | "month" };
  personal?: Personal;
};

export type GableRow = {
  name: string;
  key?: string;
  route: string;
  ratio: number;
  extrapolated?: boolean;
  atLeast?: boolean;
};

export type TimingValue = { value: string; unit: string };

export type AvoidCombo = {
  key: string;
  label: string;
  href: string;
  slug: string;
  statusKey: StatusKey;
  statusLabel: string;
  icon: IconName;
};

export type CardData = {
  key: string;
  group: GroupName | "unknown";
  content: SubstanceContent;
  primary?: DoseRouteChart;
  otherRoutes: DoseRouteChart[];
  /** Name of the compound whose dosing stands in for a drug class. */
  referenceName?: string;
  doseNote?: string;
  timing: { onset?: TimingValue; duration?: TimingValue; after?: TimingValue };
  margin: Margin | null;
  marginDanger: boolean;
  dependence: SubstanceData["dependence"];
  spacing: SubstanceData["spacing"];
  personal?: Personal;
  avoid: AvoidCombo[];
  /** Pairs rated "caution": listed compactly under the ones to avoid. */
  caution: AvoidCombo[];
  gable: GableRow[];
  sources: Array<Source & { id: string }>;
};

const substances = hrData.substances as Record<string, SubstanceData>;
const AVOID_STATUSES: StatusKey[] = ["dangerous", "serotoninsyndrome", "unsafe"];

function contentFor(locale: Locale): Record<string, SubstanceContent> {
  // Vite shortens glob keys to relative paths; match on the stable suffix.
  const suffix = `/i18n/content/${locale}/harm-reduction.json`;
  const match = Object.entries(contentModules).find(([path]) => path.endsWith(suffix));
  return match?.[1] ?? {};
}

/** Locale text wins field by field; anything untranslated falls back to English. */
function mergeContent(base: SubstanceContent = {}, overlay: SubstanceContent = {}): SubstanceContent {
  return {
    ...base,
    ...overlay,
    spacing: overlay.spacing ? { ...base.spacing!, ...overlay.spacing } : base.spacing,
    overdose: overlay.overdose ? { ...base.overdose!, ...overlay.overdose } : base.overdose,
    risks: base.risks?.map((risk, index) => ({ ...risk, ...overlay.risks?.[index], icon: risk.icon })),
    effects: base.effects?.map((effect, index) => ({ ...effect, ...overlay.effects?.[index], icon: effect.icon })),
  };
}

function routeKey(route: string): string {
  return route.toLowerCase().replace(/[^a-z]/g, "");
}

function pickTiming(duration: Duration | undefined, route: string | null): TimingValue | undefined {
  if (!duration) return undefined;
  const entries = Object.entries(duration).filter(
    (entry): entry is [string, string] => entry[0] !== "_unit" && typeof entry[1] === "string" && Boolean(entry[1])
  );
  if (!entries.length) return undefined;
  const wanted = route ? routeKey(route) : "";
  const match =
    entries.find(([key]) => routeKey(key) === wanted) ??
    entries.find(([key]) => key === "value") ??
    entries[0]!;
  return { value: match[1].replace(/-/g, "–"), unit: duration._unit };
}

export function getHarmReductionSource(id: string): Source | undefined {
  return (hrData.sources as Record<string, Source>)[id];
}

export function getCardData(key: string, locale: Locale): CardData {
  const data = substances[key];
  if (!data) throw new Error(`Missing harm reduction data for "${key}"`);
  const content = mergeContent(contentFor("en")[key], locale === "en" ? undefined : contentFor(locale)[key]);

  const ownDrug = getDrugByKey(key, locale);
  const doseDrug = data.doseFrom === undefined ? ownDrug : data.doseFrom ? getDrugByKey(data.doseFrom, locale) : undefined;
  const charts = doseDrug?.formatted_dose ? buildDoseCharts(doseDrug.formatted_dose) : [];
  const wanted = data.primaryRoute ? routeKey(data.primaryRoute) : "";
  const primary =
    charts.find((chart) => routeKey(chart.route) === wanted) ??
    charts.find((chart) => chart.chartable) ??
    charts[0];
  const timingDrug = ownDrug?.formatted_duration ? ownDrug : doseDrug;
  const timingRoute = primary?.route ?? data.primaryRoute;

  const column = getColumnByKey(locale, key);
  const comboRoute = localePath(locale, "/combos");
  const combos = getColumns(locale)
    .filter((other) => other.key !== key)
    .flatMap((other): AvoidCombo[] => {
      const { definition } = getInteraction(key, other.key, locale);
      if (![...AVOID_STATUSES, "caution"].includes(definition.statusKey)) return [];
      const [a, b] = sortPair(locale, key, other.key);
      const slug = pairSlug(a, b);
      return [{
        key: other.key,
        label: other.label,
        slug,
        href: `${comboRoute}?combo=${slug}`,
        statusKey: definition.statusKey,
        statusLabel: definition.label,
        icon: definition.icon,
      }];
    })
    .sort((a, b) => AVOID_STATUSES.indexOf(a.statusKey) - AVOID_STATUSES.indexOf(b.statusKey));
  const avoid = combos.filter((combo) => combo.statusKey !== "caution");
  const caution = combos.filter((combo) => combo.statusKey === "caution");

  const sourceIds = new Set<string>(["tripsit"]);
  if (data.margin || data.marginDanger) sourceIds.add("gable2004");
  if (data.dependence.nutt !== undefined) sourceIds.add("nutt2007");
  if (data.personal && "source" in data.personal) sourceIds.add(data.personal.source);
  if (key === "alcohol") sourceIds.add("ukcmo2016");
  if (key === "caffeine") sourceIds.add("efsa2015");

  return {
    key,
    group: column?.group ?? "unknown",
    content,
    primary,
    otherRoutes: charts.filter((chart) => chart !== primary),
    referenceName: data.doseFrom && doseDrug ? doseDrug.pretty_name : undefined,
    doseNote: doseDrug?.dose_note?.replace(/^\s*note:\s*/i, "").trim() || undefined,
    timing: {
      onset: pickTiming(timingDrug?.formatted_onset, timingRoute),
      duration: pickTiming(timingDrug?.formatted_duration, timingRoute),
      after: pickTiming(timingDrug?.formatted_aftereffects, timingRoute),
    },
    margin: data.margin,
    marginDanger: Boolean(data.marginDanger),
    dependence: data.dependence,
    spacing: data.spacing,
    personal: data.personal,
    avoid,
    caution,
    gable: hrData.gable2004 as GableRow[],
    sources: [...sourceIds].flatMap((id) => {
      const source = getHarmReductionSource(id);
      return source ? [{ id, ...source }] : [];
    }),
  };
}
