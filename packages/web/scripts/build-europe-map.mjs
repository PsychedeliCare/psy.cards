#!/usr/bin/env node
/**
 * Builds the line map of Europe used on the /about page
 * (src/data/europe-map.json): country outlines projected (Lambert azimuthal
 * equal-area, like EPSG:3035), clipped to the frame, simplified and rounded.
 *
 * Source: world-atlas 2.0.2 (ISC), from Natural Earth 1:50m (public domain).
 *
 *   node scripts/build-europe-map.mjs [path/to/countries-50m.json]
 *
 * Without a path the topology is downloaded from jsDelivr.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SOURCE = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json";
const OUT = fileURLToPath(new URL("../src/data/europe-map.json", import.meta.url));

// ISO 3166 numeric → alpha-2 for every country with local info on the card
// backs. Territories are drawn as part of the country they belong to.
const COUNTRIES = {
  "020": "AD", "008": "AL", "051": "AM", "040": "AT", "031": "AZ", "070": "BA",
  "056": "BE", "100": "BG", "112": "BY", "756": "CH", "196": "CY", "203": "CZ",
  "276": "DE", "208": "DK", "233": "EE", "724": "ES", "246": "FI", "250": "FR",
  "826": "GB", "268": "GE", "300": "GR", "191": "HR", "348": "HU", "372": "IE",
  "352": "IS", "380": "IT", "438": "LI", "440": "LT", "442": "LU", "428": "LV",
  "492": "MC", "498": "MD", "499": "ME", "807": "MK", "470": "MT", "528": "NL",
  "578": "NO", "616": "PL", "620": "PT", "642": "RO", "688": "RS", "643": "RU",
  "752": "SE", "705": "SI", "703": "SK", "674": "SM", "792": "TR", "804": "UA",
  "336": "VA",
  "248": "FI", "234": "DK", "831": "GB", "832": "GB", "833": "GB",
};
const BY_NAME = { Kosovo: "XK", "N. Cyprus": "CY" };
// Neighbouring land, drawn faintly so coasts read as coasts.
const CONTEXT = new Set([
  "504", "012", "788", "434", "818", "760", "368", "364", "398", "422", "376",
  "400", "682", "275", "795", "860", "304",
]);

// Capitals: where the expansion lines land (Bern for Switzerland).
const CAPITALS = {
  AD: [1.52, 42.51], AL: [19.82, 41.33], AM: [44.51, 40.18], AT: [16.37, 48.21],
  AZ: [49.87, 40.41], BA: [18.41, 43.86], BE: [4.35, 50.85], BG: [23.32, 42.7],
  BY: [27.56, 53.9], CH: [7.45, 46.95], CY: [33.36, 35.17], CZ: [14.42, 50.08],
  DE: [13.4, 52.52], DK: [12.57, 55.68], EE: [24.75, 59.44], ES: [-3.7, 40.42],
  FI: [24.94, 60.17], FR: [2.35, 48.86], GB: [-0.13, 51.51], GE: [44.79, 41.72],
  GR: [23.73, 37.98], HR: [15.98, 45.81], HU: [19.04, 47.5], IE: [-6.26, 53.35],
  IS: [-21.94, 64.15], IT: [12.5, 41.9], LI: [9.52, 47.14], LT: [25.28, 54.69],
  LU: [6.13, 49.61], LV: [24.11, 56.95], MC: [7.42, 43.74], MD: [28.86, 47.01],
  ME: [19.26, 42.44], MK: [21.43, 42.0], MT: [14.51, 35.9], NL: [4.9, 52.37],
  NO: [10.75, 59.91], PL: [21.01, 52.23], PT: [-9.14, 38.72], RO: [26.1, 44.43],
  RS: [20.46, 44.79], RU: [37.62, 55.76], SE: [18.07, 59.33], SI: [14.51, 46.06],
  SK: [17.11, 48.15], SM: [12.45, 43.94], TR: [32.85, 39.93], UA: [30.52, 50.45],
  VA: [12.45, 41.9], XK: [21.17, 42.66],
};

const WIDTH = 1000;
const LON0 = 14;
const LAT0 = 53;
const rad = Math.PI / 180;

function laea([lon, lat]) {
  const l = (lon - LON0) * rad;
  const p = lat * rad;
  const p0 = LAT0 * rad;
  const k = Math.sqrt(2 / (1 + Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l)));
  return [k * Math.cos(p) * Math.sin(l), -k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l))];
}

// Frame: Iceland to the Caspian, Crete/Cyprus to the North Cape.
const framePoints = [[-25, 64], [-11, 36], [-10, 52], [14, 35.4], [25, 34.6], [36, 34.2], [50.5, 40], [50.5, 46], [31, 71.4], [20, 71.4], [-22, 67]];
const projectedFrame = framePoints.map(laea);
const fx0 = Math.min(...projectedFrame.map((p) => p[0]));
const fx1 = Math.max(...projectedFrame.map((p) => p[0]));
const fy0 = Math.min(...projectedFrame.map((p) => p[1]));
const fy1 = Math.max(...projectedFrame.map((p) => p[1]));
const scale = WIDTH / (fx1 - fx0);
const HEIGHT = Math.round((fy1 - fy0) * scale);
const toView = (lonLat) => {
  const [x, y] = laea(lonLat);
  return [(x - fx0) * scale, (y - fy0) * scale];
};

function decodeArcs(topology) {
  const [sx, sy] = topology.transform.scale;
  const [tx, ty] = topology.transform.translate;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

function ring(arcs, indexes) {
  const points = [];
  for (const index of indexes) {
    const arc = index < 0 ? arcs[~index].slice().reverse() : arcs[index];
    points.push(...(points.length ? arc.slice(1) : arc));
  }
  return points;
}

/** Sutherland–Hodgman against the view rectangle. */
function clip(points) {
  const edges = [
    (p) => p[0] >= 0, (p) => p[0] <= WIDTH, (p) => p[1] >= 0, (p) => p[1] <= HEIGHT,
  ];
  const cut = [
    (a, b) => lerpAt(a, b, (0 - a[0]) / (b[0] - a[0])),
    (a, b) => lerpAt(a, b, (WIDTH - a[0]) / (b[0] - a[0])),
    (a, b) => lerpAt(a, b, (0 - a[1]) / (b[1] - a[1])),
    (a, b) => lerpAt(a, b, (HEIGHT - a[1]) / (b[1] - a[1])),
  ];
  let output = points;
  edges.forEach((inside, edge) => {
    const input = output;
    output = [];
    input.forEach((current, i) => {
      const previous = input[(i + input.length - 1) % input.length];
      if (inside(current)) {
        if (!inside(previous)) output.push(cut[edge](previous, current));
        output.push(current);
      } else if (inside(previous)) {
        output.push(cut[edge](previous, current));
      }
    });
  });
  return output;
}

function lerpAt(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function simplify(points, tolerance) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let max = 0;
    let index = -1;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      // A closed ring starts and ends on the same point: measure from it.
      const distance = length
        ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / length
        : Math.hypot(px - ax, py - ay);
      if (distance > max) {
        max = distance;
        index = i;
      }
    }
    if (max > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function area(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

function pathData(rings) {
  return rings
    .map((points) => {
      let [px, py] = points[0].map((v) => Math.round(v * 10));
      let d = `M${px / 10} ${py / 10}`;
      for (const point of points.slice(1)) {
        const [x, y] = point.map((v) => Math.round(v * 10));
        if (x === px && y === py) continue;
        d += `l${(x - px) / 10} ${(y - py) / 10}`;
        px = x;
        py = y;
      }
      return `${d}z`;
    })
    .join("");
}

const topology = JSON.parse(
  process.argv[2] ? await readFile(process.argv[2], "utf8") : await (await fetch(SOURCE)).text()
);
const arcs = decodeArcs(topology);
const shapes = new Map();

for (const geometry of topology.objects.countries.geometries) {
  const code = COUNTRIES[geometry.id] ?? BY_NAME[geometry.properties.name];
  const context = !code && CONTEXT.has(geometry.id);
  if (!code && !context) continue;
  const key = code ?? `ctx-${geometry.id}`;
  const polygons = geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs;
  for (const polygon of polygons) {
    for (const indexes of polygon) {
      const projected = ring(arcs, indexes).map(toView);
      const clipped = clip(projected);
      if (clipped.length < 3) continue;
      // Microstates keep their full outline; other specks are dropped.
      const tiny = ["VA", "MC", "SM", "LI", "AD", "MT", "LU"].includes(code);
      const simplified = tiny ? clipped : simplify([...clipped, clipped[0]], 0.55).slice(0, -1);
      const size = Math.abs(area(simplified));
      if (simplified.length < 3 || (size < (context ? 12 : 2.5) && !tiny)) continue;
      if (!shapes.has(key)) shapes.set(key, { context, rings: [] });
      shapes.get(key).rings.push(simplified);
    }
  }
}

const countries = [...shapes]
  .filter(([, shape]) => !shape.context)
  .map(([id, shape]) => {
    const [x, y] = toView(CAPITALS[id]);
    return { id, d: pathData(shape.rings), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  })
  .sort((a, b) => a.id.localeCompare(b.id));
const context = [...shapes]
  .filter(([, shape]) => shape.context)
  .map(([, shape]) => pathData(shape.rings))
  .join("");

const missing = Object.keys(CAPITALS).filter((id) => !countries.some((country) => country.id === id));
if (missing.length) throw new Error(`No outline for ${missing.join(", ")}`);

await writeFile(OUT, `${JSON.stringify({ width: WIDTH, height: HEIGHT, countries, context })}\n`);
console.log(`Wrote ${countries.length} countries (${WIDTH}×${HEIGHT}) to ${OUT}`);
