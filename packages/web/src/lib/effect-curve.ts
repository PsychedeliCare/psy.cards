/**
 * A simplified "effects over time" model for the card: an intensity curve
 * sampled as rounded bars (come-up → peak → comedown), followed by a
 * compressed tail for after-effects so long tails (MDMA: up to 72 h) don't
 * squash the main experience.
 */

export type Phase = "onset" | "peak" | "comedown" | "after";

export type TimingInput = { value: string; unit: string } | undefined;

export type EffectCurve = {
  bars: { phase: Phase; height: number }[];
  /** Phase spans in % of the chart width. */
  phases: { phase: Phase; start: number; end: number }[];
};

const UNIT_HOURS: Record<string, number> = { seconds: 1 / 3600, minutes: 1 / 60, hours: 1, days: 24 };
const MAIN_BARS = 26;
const AFTER_BARS = 6;

export function rangeHours(input: TimingInput): { min: number; max: number; avg: number } | undefined {
  if (!input) return undefined;
  const numbers = [...input.value.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (!numbers.length) return undefined;
  const scale = UNIT_HOURS[input.unit] ?? 1;
  const min = numbers[0]! * scale;
  const max = (numbers[1] ?? numbers[0]!) * scale;
  return { min, max, avg: (min + max) / 2 };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

export function buildEffectCurve(timing: { onset?: TimingInput; duration?: TimingInput; after?: TimingInput }): EffectCurve | undefined {
  const duration = rangeHours(timing.duration);
  if (!duration) return undefined;
  // TripSit durations count from dosing; keep the come-up within the first 40%.
  const end = duration.avg;
  const onset = Math.min(rangeHours(timing.onset)?.avg ?? 0, end * 0.4);
  const peakEnd = onset + (end - onset) * 0.45;
  const after = rangeHours(timing.after)?.avg ?? 0;

  const intensity = (t: number) => {
    if (t < onset) return 0.12 + 0.88 * smooth(t / onset);
    if (t < peakEnd) return 1 - 0.06 * Math.sin(((t - onset) / (peakEnd - onset)) * Math.PI);
    return 0.2 + 0.8 * (1 - smooth((t - peakEnd) / (end - peakEnd)));
  };

  const afterBars = after > 0 ? AFTER_BARS : 0;
  const total = MAIN_BARS + afterBars;
  const bars: EffectCurve["bars"] = [];
  for (let i = 0; i < MAIN_BARS; i++) {
    const t = ((i + 0.5) / MAIN_BARS) * end;
    bars.push({ phase: t < onset ? "onset" : t < peakEnd ? "peak" : "comedown", height: Math.max(0.1, intensity(t)) });
  }
  for (let i = 0; i < afterBars; i++) {
    bars.push({ phase: "after", height: 0.17 * (1 - ((i + 0.5) / afterBars) * 0.6) });
  }

  const main = (MAIN_BARS / total) * 100;
  const at = (hours: number) => (hours / end) * main;
  const phases: EffectCurve["phases"] = [
    { phase: "onset" as Phase, start: 0, end: at(onset) },
    { phase: "peak" as Phase, start: at(onset), end: at(peakEnd) },
    { phase: "comedown" as Phase, start: at(peakEnd), end: main },
    ...(afterBars ? [{ phase: "after" as Phase, start: main, end: 100 }] : []),
  ].filter((phase) => phase.end - phase.start > 0.5);
  return { bars, phases };
}
