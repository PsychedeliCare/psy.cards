#!/usr/bin/env node
/**
 * Prerender SMILES structures to SVG assets for the iOS asset catalog.
 * Prefer smiles-drawer when available; otherwise emit a labeled placeholder SVG.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../../..");
const sharedRoot = path.resolve(__dirname, "..");
const assetsRoot = path.join(
  monorepoRoot,
  "packages/ios/PsyCards/Resources/Assets.xcassets"
);

const require = createRequire(import.meta.url);

function keyToAssetName(key) {
  return `molecule_${key.replace(/\//g, "-").replace(/-/g, "_")}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function placeholderSvg(compound, smiles) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="none"/>
  <circle cx="256" cy="210" r="96" fill="none" stroke="#f5f5f5" stroke-width="6" opacity="0.55"/>
  <circle cx="190" cy="170" r="10" fill="#f5f5f5"/>
  <circle cx="256" cy="140" r="10" fill="#f5f5f5"/>
  <circle cx="322" cy="170" r="10" fill="#f5f5f5"/>
  <circle cx="210" cy="250" r="10" fill="#f5f5f5"/>
  <circle cx="302" cy="250" r="10" fill="#f5f5f5"/>
  <text x="256" y="360" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="36" fill="#f5f5f5">${escapeXml(compound)}</text>
  <text x="256" y="400" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#a6a6aa">${escapeXml(smiles.slice(0, 48))}${smiles.length > 48 ? "…" : ""}</text>
</svg>
`;
}

let smilesDrawerEnv = null;

async function getSmilesDrawerEnv() {
  if (smilesDrawerEnv !== null) return smilesDrawerEnv;
  try {
    // smiles-drawer expects a browser-like SVG environment. The UMD bundle
    // attaches to `window` on first load (and require() is cached), so the
    // JSDOM environment is created once and reused for every molecule.
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body></body></html>`,
      { pretendToBeVisual: true }
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.SVGElement = dom.window.SVGElement;
    globalThis.HTMLElement = dom.window.HTMLElement;
    require("smiles-drawer/dist/smiles-drawer.min.js");
    smilesDrawerEnv = { dom, SmilesDrawer: dom.window.SmilesDrawer };
  } catch (error) {
    console.warn(`smiles-drawer unavailable: ${error.message}`);
    smilesDrawerEnv = false;
  }
  return smilesDrawerEnv;
}

async function tryRenderWithSmilesDrawer(smiles) {
  const env = await getSmilesDrawerEnv();
  if (!env) return null;
  const { SmilesDrawer } = env;
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "512");
    svg.setAttribute("height", "512");
    document.body.appendChild(svg);
    // Element colors mirror packages/web/src/scripts/smiles-drawer.ts (psy-dark theme)
    // so the iOS rendering matches the web molecule figures.
    const drawer = new SmilesDrawer.SvgDrawer({
      width: 512,
      height: 512,
      bondThickness: 1.4,
      shortBondLength: 0.6,
      bondSpacing: 4,
      explicitHydrogens: false,
      compactDrawing: true,
      padding: 24,
      themes: {
        dark: {
          FOREGROUND: "#f5f5f5",
          C: "#f5f5f5",
          O: "#e74c3c",
          N: "#3498db",
          F: "#27ae60",
          CL: "#16a085",
          BR: "#d35400",
          I: "#8e44ad",
          P: "#d35400",
          S: "#f1c40f",
          B: "#e67e22",
          SI: "#e67e22",
          H: "#888888",
          BACKGROUND: "#00000000",
        },
      },
    });

    return await new Promise((resolve) => {
      SmilesDrawer.parse(smiles, (tree) => {
        try {
          drawer.draw(tree, svg, "dark");
          const serialized = svg.outerHTML;
          svg.remove();
          resolve(serialized.includes("<path") || serialized.includes("<line") ? serialized : null);
        } catch (error) {
          console.warn(`draw failed: ${error.message}`);
          svg.remove();
          resolve(null);
        }
      }, (error) => {
        console.warn(`parse failed: ${error?.message ?? error}`);
        svg.remove();
        resolve(null);
      });
    });
  } catch (error) {
    console.warn(`render failed: ${error.message}`);
    return null;
  }
}

/**
 * Normalize smiles-drawer SVG output for resvg:
 * - convert CSS `transform: translateX()/translateY()` styles to transform attributes
 * - replace the <style> class-based fonts with explicit presentation attributes
 */
function normalizeSvg(svg) {
  let out = svg.replace(
    /style="transform: translateX\((-?[\d.]+)px\) translateY\((-?[\d.]+)px\)"/g,
    (_, x, y) => `transform="translate(${x} ${y})"`
  );
  out = out.replace(/<style>[\s\S]*?<\/style>/, "");
  // 11pt ≈ 14.66px; 3pt ≈ 4px
  out = out.replace(
    /class="element"/g,
    'font-family="Helvetica, Arial, sans-serif" font-size="14.66"'
  );
  out = out.replace(
    /class="sub"/g,
    'font-family="Helvetica, Arial, sans-serif" font-size="4"'
  );
  return out;
}

async function rasterize(svg) {
  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(normalizeSvg(svg), {
    fitTo: { mode: "width", value: 1024 },
    font: { loadSystemFonts: true, defaultFontFamily: "Helvetica" },
    background: "rgba(0,0,0,0)",
  });
  return resvg.render().asPng();
}

function writeImageSet(assetName, png) {
  const dir = path.join(assetsRoot, `${assetName}.imageset`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${assetName}.png`), png);
  fs.writeFileSync(
    path.join(dir, "Contents.json"),
    JSON.stringify(
      {
        images: [
          {
            filename: `${assetName}.png`,
            idiom: "universal",
          },
        ],
        info: { author: "xcode", version: 1 },
        properties: {
          "template-rendering-intent": "original",
        },
      },
      null,
      2
    ) + "\n"
  );
}

async function main() {
  const substances = JSON.parse(
    fs.readFileSync(path.join(sharedRoot, "data/substances.json"), "utf8")
  );

  // Ensure jsdom is available for optional rendering; install lightly if missing.
  try {
    require.resolve("jsdom");
  } catch {
    console.log("jsdom not found — using placeholder SVGs (run with jsdom for real structures)");
  }

  fs.mkdirSync(assetsRoot, { recursive: true });
  if (!fs.existsSync(path.join(assetsRoot, "Contents.json"))) {
    fs.writeFileSync(
      path.join(assetsRoot, "Contents.json"),
      JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n"
    );
  }

  let rendered = 0;
  let placeholders = 0;

  for (const [key, structure] of Object.entries(substances)) {
    const assetName = keyToAssetName(key);
    let svg = await tryRenderWithSmilesDrawer(structure.smiles);
    let isDrawn = Boolean(svg);
    if (isDrawn) {
      rendered += 1;
    } else {
      svg = placeholderSvg(structure.compound, structure.smiles);
      placeholders += 1;
    }
    const png = await rasterize(svg);
    writeImageSet(assetName, png);
    console.log(`molecule ${key} → ${assetName} (${isDrawn ? "drawn" : "placeholder"})`);
  }

  console.log(`Molecules: ${rendered} drawn, ${placeholders} placeholders`);
}

main();
