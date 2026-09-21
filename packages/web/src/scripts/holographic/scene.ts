import { effect, sampler, texture, type Gpu, type Surface } from "vgpu";

export function artworkGeometry(output: Surface) {
  const [width] = output.size;
  const size = Math.min(252 * output.dpr, width * 0.78);
  return [width - size / 2 - 8 * output.dpr, size / 2 + 8 * output.dpr, size, size];
}

export function createScene(gpu: Gpu, output: Surface, bitmap: ImageBitmap, source: string) {
  const molecule = texture(gpu, {
    kind: "2d", size: [bitmap.width, bitmap.height], format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst", "render_attachment"], label: "substance-molecule-mask",
  });
  gpu.gpu.queue.copyExternalImageToTexture(
    { source: bitmap }, { texture: molecule.gpu }, [bitmap.width, bitmap.height],
  );
  return effect(gpu, source, {
    label: "substance-hologram",
    set: {
      params: {
        resolution: output.size, tilt: [0, 0], pointer: [0.2, -0.25], hover: 0,
        lightScheme: 0, artwork: artworkGeometry(output),
      },
      molecule,
      linear: sampler(gpu, { minFilter: "linear", magFilter: "linear" }),
    },
  });
}
