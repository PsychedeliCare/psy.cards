import source from "./shader.wgsl?raw";
import { createRenderer as create } from "./renderer.ts";

export function createRenderer(canvas: HTMLCanvasElement, host: HTMLElement, url: string, onFailure: (error: unknown) => void) {
  return create(canvas, host, url, source, onFailure);
}
