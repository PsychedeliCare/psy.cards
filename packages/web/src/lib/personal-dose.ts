/** Pure dose maths behind the "For you" tile (kept separate for testing). */

/** Upper limit from a mg/kg guideline, e.g. MDMA 1.5 mg/kg (men) / 1.3 mg/kg (women). */
export function upperLimitMg(weightKg: number, mgPerKg: number): number {
  return Math.round(weightKg * mgPerKg);
}

/** Converts a mg/kg amount to mg, rounded to a sensible precision. */
export function perKgToMg(mgPerKg: number, weightKg: number): number {
  const mg = mgPerKg * weightKg;
  return mg >= 100 ? Math.round(mg / 5) * 5 : Math.round(mg);
}

/** Widmark: peak blood alcohol (‰, g/kg) added by one unit of `grams` of ethanol. */
export function bacPerUnit(gramsPerUnit: number, weightKg: number, r: number): number {
  return gramsPerUnit / (weightKg * r);
}

/** Units needed to reach a blood alcohol limit, rounded down to half units. */
export function unitsToLimit(limitPermille: number, perUnit: number): number {
  return Math.max(0.5, Math.floor((limitPermille / perUnit) * 2) / 2);
}

/** EFSA: single caffeine doses up to ~3 mg/kg (200 mg for a 70 kg adult) raise no concerns. */
export function caffeineSingleDoseMg(weightKg: number, mgPerKg: number, maxMg: number): number {
  return Math.min(maxMg, Math.round(weightKg * mgPerKg));
}

/** How much lighter than the reference body the visitor is, in % (0 when heavier). */
export function lighterThanPct(referenceKg: number, weightKg: number): number {
  return Math.max(0, Math.round(((referenceKg - weightKg) / referenceKg) * 100));
}
