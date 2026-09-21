import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { init as mockInit, getMockGPUDeviceInstrumentation } from "vgpu/mock";
import { createRenderer } from "../src/scripts/holographic/renderer.ts";
import { initHolographicCards } from "../src/scripts/holographic-cards.ts";

const shader = fs.readFileSync(new URL("../src/scripts/holographic/shader.wgsl", import.meta.url), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function environment(t) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const frames = new Map();
  let id = 0, time = 0;
  const queries = new Map();
  const intersections = [];
  const cleanup = [];
  dom.window.matchMedia = (query) => {
    if (!queries.has(query)) {
      const media = new dom.window.EventTarget();
      media.matches = false;
      media.change = (value) => { media.matches = value; media.dispatchEvent(new dom.window.Event("change")); };
      queries.set(query, media);
    }
    return queries.get(query);
  };
  const globals = {
    window: dom.window, document: dom.window.document, navigator: { gpu: {} },
    HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (key) => frames.delete(key),
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class {
      targets = new Set();
      constructor(callback) { this.callback = callback; intersections.push(this); }
      observe(target) { this.targets.add(target); }
      unobserve(target) { this.targets.delete(target); }
      disconnect() { this.targets.clear(); }
      notify(visible = true) { this.callback([...this.targets].map((target) => ({ target, isIntersecting: visible }))); }
    },
  };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    cleanup.forEach((dispose) => dispose());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    cleanup: (dispose) => cleanup.push(dispose),
    queries, intersections, frames,
    async tick(count = 1) {
      for (let i = 0; i < count; i++) {
        time += 1000 / 60;
        const callbacks = [...frames.values()]; frames.clear();
        callbacks.forEach((callback) => callback(time));
        await flush();
      }
    },
    card() {
      const host = document.createElement("article"); host.className = "substance-card";
      host.innerHTML = '<canvas data-molecule-mask="/assets/molecules/lsd.png"></canvas><div class="molecule-figure"></div>';
      document.body.append(host);
      const canvas = host.querySelector("canvas");
      Object.defineProperties(canvas, { clientWidth: { value: 600 }, clientHeight: { value: 300 } });
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 300, right: 600, bottom: 300 });
      return { host, canvas };
    },
    pointer(host, type, x = 480, pointerType = "mouse") {
      const event = new dom.window.Event(type, { cancelable: true });
      Object.assign(event, { isPrimary: true, clientX: x, clientY: 120, pointerType, buttons: 1 });
      host.dispatchEvent(event);
      return event;
    },
  };
}

async function gpuFixture(canvas) {
  const gpu = await mockInit();
  const loss = deferred();
  gpu.gpu.lost = loss.promise;
  let disposed = 0, closed = 0, unconfigured = 0, texturesDestroyed = 0;
  const dispose = gpu.dispose.bind(gpu);
  gpu.dispose = () => { disposed++; dispose(); };
  gpu.gpu.queue.copyExternalImageToTexture = () => {};
  const createTexture = gpu.gpu.createTexture.bind(gpu.gpu);
  const createOwnedTexture = gpu.device.createTexture.bind(gpu.device);
  gpu.device.createTexture = (...args) => {
    const texture = createOwnedTexture(...args);
    texture.onDestroy(() => { texturesDestroyed++; });
    return texture;
  };
  canvas.getContext = () => ({
    configure() {}, unconfigure() { unconfigured++; },
    getCurrentTexture: () => createTexture({ size: [600, 300], format: "bgra8unorm", usage: 16 }),
  });
  const bitmap = { width: 1024, height: 1024, close() { closed++; } };
  return {
    gpu, loss, bitmap,
    dependencies: { initGpu: async () => gpu, loadMask: async () => bitmap },
    stats: () => ({ disposed, closed, unconfigured, texturesDestroyed }),
  };
}

test("removal while WebGPU initialization is pending releases the late device", async (t) => {
  const env = environment(t), { host, canvas } = env.card();
  const fixture = await gpuFixture(canvas), gate = deferred();
  const renderer = createRenderer(canvas, host, "mask", shader, assert.fail, { ...fixture.dependencies, initGpu: () => gate.promise });
  renderer.dispose(); renderer.dispose(); gate.resolve(fixture.gpu);
  await renderer.ready;
  assert.equal(fixture.stats().disposed, 1);
  assert.equal(fixture.stats().unconfigured, 0);
  assert.equal(env.frames.size, 0);
});

test("removal during image decode closes the bitmap without creating a surface", async (t) => {
  const env = environment(t), { host, canvas } = env.card();
  const fixture = await gpuFixture(canvas), gate = deferred();
  const renderer = createRenderer(canvas, host, "mask", shader, assert.fail, { ...fixture.dependencies, loadMask: () => gate.promise });
  await flush(); renderer.dispose(); gate.resolve(fixture.bitmap); await renderer.ready;
  assert.deepEqual(fixture.stats(), { disposed: 1, closed: 1, unconfigured: 0, texturesDestroyed: 0 });
});

test("initialization failure releases resources and leaves the SVG visible", async (t) => {
  const env = environment(t), { host, canvas } = env.card();
  const fixture = await gpuFixture(canvas);
  const renderer = createRenderer(canvas, host, "mask", shader, assert.fail, {
    ...fixture.dependencies, loadMask: async () => { throw new Error("404"); },
  });
  await assert.rejects(renderer.ready, /404/);
  assert.equal(fixture.stats().disposed, 1);
  assert.equal(canvas.dataset.hologramReady, undefined);
});

test("frames settle, wake for passive touch, pause offscreen, and dispose all resources", async (t) => {
  const env = environment(t), { host, canvas } = env.card();
  const fixture = await gpuFixture(canvas);
  const renderer = createRenderer(canvas, host, "mask", shader, assert.fail, fixture.dependencies);
  await renderer.ready; await env.tick(2);
  assert.equal(canvas.dataset.hologramReady, "true");
  assert.equal(env.frames.size, 0, "idle artwork has no frame loop");
  const event = env.pointer(host, "pointerdown", 400, "touch");
  assert.equal(event.defaultPrevented, false);
  assert.ok(env.frames.size > 0);
  renderer.setActive(false);
  assert.equal(env.frames.size, 0);
  renderer.setActive(true); await env.tick(2);
  renderer.dispose(); renderer.dispose();
  assert.equal(canvas.dataset.hologramReady, undefined);
  assert.deepEqual(fixture.stats(), { disposed: 1, closed: 1, unconfigured: 1, texturesDestroyed: 1 });
  env.pointer(host, "pointermove");
  assert.equal(env.frames.size, 0);
  assert.ok(getMockGPUDeviceInstrumentation(fixture.gpu.gpu).calls.createRenderPipelineAsync > 0);
});

test("device loss restores the static molecule and stops rendering", async (t) => {
  const env = environment(t), { host, canvas } = env.card();
  const fixture = await gpuFixture(canvas); let failures = 0;
  const renderer = createRenderer(canvas, host, "mask", shader, () => failures++, fixture.dependencies);
  await renderer.ready; await env.tick(2);
  fixture.loss.resolve({ reason: "unknown", message: "test loss" }); await flush();
  assert.equal(failures, 1);
  assert.equal(canvas.dataset.hologramReady, undefined);
  assert.equal(env.frames.size, 0);
  assert.equal(fixture.stats().disposed, 1);
});

test("shader compilation failure releases the texture, surface, and decoded image", async (t) => {
  const env = environment(t), { host, canvas } = env.card();
  const fixture = await gpuFixture(canvas);
  fixture.gpu.gpu.createRenderPipelineAsync = async () => { throw new Error("compile failure"); };
  const renderer = createRenderer(canvas, host, "mask", shader, assert.fail, fixture.dependencies);
  await assert.rejects(renderer.ready, (error) => error.cause?.message === "compile failure");
  assert.deepEqual(fixture.stats(), { disposed: 1, closed: 1, unconfigured: 1, texturesDestroyed: 1 });
  assert.equal(canvas.dataset.hologramReady, undefined);
});

test("disposal while compilation is pending cannot start a late frame loop", async (t) => {
  const env = environment(t), { host, canvas } = env.card();
  const fixture = await gpuFixture(canvas), gate = deferred();
  fixture.gpu.gpu.createRenderPipelineAsync = () => gate.promise;
  const renderer = createRenderer(canvas, host, "mask", shader, assert.fail, fixture.dependencies);
  await flush(); renderer.dispose(); gate.resolve({}); await renderer.ready;
  assert.equal(env.frames.size, 0);
  assert.deepEqual(fixture.stats(), { disposed: 1, closed: 1, unconfigured: 1, texturesDestroyed: 1 });
});

test("a failed render frame is cancelled and falls back without an uncaught error", async (t) => {
  const env = environment(t), { host, canvas } = env.card();
  const fixture = await gpuFixture(canvas); let failures = 0;
  const renderer = createRenderer(canvas, host, "mask", shader, () => failures++, fixture.dependencies);
  await renderer.ready;
  fixture.gpu.gpu.createBindGroup = () => { throw new Error("render failure"); };
  await env.tick(2);
  assert.equal(failures, 1);
  assert.equal(env.frames.size, 0);
  assert.equal(canvas.dataset.hologramReady, undefined);
  assert.deepEqual(fixture.stats(), { disposed: 1, closed: 1, unconfigured: 1, texturesDestroyed: 1 });
});

test("changing the color scheme wakes the otherwise settled artwork", async (t) => {
  const env = environment(t), { host, canvas } = env.card();
  const fixture = await gpuFixture(canvas);
  const renderer = createRenderer(canvas, host, "mask", shader, assert.fail, fixture.dependencies);
  await renderer.ready; await env.tick(2);
  assert.equal(env.frames.size, 0);
  document.documentElement.dataset.colorScheme = "light"; await flush();
  assert.ok(env.frames.size > 0);
  await env.tick(2); assert.equal(env.frames.size, 0);
  renderer.dispose();
});

test("manager deduplicates mounts and releases repeatedly replaced cards", async (t) => {
  const env = environment(t); let creates = 0, disposes = 0;
  const load = async () => ({ createRenderer: () => { creates++; return { ready: Promise.resolve(), setActive() {}, dispose() { disposes++; } }; } });
  const dispose = initHolographicCards(load); env.cleanup(dispose);
  assert.equal(initHolographicCards(load), dispose);
  for (let i = 0; i < 10; i++) {
    const { host, canvas } = env.card();
    canvas.dataset.hologramReady = "true";
    await flush(); assert.equal(canvas.dataset.hologramReady, undefined);
    env.intersections[0].notify(); await flush();
    host.remove(); await flush();
  }
  assert.equal(creates, 10); assert.equal(disposes, 10);
  assert.equal(env.intersections[0].targets.size, 0);
});

test("manager does not mount a removed card after lazy import resolves", async (t) => {
  const env = environment(t), { host } = env.card(), gate = deferred(); let creates = 0;
  const dispose = initHolographicCards(() => gate.promise); env.cleanup(dispose);
  env.intersections[0].notify(); host.remove(); await flush();
  gate.resolve({ createRenderer: () => { creates++; } }); await flush();
  assert.equal(creates, 0);
});

test("reduced motion, printing, hidden modals, and page restoration control lifecycle", async (t) => {
  const env = environment(t), { host } = env.card(); let creates = 0, disposes = 0; const states = [];
  const dispose = initHolographicCards(async () => ({ createRenderer: () => {
    creates++; return { ready: Promise.resolve(), setActive(v) { states.push(v); }, dispose() { disposes++; } };
  } })); env.cleanup(dispose);
  env.queries.get("(prefers-reduced-motion: reduce)").change(true);
  env.intersections[0].notify(); await flush(); assert.equal(creates, 0);
  env.queries.get("(prefers-reduced-motion: reduce)").change(false); await flush(); assert.equal(creates, 1);
  host.dataset.open = "false"; await flush(); assert.equal(states.at(-1), false);
  host.dataset.open = "true"; await flush(); assert.equal(states.at(-1), true);
  window.dispatchEvent(new window.Event("beforeprint")); assert.equal(disposes, 1);
  window.dispatchEvent(new window.Event("afterprint")); await flush(); assert.equal(creates, 2);
  window.dispatchEvent(new window.Event("pagehide")); assert.equal(disposes, 2);
  window.dispatchEvent(new window.Event("pageshow")); await flush(); assert.equal(creates, 3);
});

test("unsupported WebGPU keeps static cards without loading the renderer", async (t) => {
  const env = environment(t); env.card(); delete navigator.gpu;
  const dispose = initHolographicCards(() => { assert.fail("must not load WebGPU"); }); env.cleanup(dispose);
  env.intersections[0].notify(); await flush();
});
