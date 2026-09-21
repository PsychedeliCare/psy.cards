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

/** One manager covers server-rendered cards and fetched list, wheel and modal fragments. */
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
  const active = (canvas: HTMLCanvasElement, entry: Entry) =>
    permitted() && entry.visible && !document.hidden && canvas.isConnected &&
    !canvas.closest('[inert], [data-open="false"]');

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
    void module.then(({ createRenderer }) => {
      if (!current()) return;
      entry.pending = false;
      if (!active(canvas, entry)) return;
      const renderer = createRenderer(canvas, entry.host, canvas.dataset.moleculeMask!, failure);
      entry.renderer = renderer;
      void renderer.ready.catch(failure);
    }).catch(failure);
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
  });
  const register = (canvas: HTMLCanvasElement) => {
    if (entries.has(canvas)) return;
    const host = canvas.closest<HTMLElement>(".substance-card");
    if (!host) return;
    // Cached innerHTML can contain an old ready attribute, but never GPU pixels.
    delete canvas.dataset.hologramReady;
    entries.set(canvas, { host, visible: false, pending: false, failed: false, generation: 0 });
    intersection.observe(canvas);
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
    motion.removeEventListener("change", syncAll);
    print.removeEventListener("change", syncAll);
    document.removeEventListener("visibilitychange", syncAll);
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
