import { clock, frameLoop, init, surface, type FrameLoopHandle, type Gpu } from "vgpu";
import { artworkGeometry, createScene } from "./scene.ts";

export interface HologramRenderer {
  ready: Promise<void>;
  setActive(active: boolean): void;
  dispose(): void;
}

async function loadMask(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Molecule mask unavailable (${response.status})`);
  return createImageBitmap(await response.blob());
}

/** The source is supplied by the entry module, keeping the lifecycle testable without Vite. */
export function createRenderer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  url: string,
  source: string,
  onFailure: (error: unknown) => void,
  dependencies = { initGpu: init, loadMask },
): HologramRenderer {
  let disposed = false;
  let active = true;
  let prepared = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  let render = () => {};
  const cleanup: (() => void)[] = [];
  const request = new AbortController();
  let targetHover = 0;
  let pointerX = 0.2;
  let pointerY = -0.25;
  let touch = false;
  let tiltX = 0;
  let tiltY = 0;
  let hover = 0;
  let lightX = pointerX;
  let lightY = pointerY;

  const stop = () => { loop?.stop(); loop = undefined; };
  const wake = () => { if (active && prepared && !disposed && !loop) render(); };
  const reset = () => { targetHover = 0; pointerX = 0.2; pointerY = -0.25; };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    request.abort();
    stop();
    for (const release of cleanup.splice(0)) release();
    // vgpu stops owned schedulers before releasing surfaces, textures and device.
    gpu?.dispose();
    delete canvas.dataset.hologramReady;
  };
  const fail = (error: unknown) => {
    if (disposed) return;
    dispose();
    onFailure(error);
  };

  const ready = (async () => {
    const context = await dependencies.initGpu();
    if (disposed) { context.dispose(); return; }
    gpu = context;
    cleanup.push(context.onError(fail));
    void context.gpu.lost.then((info) => fail(new Error(`WebGPU device lost: ${info.message}`)));
    const bitmap = await dependencies.loadMask(url, request.signal);
    if (disposed) { bitmap.close(); return; }
    let output;
    let shader;
    try {
      output = surface(context, canvas, {
        dpr: [1, 2], alphaMode: "premultiplied", clearColor: [0, 0, 0, 0],
      });
      shader = createScene(context, output, bitmap, source);
    } finally {
      bitmap.close();
    }
    await shader.compile({ colors: [output.format] });
    if (disposed) return;

    const updateTheme = () => {
      shader.set({ params: { lightScheme: document.documentElement.dataset.colorScheme === "light" ? 1 : 0 } });
      wake();
    };
    updateTheme();
    const themeObserver = new MutationObserver(updateTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme"] });
    cleanup.push(() => themeObserver.disconnect());
    cleanup.push(output.onResize(() => {
      shader.set({ params: { resolution: output.size, artwork: artworkGeometry(output) } });
    }));
    // surface auto-resizes inside a frame; this observer wakes an otherwise idle loop.
    const resizeObserver = new ResizeObserver(wake);
    resizeObserver.observe(canvas);
    cleanup.push(() => resizeObserver.disconnect());
    window.addEventListener("resize", wake, { passive: true });
    cleanup.push(() => window.removeEventListener("resize", wake));

    const move = (event: PointerEvent) => {
      if (!active || !event.isPrimary) return;
      // A touch only lights the foil during contact; never consume the scroll gesture.
      if (event.pointerType === "touch" && event.type === "pointermove" && event.buttons === 0) return;
      const rect = canvas.getBoundingClientRect();
      const [cx, cy, size] = artworkGeometry(output).map((value) => value / output.dpr);
      const x = ((event.clientX - rect.left) - cx!) / Math.max(1, size!) * 2;
      const y = ((event.clientY - rect.top) - cy!) / Math.max(1, size!) * 2;
      if (event.clientY < rect.top || event.clientY > rect.bottom) { leave(); return; }
      const proximity = Math.max(0, 1 - Math.hypot(Math.max(0, Math.abs(x) - 1), Math.max(0, Math.abs(y) - 1)) / 2);
      targetHover = proximity * proximity * (3 - 2 * proximity);
      pointerX = Math.max(-2, Math.min(2, x));
      pointerY = Math.max(-2, Math.min(2, y));
      touch = event.pointerType !== "mouse";
      wake();
    };
    const leave = () => { reset(); wake(); };
    const up = (event: PointerEvent) => { if (event.pointerType !== "mouse") leave(); };
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerdown", move, { passive: true });
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    host.addEventListener("pointerup", up);
    // Scroll can move the header out from under a stationary pointer.
    document.addEventListener("scroll", leave, { capture: true, passive: true });
    cleanup.push(() => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerdown", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      host.removeEventListener("pointerup", up);
      document.removeEventListener("scroll", leave, true);
    });

    const time = clock(context);
    let revealing = false;
    render = () => {
      loop = frameLoop(context, (currentFrame) => {
        try {
          const targetX = touch ? 0 : Math.max(-1, Math.min(1, pointerX)) * 0.087 * targetHover;
          const targetY = touch ? 0 : -Math.max(-1, Math.min(1, pointerY)) * 0.052 * targetHover;
          const blend = 1 - Math.exp(-10 * Math.min(Math.max(time.deltaTime, 1 / 120), 0.1));
          tiltX += (targetX - tiltX) * blend;
          tiltY += (targetY - tiltY) * blend;
          hover += (targetHover - hover) * blend;
          lightX += (pointerX - lightX) * blend;
          lightY += (pointerY - lightY) * blend;
          shader.set({ params: { tilt: [tiltX, tiltY], pointer: [lightX, lightY], hover } });
          currentFrame.pass(output, shader);
          if (!revealing) {
            revealing = true;
            // Read done after frameLoop has submitted, including deferred GPU validation.
            void Promise.resolve().then(() => currentFrame.done).then(() => {
              if (!disposed) canvas.dataset.hologramReady = "true";
            }).catch(fail);
          }
          const remaining = Math.max(Math.abs(targetX - tiltX), Math.abs(targetY - tiltY),
            Math.abs(targetHover - hover), Math.abs(pointerX - lightX), Math.abs(pointerY - lightY));
          if (remaining < 0.001) stop();
        } catch (error) {
          // Cancel the failed frame and defer resource release until the callback
          // finishes. Do not turn an optional decoration into an uncaught error.
          currentFrame.cancel();
          stop();
          queueMicrotask(() => fail(error));
        }
      }, { fps: 60 });
    };
    prepared = true;
    wake();
  })().catch((error: unknown) => {
    if (disposed) return;
    dispose();
    throw error;
  });

  return {
    ready,
    setActive(value) {
      if (disposed || value === active) return;
      active = value;
      if (active) wake();
      else { stop(); reset(); tiltX = tiltY = hover = 0; lightX = pointerX; lightY = pointerY; }
    },
    dispose,
  };
}
