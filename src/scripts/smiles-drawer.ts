/**
 * Lazy-loads SmilesDrawer and renders molecule figures in card headers.
 * Watches for dynamically injected modal content (combo + substance cards).
 */

import substancesData from "../../data/substances.json";

type SmilesDrawerModule = typeof import("smiles-drawer").default;

type SubstanceEntry = {
  smiles: string;
  compound: string;
  representative?: boolean;
};

type SubstancesMap = Record<string, SubstanceEntry>;

const DRAW_OPTIONS = {
  bondLength: 22,
  bondThickness: 1.1,
  shortBondLength: 0.6,
  bondSpacing: 3.2,
  fontSizeLarge: 6.3,
  explicitHydrogens: false,
  compactDrawing: true,
  padding: 8,
  themes: {
    "psy-dark": {
      FOREGROUND: "#f5f5f5",
      BACKGROUND: "transparent",
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
    },
    "psy-light": {
      FOREGROUND: "#171813",
      BACKGROUND: "transparent",
      C: "#171813",
      O: "#c0392b",
      N: "#2471a3",
      F: "#1e8449",
      CL: "#117a65",
      BR: "#ba4a00",
      I: "#6c3483",
      P: "#ba4a00",
      S: "#d4ac0d",
      B: "#ca6f1e",
      SI: "#ca6f1e",
      H: "#62665b",
    },
  },
} as const;

let drawerModule: SmilesDrawerModule | null = null;
let substancesMap: SubstancesMap | null = null;
let themeObserver: MutationObserver | null = null;
let contentObserver: MutationObserver | null = null;
let initialised = false;

function getColorScheme(): "light" | "dark" {
  const scheme = document.documentElement.getAttribute("data-color-scheme");
  return scheme === "light" ? "light" : "dark";
}

function getThemeName(): "psy-light" | "psy-dark" {
  return getColorScheme() === "light" ? "psy-light" : "psy-dark";
}

async function loadDrawer(): Promise<SmilesDrawerModule> {
  if (!drawerModule) {
    const module = await import("smiles-drawer");
    drawerModule = module.default;
  }
  return drawerModule;
}

async function loadSubstances(): Promise<SubstancesMap> {
  if (substancesMap) return substancesMap;
  substancesMap = substancesData as SubstancesMap;
  return substancesMap;
}

function parseSubstanceKeys(root: HTMLElement): string[] {
  const keys = root.dataset.substanceKeys;
  if (keys) {
    return keys.split("|").filter(Boolean);
  }
  const single = root.dataset.substanceKey;
  return single ? [single] : [];
}

const DEFAULT_FRAME_SIZE = 224;
const DEFAULT_COMBO_FRAME_SIZE = 149;

function getFrameSize(element: HTMLElement, fallback: number): number {
  const size = Math.max(element.clientWidth, element.clientHeight);
  return size > 0 ? size : fallback;
}

function getDrawTarget(element: HTMLElement): HTMLElement {
  return element.querySelector<HTMLElement>(".molecule-frame") ?? element;
}

function waitForLayout(root: HTMLElement): Promise<void> {
  const frame = getDrawTarget(root);
  if (getFrameSize(frame, 0) > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function getSquareDrawSize(
  element: HTMLElement,
  fallback: number
): { width: number; height: number } {
  const size = getFrameSize(element, fallback);
  return { width: size, height: size };
}

function createDrawer(
  module: SmilesDrawerModule,
  width: number,
  height: number
): InstanceType<SmilesDrawerModule["SmiDrawer"]> {
  return new module.SmiDrawer({
    ...DRAW_OPTIONS,
    width,
    height,
  });
}

async function drawSmiles(
  svg: SVGSVGElement,
  smiles: string,
  width: number,
  height: number
): Promise<void> {
  const module = await loadDrawer();
  const drawer = createDrawer(module, width, height);
  await new Promise<void>((resolve, reject) => {
    drawer.draw(
      smiles,
      svg,
      getThemeName(),
      () => resolve(),
      (error: unknown) => reject(error)
    );
  });
}

async function renderMoleculeFigure(root: HTMLElement): Promise<void> {
  if (root.dataset.moleculeRendered === "true") return;

  const keys = parseSubstanceKeys(root);
  if (!keys.length) return;

  await waitForLayout(root);

  const substances = await loadSubstances();
  const layout = root.dataset.moleculeLayout ?? "single";
  const slots = root.querySelectorAll<HTMLElement>("[data-molecule-slot]");

  if (layout === "combo" && slots.length >= 2) {
    await Promise.all(
      Array.from(slots).map(async (slot, index) => {
        const key = keys[index];
        const entry = key ? substances[key] : undefined;
        if (!entry) return;
        const frame = getDrawTarget(slot);
        const svg = frame.querySelector<SVGSVGElement>(".molecule-svg");
        if (!svg) return;
        const { width, height } = getSquareDrawSize(
          frame,
          DEFAULT_COMBO_FRAME_SIZE
        );
        await drawSmiles(svg, entry.smiles, width, height);
      })
    );
  } else {
    const key = keys[0];
    const entry = key ? substances[key] : undefined;
    if (!entry) return;
    const frame = getDrawTarget(root);
    const svg = frame.querySelector<SVGSVGElement>(".molecule-svg");
    if (!svg) return;
    const { width, height } = getSquareDrawSize(frame, DEFAULT_FRAME_SIZE);
    await drawSmiles(svg, entry.smiles, width, height);
  }

  root.dataset.moleculeRendered = "true";
}

function scanAndRender(root: ParentNode = document): void {
  const figures = root.querySelectorAll<HTMLElement>(
    ".molecule-figure:not([data-molecule-rendered='true'])"
  );
  for (const figure of figures) {
    void renderMoleculeFigure(figure).catch(() => {
      figure.dataset.moleculeRendered = "error";
    });
  }
}

function redrawAll(): void {
  const figures = document.querySelectorAll<HTMLElement>(".molecule-figure");
  for (const figure of figures) {
    delete figure.dataset.moleculeRendered;
    const svgs = figure.querySelectorAll("svg");
    for (const svg of svgs) {
      svg.replaceChildren();
    }
  }
  scanAndRender();
}

function observeThemeChanges(): void {
  if (themeObserver) return;
  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "data-color-scheme"
      ) {
        redrawAll();
        return;
      }
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-color-scheme"],
  });
}

function observeContentChanges(): void {
  if (contentObserver) return;
  contentObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(".molecule-figure")) {
          void renderMoleculeFigure(node).catch(() => {
            node.dataset.moleculeRendered = "error";
          });
        } else {
          scanAndRender(node);
        }
      }
    }
  });
  contentObserver.observe(document.body, { childList: true, subtree: true });
}

export function initSmilesDrawer(): void {
  if (initialised) return;
  initialised = true;

  observeThemeChanges();
  observeContentChanges();
  scanAndRender();
}
