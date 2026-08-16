/** Map upstream TripSit translation keys to combo matrix keys. */
export const translationKeyToMatrixKey: Record<string, string> = {
  dxm: "dextromethorphan",
};

/** Map matrix keys to upstream translation keys when they differ. */
export const matrixKeyToTranslationKey: Record<string, string> = Object.fromEntries(
  Object.entries(translationKeyToMatrixKey).map(([translationKey, matrixKey]) => [
    matrixKey,
    translationKey,
  ])
);

export function resolveMatrixKey(translationKey: string): string {
  return translationKeyToMatrixKey[translationKey] ?? translationKey;
}

export function resolveTranslationKey(matrixKey: string): string {
  return matrixKeyToTranslationKey[matrixKey] ?? matrixKey;
}
