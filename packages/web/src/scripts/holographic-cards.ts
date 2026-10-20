import type { HologramRenderer } from "./holographic/renderer.ts";

type RendererFactory = (canvas: HTMLCanvasElement, host: HTMLElement, url: string, onFailure: (error: unknown) => void) => HologramRenderer;
type RendererLoader = () => Promise<{ createRenderer: RendererFactory }>;
type Entry = {
  host: HTMLElement;
  visible: boolean;
  pending: boolean;
  failed: boolean;
  generation: number;
  renderer?: HologramRenderer;
};
const mounted = new WeakMap<Document, () => void>();
const selector = "canvas[data-molecule-mask]";
/** A hologram is prepared this close to the viewport, so it is ready when it scrolls in… */
const NEAR = "50% 0px";
/** …and released (with its GPU device) once it is this far away. */
const FAR = "200% 0px";

/** Runs `callback` when the main thread is idle, or right away where that is unknown. */
function whenIdle(callback: () => void): void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) window.requestIdleCallback(callback, { timeout: 600 });
  else callback();
}

/**
 * One manager covers server-rendered cards and fetched list, wheel and modal
 * fragments. Renderers are created in idle time as a card nears the viewport
 * (setting up WebGPU mid-scroll would drop frames) and disposed once it is
 * well out of view.
 */
export function initHolographicCards(
  load: RendererLoader = () => import("./holographic/index.ts"),
): () => void {
  const previous = mounted.get(document);
  if (previous) return previous;
  const entries = new Map<HTMLCanvasElement, Entry>();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const print = window.matchMedia("print");
  let disposed = false;
  let suspended = false;
  let module: ReturnType<RendererLoader> | undefined;

  const release = (entry: Entry) => {
    ++entry.generation;
    entry.pending = false;
    entry.renderer?.dispose();
    entry.renderer = undefined;
  };
  const permitted = () => !motion.matches && !print.matches && !suspended && Boolean(navigator.gpu);
  // A card's hidden side (visibility: hidden while flipped) keeps its layout box,
  // so intersection alone would leave its renderer running.
  // (The canvas itself stays hidden until its first frame, so ask the host.)
  const shown = (entry: Entry) =>
    typeof getComputedStyle !== "function" || getComputedStyle(entry.host).visibility !== "hidden";
  const active = (canvas: HTMLCanvasElement, entry: Entry) =>
    permitted() && entry.visible && !document.hidden && canvas.isConnected &&
    !canvas.closest('[inert], [data-open="false"]') && shown(entry);

  const sync = (canvas: HTMLCanvasElement, entry: Entry) => {
    if (disposed) return;
    if (!permitted()) { release(entry); return; }
    const visible = Boolean(active(canvas, entry));
    entry.renderer?.setActive(visible);
    if (!visible || entry.failed || entry.pending || entry.renderer) return;
    entry.pending = true;
    const generation = ++entry.generation;
    const current = () => !disposed && entries.get(canvas) === entry && entry.generation === generation && canvas.isConnected;
    const failure = (error: unknown) => {
      if (!current()) return;
      entry.failed = true;
      release(entry);
      // The ordinary SVG remains readable; an optional effect never replaces card content with an error.
      console.warn("Substance hologram unavailable; keeping the static molecule.", error);
    };
    module ??= load();
    void module.then(({ createRenderer }) => whenIdle(() => {
      if (!current()) return;
      entry.pending = false;
      if (!active(canvas, entry)) return;
      const renderer = createRenderer(canvas, entry.host, canvas.dataset.moleculeMask!, failure);
      entry.renderer = renderer;
      void renderer.ready.catch(failure);
    })).catch(failure);
  };
  const syncAll = () => { for (const [canvas, entry] of entries) sync(canvas, entry); };
  const intersection = new IntersectionObserver((changes) => {
    for (const change of changes) {
      const canvas = change.target as HTMLCanvasElement;
      const entry = entries.get(canvas);
      if (!entry) continue;
      entry.visible = change.isIntersecting;
      sync(canvas, entry);
    }
  }, { rootMargin: NEAR });
  const distance = new IntersectionObserver((changes) => {
    for (const change of changes) {
      const entry = entries.get(change.target as HTMLCanvasElement);
      if (entry && !change.isIntersecting) release(entry);
    }
  }, { rootMargin: FAR });
  const register = (canvas: HTMLCanvasElement) => {
    if (entries.has(canvas)) return;
    const host = canvas.closest<HTMLElement>("[data-hologram-host], .substance-card");
    if (!host) return;
    // Cached innerHTML can contain an old ready attribute, but never GPU pixels.
    delete canvas.dataset.hologramReady;
    entries.set(canvas, { host, visible: false, pending: false, failed: false, generation: 0 });
    intersection.observe(canvas);
    distance.observe(canvas);
  };
  const scan = (root: ParentNode) => {
    root.querySelectorAll<HTMLCanvasElement>(selector).forEach(register);
  };
  const content = new MutationObserver((changes) => {
    for (const change of changes) {
      for (const node of change.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(selector)) register(node as HTMLCanvasElement);
        else scan(node);
      }
    }
    for (const [canvas, entry] of entries) {
      if (!canvas.isConnected) {
        intersection.unobserve(canvas);
        distance.unobserve(canvas);
        release(entry);
        entries.delete(canvas);
      }
    }
    syncAll();
  });
  content.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["inert", "data-open"] });
  motion.addEventListener("change", syncAll);
  print.addEventListener("change", syncAll);
  document.addEventListener("visibilitychange", syncAll);
  document.addEventListener("psy:card-flip", syncAll);
  const hide = () => { suspended = true; syncAll(); };
  const show = () => { suspended = false; syncAll(); };
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  window.addEventListener("beforeprint", hide);
  window.addEventListener("afterprint", show);
  scan(document);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    content.disconnect();
    intersection.disconnect();
    distance.disconnect();
    motion.removeEventListener("change", syncAll);
    print.removeEventListener("change", syncAll);
    document.removeEventListener("visibilitychange", syncAll);
    document.removeEventListener("psy:card-flip", syncAll);
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", show);
    window.removeEventListener("beforeprint", hide);
    window.removeEventListener("afterprint", show);
    for (const entry of entries.values()) release(entry);
    entries.clear();
    mounted.delete(document);
  };
  mounted.set(document, dispose);
  return dispose;
}
