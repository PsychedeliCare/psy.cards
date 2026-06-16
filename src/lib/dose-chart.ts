import type { Dose, Dosage } from "../../drugs/types/tripsit";

export type DoseLevel =
  | "threshold"
  | "light"
  | "common"
  | "strong"
  | "heavy"
  | "dangerous"
  | "fatal";

const LEVEL_ORDER: DoseLevel[] = [
  "threshold",
  "light",
  "common",
  "strong",
  "heavy",
  "dangerous",
  "fatal",
];

const LEVEL_COLORS: Record<DoseLevel, string> = {
  threshold: "#38bdf8",
  light: "#4ade80",
  common: "#facc15",
  strong: "#fb923c",
  heavy: "#f87171",
  dangerous: "#dc2626",
  fatal: "#7f1d1d",
};

const CHARTABLE_UNITS = new Set(["µg", "mg", "g", "ml", "units", "seeds"]);

const ROUTE_ICONS: Record<string, string> = {
  oral: "pill",
  insufflated: "wind",
  rectal: "medical-cross",
  vapourized: "cloud",
  vaporized: "cloud",
  intravenous: "needle",
  intramuscular: "vaccine",
  smoked: "smoking",
  sublingual: "mood-tongue",
  buccal: "mood-tongue",
  transdermal: "bandage",
  hbwr: "grain",
  morning_glory: "plant",
  dried: "plant-2",
  fresh: "plant-2",
  dry: "plant-2",
  wet: "droplet",
};

function routeKey(route: string): string {
  return route.toLowerCase().split("(")[0].trim();
}

export function getRouteIcon(route: string): string {
  return ROUTE_ICONS[routeKey(route)] ?? "circle-dot";
}

export function getRouteLabel(route: string): string {
  return route.replace(/_/g, " ");
}

type ParsedAmount = {
  min: number;
  max: number | null;
  openEnd: boolean;
  unit: string;
  raw: string;
};

export type DoseSegment = {
  level: DoseLevel;
  label: string;
  amount: string;
  color: string;
  left: number;
  width: number;
  center: number;
  start: number;
  end: number;
  openEnd: boolean;
  isPoint: boolean;
  showStart: boolean;
  showEnd: boolean;
};

export type DoseChart = {
  route: string;
  chartable: true;
  unit: string;
  scaleMin: number;
  scaleMax: number;
  segments: DoseSegment[];
};

export type DoseFallback = {
  route: string;
  chartable: false;
  rows: { level: string; amount: string }[];
};

export type DoseRouteChart = DoseChart | DoseFallback;

function normalizeUnit(unit: string): string {
  if (unit === "ug" || unit === "mcg") return "µg";
  return unit;
}

export function parseDoseAmount(raw: string): ParsedAmount | null {
  const compact = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!compact || compact === "unknown") return null;

  const rangeMatch = compact.match(/^([\d.]+)-([\d.]+)([a-z][a-z0-9/]*)\+?$/);
  if (rangeMatch) {
    return {
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
      openEnd: compact.endsWith("+"),
      unit: normalizeUnit(rangeMatch[3]),
      raw,
    };
  }

  const plusMatch = compact.match(/^([\d.]+)([a-z][a-z0-9/]*)\+$/);
  if (plusMatch) {
    return {
      min: parseFloat(plusMatch[1]),
      max: null,
      openEnd: true,
      unit: normalizeUnit(plusMatch[2]),
      raw,
    };
  }

  const singleMatch = compact.match(/^([\d.]+)([a-z][a-z0-9/]*)$/);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]);
    return {
      min: value,
      max: value,
      openEnd: false,
      unit: normalizeUnit(singleMatch[2]),
      raw,
    };
  }

  return null;
}

function niceScaleMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  if (normalized <= 1.2) return 1.2 * magnitude;
  if (normalized <= 1.5) return 1.5 * magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 2.5) return 2.5 * magnitude;
  if (normalized <= 3) return 3 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  if (normalized <= 7.5) return 7.5 * magnitude;
  return 10 * magnitude;
}

function formatTick(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function formatDoseTick(value: number): string {
  return formatTick(value);
}

function toPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

function normalizeDosage(
  dosage: Dosage
): Partial<Record<DoseLevel, string>> {
  const normalized: Partial<Record<DoseLevel, string>> = {};

  for (const [key, value] of Object.entries(dosage)) {
    if (typeof value !== "string" || !value) continue;
    const level = key.toLowerCase() as DoseLevel;
    if (LEVEL_ORDER.includes(level)) normalized[level] = value;
  }

  return normalized;
}

function fallbackRows(dosage: Dosage): { level: string; amount: string }[] {
  return Object.entries(dosage)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([level, amount]) => ({ level, amount }));
}

function buildRouteChart(route: string, dosage: Dosage): DoseRouteChart {
  const levels = normalizeDosage(dosage);
  const rows: { level: DoseLevel; amount: string; parsed: ParsedAmount }[] = [];

  for (const level of LEVEL_ORDER) {
    const amount = levels[level];
    if (!amount) continue;
    const parsed = parseDoseAmount(amount);
    if (!parsed) {
      return {
        route,
        chartable: false,
        rows: fallbackRows(dosage),
      };
    }
    rows.push({ level, amount, parsed });
  }

  if (!rows.length) {
    return { route, chartable: false, rows: fallbackRows(dosage) };
  }

  const units = new Set(rows.map((r) => r.parsed.unit));
  if (units.size !== 1 || !CHARTABLE_UNITS.has([...units][0])) {
    return {
      route,
      chartable: false,
      rows: rows.map((r) => ({ level: r.level, amount: r.amount })),
    };
  }

  const unit = [...units][0];
  const boundaryValues = new Set<number>();

  for (const row of rows) {
    boundaryValues.add(row.parsed.min);
    if (row.parsed.max !== null) boundaryValues.add(row.parsed.max);
  }

  const sortedBoundaries = [...boundaryValues].sort((a, b) => a - b);

  let scaleMax = sortedBoundaries[sortedBoundaries.length - 1];
  for (const row of rows) {
    if (row.parsed.openEnd) {
      scaleMax = Math.max(scaleMax, niceScaleMax(row.parsed.min * 1.2));
    }
  }
  scaleMax = niceScaleMax(scaleMax);

  const scaleMin = 0;

  const segments: DoseSegment[] = rows.map((row, index) => {
    const start = row.parsed.min;
    const endValue = row.parsed.openEnd
      ? scaleMax
      : (row.parsed.max ?? row.parsed.min);
    const left = toPercent(row.parsed.min, scaleMin, scaleMax);
    const right = toPercent(endValue, scaleMin, scaleMax);
    const isPoint = start === endValue;
    const width = isPoint ? 0 : Math.max(right - left, 0.5);
    const prevRow = index > 0 ? rows[index - 1] : undefined;
    const prevEnd = prevRow
      ? prevRow.parsed.openEnd
        ? scaleMax
        : (prevRow.parsed.max ?? prevRow.parsed.min)
      : undefined;

    return {
      level: row.level,
      label: row.level,
      amount: row.amount,
      color: LEVEL_COLORS[row.level],
      left,
      width,
      center: left + width / 2,
      start,
      end: endValue,
      openEnd: row.parsed.openEnd,
      isPoint,
      showStart: prevEnd === undefined || start !== prevEnd,
      showEnd: !isPoint,
    };
  });

  return {
    route,
    chartable: true,
    unit,
    scaleMin,
    scaleMax,
    segments,
  };
}

export function buildDoseCharts(formattedDose: Dose): DoseRouteChart[] {
  return Object.entries(formattedDose)
    .filter((entry): entry is [string, Dosage] => Boolean(entry[1]))
    .map(([route, dosage]) => buildRouteChart(route, dosage));
}
