/**
 * Bendable playing card for the /logo scene.
 *
 * The face is a structured grid clipped to a rounded rectangle (each row
 * spans the rect's width at that height, corner rows sample the arc evenly),
 * so it can be curled and cupped on the CPU without the fan triangulation
 * a ShapeGeometry would give. The rim is a rounded strip around the grid's
 * boundary, which gives the card real thickness when seen edge-on.
 */

import { BufferAttribute, BufferGeometry } from "three";

export const CARD_W = 1;
export const CARD_H = 1.75;
export const CARD_R = 0.075;
export const CARD_T = 0.012;

const COLUMNS = 20;
const CORNER_ROWS = 10;
const MIDDLE_ROWS = 56;
const RIM_RINGS = 5;

/** Card placement: local card space → fan space. Angles in radians. */
export type CardPose = {
  /** World position of the pivot. */
  x: number;
  y: number;
  z: number;
  /** Pivot height in card space (0 = bottom edge). */
  pivot: number;
  /** Fan rotation around the view axis (positive = counter-clockwise). */
  roll: number;
  /** Lean back around the card's horizontal axis (positive = top recedes). */
  tilt: number;
  /** Turn around the card's long axis. */
  twist: number;
  /** Lengthwise curvature above the pivot (positive curls away from the viewer). */
  curl: number;
  /** Lengthwise curvature below the pivot. */
  curlBase: number;
  /**
   * In-plane bend along the length (positive curves toward +x going up), so
   * a petal can leave the base flat and rise toward its tip like the logo's
   * outer cards.
   */
  arc: number;
  /** Cross curvature: edges come forward by cup·x². */
  cup: number;
  scale: number;
};

function buildRows(): number[] {
  const rows: number[] = [];
  for (let i = 0; i < CORNER_ROWS; i++) {
    rows.push(CARD_R - CARD_R * Math.cos((i / CORNER_ROWS) * (Math.PI / 2)));
  }
  for (let i = 0; i < MIDDLE_ROWS; i++) {
    rows.push(CARD_R + ((CARD_H - 2 * CARD_R) * i) / MIDDLE_ROWS);
  }
  for (let i = 0; i <= CORNER_ROWS; i++) {
    rows.push(CARD_H - CARD_R + CARD_R * Math.sin((i / CORNER_ROWS) * (Math.PI / 2)));
  }
  return rows;
}

function halfWidthAt(y: number): number {
  const d = Math.max(0, CARD_R - y, y - (CARD_H - CARD_R));
  return CARD_W / 2 - CARD_R + Math.sqrt(Math.max(0, CARD_R * CARD_R - d * d));
}

type Grid = { rest: Float32Array; uv: Float32Array; rows: number };

function buildGrid(z: number, mirrorU: boolean): Grid {
  const rowsY = buildRows();
  const count = rowsY.length * (COLUMNS + 1);
  const rest = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  rowsY.forEach((y, i) => {
    const half = halfWidthAt(y);
    for (let j = 0; j <= COLUMNS; j++) {
      const k = i * (COLUMNS + 1) + j;
      const x = -half + (2 * half * j) / COLUMNS;
      rest.set([x, y, z], k * 3);
      const u = x / CARD_W + 0.5;
      uv.set([mirrorU ? 1 - u : u, y / CARD_H], k * 2);
    }
  });
  return { rest, uv, rows: rowsY.length };
}

function gridIndex(rows: number, flip: boolean): number[] {
  const index: number[] = [];
  const stride = COLUMNS + 1;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < COLUMNS; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (flip) index.push(a, d, b, a, c, d);
      else index.push(a, b, d, a, d, c);
    }
  }
  return index;
}

/** Counter-clockwise boundary of the face grid, as [x, y] pairs. */
function boundary(grid: Grid): Array<[number, number]> {
  const stride = COLUMNS + 1;
  const at = (i: number, j: number): [number, number] => {
    const k = (i * stride + j) * 3;
    return [grid.rest[k]!, grid.rest[k + 1]!];
  };
  const loop: Array<[number, number]> = [];
  const last = grid.rows - 1;
  for (let j = 0; j <= COLUMNS; j++) loop.push(at(0, j));
  for (let i = 1; i <= last; i++) loop.push(at(i, COLUMNS));
  for (let j = COLUMNS - 1; j >= 0; j--) loop.push(at(last, j));
  for (let i = last - 1; i >= 1; i--) loop.push(at(i, 0));
  return loop;
}

function buildRim(loop: Array<[number, number]>) {
  const count = loop.length;
  const rest = new Float32Array(count * RIM_RINGS * 3);
  const uv = new Float32Array(count * RIM_RINGS * 2);
  const normals = loop.map((_, l) => {
    const [px, py] = loop[(l - 1 + count) % count]!;
    const [nx, ny] = loop[(l + 1) % count]!;
    const dx = nx - px;
    const dy = ny - py;
    const len = Math.hypot(dx, dy) || 1;
    return [dy / len, -dx / len] as const;
  });
  for (let k = 0; k < RIM_RINGS; k++) {
    const s = k / (RIM_RINGS - 1);
    const z = CARD_T / 2 - CARD_T * s;
    const bulge = CARD_T * 0.32 * Math.sin(Math.PI * s);
    loop.forEach(([x, y], l) => {
      const [nx, ny] = normals[l]!;
      const v = (k * count + l) * 3;
      rest.set([x + nx * bulge, y + ny * bulge, z], v);
      uv.set([l / count, s], (k * count + l) * 2);
    });
  }
  const index: number[] = [];
  for (let k = 0; k < RIM_RINGS - 1; k++) {
    for (let l = 0; l < count; l++) {
      const a = k * count + l;
      const b = k * count + ((l + 1) % count);
      const c = (k + 1) * count + ((l + 1) % count);
      const d = (k + 1) * count + l;
      index.push(a, c, b, a, d, c);
    }
  }
  return { rest, uv, index };
}

function makeGeometry(rest: Float32Array, uv: Float32Array, index: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(rest.slice(), 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Writes `rest` (card space) deformed by `pose` into `out`.
 * Order: cup → arc and curl about the pivot → twist → tilt → roll → scale + translate.
 */
function deform(rest: Float32Array, out: Float32Array, pose: CardPose) {
  const cr = Math.cos(pose.roll);
  const sr = Math.sin(pose.roll);
  const ct = Math.cos(pose.tilt);
  const st = Math.sin(pose.tilt);
  const cw = Math.cos(pose.twist);
  const sw = Math.sin(pose.twist);
  for (let i = 0; i < rest.length; i += 3) {
    let x = rest[i]!;
    let y = rest[i + 1]! - pose.pivot;
    let z = rest[i + 2]! + pose.cup * x * x;

    if (Math.abs(pose.arc) > 1e-5) {
      const radius = 1 / pose.arc;
      const angle = y * pose.arc;
      const r = radius - x;
      x = radius - r * Math.cos(angle);
      y = r * Math.sin(angle);
    }

    const k = y >= 0 ? pose.curl : pose.curlBase;
    if (Math.abs(k) > 1e-5) {
      const radius = 1 / k;
      const angle = y * k;
      const r = radius + z;
      y = r * Math.sin(angle);
      z = r * Math.cos(angle) - radius;
    }

    const tx = x * cw + z * sw;
    z = -x * sw + z * cw;
    x = tx;

    const ty = y * ct + z * st;
    z = -y * st + z * ct;
    y = ty;

    const rx = x * cr - y * sr;
    y = x * sr + y * cr;
    x = rx;

    out[i] = x * pose.scale + pose.x;
    out[i + 1] = y * pose.scale + pose.y;
    out[i + 2] = z * pose.scale + pose.z;
  }
}

export class CardGeometry {
  readonly front: BufferGeometry;
  readonly back: BufferGeometry;
  readonly rim: BufferGeometry;
  private readonly parts: Array<{ geometry: BufferGeometry; rest: Float32Array }>;
  private lastPose = "";

  constructor() {
    const front = buildGrid(CARD_T / 2, false);
    const back = buildGrid(-CARD_T / 2, true);
    const rim = buildRim(boundary(front));
    this.front = makeGeometry(front.rest, front.uv, gridIndex(front.rows, false));
    this.back = makeGeometry(back.rest, back.uv, gridIndex(back.rows, true));
    this.rim = makeGeometry(rim.rest, rim.uv, rim.index);
    this.parts = [
      { geometry: this.front, rest: front.rest },
      { geometry: this.back, rest: back.rest },
      { geometry: this.rim, rest: rim.rest },
    ];
  }

  /** Re-deforms the card; skipped when the pose has not changed. */
  update(pose: CardPose) {
    const key = Object.values(pose).map((v) => v.toFixed(5)).join();
    if (key === this.lastPose) return;
    this.lastPose = key;
    for (const { geometry, rest } of this.parts) {
      const position = geometry.getAttribute("position") as BufferAttribute;
      deform(rest, position.array as Float32Array, pose);
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
  }

  dispose() {
    for (const { geometry } of this.parts) geometry.dispose();
  }
}

/** Card-space point → fan space under `pose` (for framing and aura anchors). */
export function deformPoint(x: number, y: number, pose: CardPose): [number, number, number] {
  const out = new Float32Array(3);
  deform(new Float32Array([x, y, CARD_T / 2]), out, pose);
  return [out[0]!, out[1]!, out[2]!];
}
