import type { Duration } from "../../drugs/types/tripsit";

type RawDuration = Duration | Record<string, unknown> | undefined;

export type TimingRange = {
  min: number;
  max: number;
  average: number;
};

export type TimingChartData = {
  onset?: TimingRange;
  peak?: TimingRange;
  duration: TimingRange;
};

type ParsedRange = {
  min: number;
  max: number;
};

const UNIT_TO_HOURS: Record<string, number> = {
  second: 1 / 3600,
  seconds: 1 / 3600,
  sec: 1 / 3600,
  secs: 1 / 3600,
  minute: 1 / 60,
  minutes: 1 / 60,
  min: 1 / 60,
  mins: 1 / 60,
  hour: 1,
  hours: 1,
  hr: 1,
  hrs: 1,
  day: 24,
  days: 24,
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundHours(value: number): number {
  return Number(value.toFixed(2));
}

function getUnitMultiplier(unit: unknown): number {
  if (typeof unit !== "string") return 1;
  return UNIT_TO_HOURS[unit.trim().toLowerCase()] ?? 1;
}

function parseRangeValue(value: string, multiplier: number): ParsedRange | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.includes("unknown")) return undefined;

  const matches = Array.from(normalized.matchAll(/\d+(?:\.\d+)?/g)).map((match) =>
    Number(match[0])
  );
  if (!matches.length || matches.some((amount) => !Number.isFinite(amount))) {
    return undefined;
  }

  const min = matches[0] * multiplier;
  const max = (matches[1] ?? matches[0]) * multiplier;
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  };
}

function averageDurationRange(duration: RawDuration): TimingRange | undefined {
  if (!duration) return undefined;

  const multiplier = getUnitMultiplier(duration._unit);
  const ranges = Object.entries(duration)
    .filter(([key, value]) => key !== "_unit" && typeof value === "string")
    .map(([, value]) => parseRangeValue(value as string, multiplier))
    .filter((range): range is ParsedRange => Boolean(range));

  if (!ranges.length) return undefined;

  const min = mean(ranges.map((range) => range.min));
  const max = mean(ranges.map((range) => range.max));
  return {
    min: roundHours(min),
    max: roundHours(max),
    average: roundHours((min + max) / 2),
  };
}

function averageInlineRange(value: unknown): TimingRange | undefined {
  if (typeof value !== "string") return undefined;

  const range = parseRangeValue(value, 1);
  if (!range) return undefined;

  return {
    min: roundHours(range.min),
    max: roundHours(range.max),
    average: roundHours((range.min + range.max) / 2),
  };
}

export function buildTimingChartData({
  onset,
  peak,
  duration,
}: {
  onset?: RawDuration;
  peak?: RawDuration | string;
  duration?: RawDuration;
}): TimingChartData | undefined {
  const durationRange = averageDurationRange(duration);
  if (!durationRange) return undefined;

  const chartData: TimingChartData = {
    duration: durationRange,
  };

  const onsetRange = averageDurationRange(onset);
  if (onsetRange) {
    chartData.onset = onsetRange;
  }

  const peakRange =
    typeof peak === "string" ? averageInlineRange(peak) : averageDurationRange(peak);
  if (peakRange) {
    chartData.peak = peakRange;
  }

  return chartData;
}
