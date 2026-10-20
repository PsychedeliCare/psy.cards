/**
 * Choreography for the /logo animation: the deck swings in, blooms into the
 * seven-card fan like a lotus opening, the molecules trace in and the light
 * sweeps across before the wordmark fades in.
 */

import type { CardPose } from "./card-geometry";

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const progress = (t: number, start: number, duration: number) => clamp((t - start) / duration);
export const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
export const easeOutQuart = (p: number) => 1 - (1 - p) ** 4;
export const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
export const easeInOutSine = (p: number) => -(Math.cos(Math.PI * p) - 1) / 2;

/** Under-damped spring settling on 1: a soft overshoot, like a petal flexing open. */
export const spring = (p: number, damping = 5.6, frequency = 6.8) =>
  p >= 1 ? 1 : 1 - Math.exp(-damping * p) * Math.cos(frequency * p) * (1 - p) ** 0.2;

/** Key times (seconds). */
export const T = {
  backdrop: [0, 1.4],
  deck: [0.15, 2.0],
  bloom: 1.9,
  bloomDuration: 3.2,
  bloomStagger: 0.16,
  molecules: 2.9,
  moleculeDuration: 1.6,
  moleculeStagger: 0.15,
  sweep: [3.3, 1.7],
  wordmark: 4.7,
  settled: 6.6,
} as const;

/** Fan pose per tier (0 = centre card, 3 = outermost); mirrored for the right side. */
export type Tier = CardPose;

/**
 * Fitted to the flat logo's per-card colour regions (perspective camera at
 * the page's framing distance): the back cards shrink, their bases tuck in
 * behind the centre card and the in-plane arc bends their tips upward, so
 * the fan's lower edge curves up instead of spilling out sideways.
 * `x` is the outward offset of the pivot, mirrored per side.
 */
export const FAN: Tier[] = [
  { roll: 0, tilt: 0, twist: 0, curl: 0.02, curlBase: 0, arc: 0, cup: 0.035, z: 0, pivot: 0.42, x: 0, y: 0.42, scale: 1 },
  { roll: 0.66, tilt: 0.04, twist: 0.05, curl: 0.08, curlBase: 0.6, arc: 0.155, cup: 0.045, z: -0.07, pivot: 0.09, x: 0.025, y: 0.39, scale: 0.89 },
  { roll: 1.15, tilt: 0.03, twist: 0.03, curl: 0.12, curlBase: 0.6, arc: 0.25, cup: 0.055, z: -0.19, pivot: 0.12, x: 0.135, y: 0.38, scale: 0.92 },
  { roll: 1.5, tilt: 0.02, twist: 0, curl: 0.16, curlBase: 0.6, arc: 0.3, cup: 0.065, z: -0.31, pivot: 0.056, x: 0.4, y: 0.27, scale: 0.79 },
];

export const STACK_LAYERS = 7;

/** Deck layer front → back: centre (0), then each tier's left and right card. */
export function stackLayer(index: number): number {
  const tier = Math.abs(index);
  return tier === 0 ? 0 : tier * 2 - (index < 0 ? 1 : 0);
}

const stackDepth = (index: number) => -stackLayer(index) * 0.018;

/** Pose of card `index` (−3…3) at time `t`. */
export function cardPose(index: number, t: number, fan: Tier[] = FAN): CardPose {
  const tier = Math.abs(index);
  const side = index < 0 ? 1 : -1;
  const target = fan[tier]!;
  const start = T.bloom + tier * T.bloomStagger;
  const p = progress(t, start, T.bloomDuration);
  const open = tier === 0 ? 1 : spring(p);
  // Petals flex back a little while they travel, then settle.
  const flex = Math.sin(Math.PI * clamp(p * 1.25)) * (tier / 3);
  const centre = fan[0]!;

  return {
    x: lerp(centre.x, target.x * -side, open),
    y: lerp(centre.y, target.y, open),
    z: lerp(stackDepth(index), target.z, easeInOutCubic(p)),
    pivot: lerp(centre.pivot, target.pivot, open),
    roll: side * target.roll * open,
    tilt: target.tilt * open + flex * 0.12,
    twist: side * target.twist * open,
    curl: lerp(centre.curl, target.curl, open) + flex * 0.14,
    curlBase: lerp(centre.curlBase, target.curlBase, open),
    arc: side * target.arc * open,
    cup: lerp(centre.cup, target.cup, open) + flex * 0.03,
    scale: lerp(centre.scale, target.scale, open),
  };
}
