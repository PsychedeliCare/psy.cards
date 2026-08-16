export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  overlay: Partial<T> | undefined
): T {
  if (!overlay) return base;
  const result = { ...base } as T;

  for (const key of Object.keys(overlay) as Array<keyof T>) {
    const baseVal = base[key];
    const overlayVal = overlay[key];

    if (overlayVal === undefined) continue;

    if (
      baseVal &&
      overlayVal &&
      typeof baseVal === "object" &&
      typeof overlayVal === "object" &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overlayVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overlayVal as Record<string, unknown>
      ) as T[keyof T];
    } else {
      result[key] = overlayVal as T[keyof T];
    }
  }

  return result;
}

export function mergeDrugLabels(
  upstream: Record<string, string>,
  augmentation: Record<string, string> | undefined
): Record<string, string> {
  const merged = { ...upstream, ...augmentation };

  for (const [translationKey, matrixKey] of Object.entries({
    dxm: "dextromethorphan",
  })) {
    if (merged[translationKey] && !merged[matrixKey]) {
      merged[matrixKey] = merged[translationKey];
    }
  }

  return merged;
}
