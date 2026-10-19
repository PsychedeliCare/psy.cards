export type LabelBox = {
  /** Preferred centre, in % of the axis. */
  pos: number;
  /** Estimated width, in % of the axis. */
  width: number;
  /** Labels with the lowest priority are dropped first when they cannot all fit. */
  priority?: number;
};

export type PlacedLabel = { index: number; x: number };

/**
 * Places labels along a 0–100% axis without overlaps, keeping each one as
 * close as possible to its anchor. Cards scale uniformly in `em`, so a layout
 * computed once at build time holds at every card size.
 */
export function spreadLabels(items: LabelBox[], gap = 1.5, iterations = 60): PlacedLabel[] {
  let kept = items.map((item, index) => ({ ...item, index })).sort((a, b) => a.pos - b.pos);
  const total = () => kept.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, kept.length - 1);
  while (kept.length > 1 && total() > 100) {
    const drop = kept.reduce((low, item) => ((item.priority ?? 0) < (low.priority ?? 0) ? item : low), kept[0]!);
    kept = kept.filter((item) => item !== drop);
  }

  const clamp = (x: number, width: number) => Math.min(100 - width / 2, Math.max(width / 2, x));
  const xs = kept.map((item) => clamp(item.pos, item.width));
  for (let pass = 0; pass < iterations; pass++) {
    let moved = false;
    for (let i = 1; i < kept.length; i++) {
      const min = xs[i - 1]! + (kept[i - 1]!.width + kept[i]!.width) / 2 + gap;
      const overlap = min - xs[i]!;
      if (overlap > 0.01) {
        xs[i - 1]! -= overlap / 2;
        xs[i]! += overlap / 2;
        moved = true;
      }
    }
    kept.forEach((item, i) => { xs[i] = clamp(xs[i]!, item.width); });
    if (!moved) break;
  }
  return kept.map((item, i) => ({ index: item.index, x: xs[i]! }));
}

/** Rough text width in em for Satoshi at a given font size (in em). */
export function estimateTextEm(text: string, fontEm: number): number {
  let units = 0;
  for (const char of text) units += /[0-9.]/.test(char) ? 0.56 : /[mwMW]/.test(char) ? 0.82 : /[il1]/.test(char) ? 0.3 : 0.54;
  return units * fontEm;
}
