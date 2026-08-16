/**
 * Pure geometry for the substance "thumb jog dial" navigator.
 *
 * Angle convention throughout: degrees, 0° = north (12 o'clock),
 * increasing clockwise — matching both the design spec and d3-shape's
 * arc() radian convention.
 *
 * Given (categories, rotation) this module derives wedge paths, label
 * transforms and the active substance. It has no DOM dependencies and is
 * shared between the server-rendered SVG and the client interaction script.
 */

import { arc } from "d3-shape";
import type { GroupName } from "../data/config";

export const DIAL = {
  /** Opaque centre, page background. */
  hubRadius: 27,
  categoryInner: 27,
  categoryOuter: 62,
  substanceInner: 62,
  substanceOuter: 98,
  rimRadius: 98,
  /** Radial substance labels start here and must not bleed past r = 98. */
  substanceLabelRadius: 66,
  /** Category labels run along an arc at this radius. */
  categoryLabelRadius: 44.5,
  /** Degrees trimmed from each side of a category label arc. */
  categoryLabelInset: 2,
  labelBaseSize: 3.9,
  labelMinSize: 2.4,
  /** Approximate average glyph width as a fraction of font size. */
  labelWidthFactor: 0.54,
  /** Available radial run for a substance label (66 → ~96). */
  labelMaxWidth: 30,
  categoryLabelBaseSize: 4.6,
  categoryLabelMinSize: 2.6,
  categoryLabelLetterSpacing: 0.45,
} as const;

export const DESKTOP_DETENT = 90;
export const MOBILE_DETENT = 270;

export type DialSubstanceInput = {
  key: string;
  slug: string;
  label: string;
  group: GroupName;
};

export type DialCategoryInput = {
  group: GroupName;
  label: string;
  substances: DialSubstanceInput[];
};

export type DialSubstanceLayout = DialSubstanceInput & {
  startAngle: number;
  endAngle: number;
  midAngle: number;
  /** Wedge path (substance ring band). */
  path: string;
  fontSize: number;
};

export type DialCategoryLayout = {
  group: GroupName;
  label: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  /** Wedge path (category ring band). */
  path: string;
  /** Label arc drawn start → end (text upright while wedge points up). */
  labelArcForward: string;
  /** Label arc drawn end → start (used while the wedge points down). */
  labelArcReverse: string;
  labelFontSize: number;
  substances: DialSubstanceLayout[];
};

export type DialLayout = {
  categories: DialCategoryLayout[];
  substances: DialSubstanceLayout[];
};

const DEG = Math.PI / 180;

/** Normalise an angle to [0, 360). */
export function normalizeAngle(deg: number): number {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}

/** Shortest circular distance between two angles, 0–180. */
export function circularDistance(a: number, b: number): number {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return d > 180 ? 360 - d : d;
}

function point(radius: number, angleDeg: number): [number, number] {
  return [radius * Math.sin(angleDeg * DEG), -radius * Math.cos(angleDeg * DEG)];
}

function ringWedgePath(
  innerRadius: number,
  outerRadius: number,
  startDeg: number,
  endDeg: number
): string {
  return (
    arc()({
      innerRadius,
      outerRadius,
      startAngle: startDeg * DEG,
      endAngle: endDeg * DEG,
    }) ?? ""
  );
}

/**
 * Open arc used as a <textPath> rail. When `reversed`, the arc is drawn from
 * end to start (counter-clockwise sweep) so text on the lower half of the
 * dial stays upright.
 */
export function arcTextPath(
  radius: number,
  startDeg: number,
  endDeg: number,
  reversed: boolean
): string {
  const [fromDeg, toDeg] = reversed ? [endDeg, startDeg] : [startDeg, endDeg];
  const [x1, y1] = point(radius, fromDeg);
  const [x2, y2] = point(radius, toDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = reversed ? 0 : 1;
  const f = (n: number) => n.toFixed(3);
  return `M ${f(x1)} ${f(y1)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${f(x2)} ${f(y2)}`;
}

/** Auto-fit a radial substance label so it never bleeds past the rim. */
export function fitLabelSize(
  label: string,
  base: number = DIAL.labelBaseSize
): number {
  const width = label.length * base * DIAL.labelWidthFactor;
  if (width <= DIAL.labelMaxWidth) return base;
  return Math.max(DIAL.labelMinSize, base * (DIAL.labelMaxWidth / width));
}

/** Auto-fit an uppercase category label to its arc length. */
export function fitCategoryLabelSize(label: string, arcLengthUnits: number): number {
  const budget = arcLengthUnits - 2;
  const tracking = Math.max(0, label.length - 1) * DIAL.categoryLabelLetterSpacing;
  const base = DIAL.categoryLabelBaseSize;
  const width = label.length * base * 0.58 + tracking;
  if (width <= budget) return base;
  const size = (budget - tracking) / (label.length * 0.58);
  return Math.max(DIAL.categoryLabelMinSize, Math.min(base, size));
}

export function buildDialLayout(categories: DialCategoryInput[]): DialLayout {
  const step = 360 / categories.length;

  const categoryLayouts: DialCategoryLayout[] = categories.map((cat, i) => {
    const startAngle = -step / 2 + i * step;
    const endAngle = startAngle + step;
    const midAngle = i * step;

    const inset = DIAL.categoryLabelInset;
    const labelStart = startAngle + inset;
    const labelEnd = endAngle - inset;
    const arcLength =
      DIAL.categoryLabelRadius * (labelEnd - labelStart) * DEG;

    const n = cat.substances.length;
    const substanceStep = step / Math.max(1, n);
    const substances: DialSubstanceLayout[] = cat.substances.map((sub, j) => {
      const subStart = startAngle + j * substanceStep;
      const subEnd = subStart + substanceStep;
      return {
        ...sub,
        startAngle: subStart,
        endAngle: subEnd,
        midAngle: (subStart + subEnd) / 2,
        path: ringWedgePath(DIAL.substanceInner, DIAL.substanceOuter, subStart, subEnd),
        fontSize: fitLabelSize(sub.label),
      };
    });

    return {
      group: cat.group,
      label: cat.label,
      startAngle,
      endAngle,
      midAngle,
      path: ringWedgePath(DIAL.categoryInner, DIAL.categoryOuter, startAngle, endAngle),
      labelArcForward: arcTextPath(DIAL.categoryLabelRadius, labelStart, labelEnd, false),
      labelArcReverse: arcTextPath(DIAL.categoryLabelRadius, labelStart, labelEnd, true),
      labelFontSize: fitCategoryLabelSize(cat.label, arcLength),
      substances,
    };
  });

  return {
    categories: categoryLayouts,
    substances: categoryLayouts.flatMap((c) => c.substances),
  };
}

export type SubstanceLabelOrientation = {
  flipped: boolean;
  transform: string;
  anchor: "start" | "end";
};

/**
 * Radial substance label placement. When the label's absolute angle
 * (mid-angle + rotation) is on the left half of the dial (> 180°), the text
 * is rotated 180° in place and end-anchored so it never renders mirrored or
 * upside down.
 */
export function substanceLabelOrientation(
  midAngle: number,
  rotation: number
): SubstanceLabelOrientation {
  const absolute = normalizeAngle(midAngle + rotation);
  const flipped = absolute > 180;
  const r = DIAL.substanceLabelRadius;
  const base = `rotate(${midAngle - 90}) translate(${r}, 0)`;
  return {
    flipped,
    transform: flipped ? `${base} rotate(180)` : base,
    anchor: flipped ? "end" : "start",
  };
}

/**
 * Whether a category's textPath arc must be drawn in reverse (the wedge's
 * absolute mid-angle falls in the lower half of the dial).
 */
export function categoryLabelReversed(midAngle: number, rotation: number): boolean {
  const absolute = normalizeAngle(midAngle + rotation);
  return absolute > 90 && absolute < 270;
}

/**
 * The active substance is derived, never stored: the angle currently sitting
 * under the detent is `detent − rotation`; pick the substance whose mid-angle
 * is nearest.
 */
export function activeSubstanceIndex(
  midAngles: readonly number[],
  rotation: number,
  detent: number
): number {
  const target = normalizeAngle(detent - rotation);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < midAngles.length; i++) {
    const dist = circularDistance(midAngles[i]!, target);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Rotation that puts `midAngle` under the detent, choosing the equivalent
 * target within ±180° of `currentRotation` so the dial never unwinds a
 * full turn.
 */
export function rotationForSubstance(
  midAngle: number,
  detent: number,
  currentRotation: number
): number {
  const base = detent - midAngle;
  const k = Math.round((currentRotation - base) / 360);
  return base + k * 360;
}

/** Ease-out cubic used by the snap tween. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
