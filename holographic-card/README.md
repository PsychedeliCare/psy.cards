# Holographic Card source and adaptation

The five example files in this directory are an **unmodified, checksum-verified**
copy of [vgpu's Holographic Card](https://vgpu.sh/examples/holographic-card), pulled
with `npx vgpu examples pull holographic-card --out ./holographic-card`.

- Upstream: [vercel-labs/vgpu](https://github.com/vercel-labs/vgpu), MIT, copyright Vercel, Inc.
- Revision: `d5a0f73cd324db6cc44806222ca77fc5045ac5c315a3d02236911533ede8186a`
- Aggregate SHA-256: `7855eb828f858f8efc7d20805665e0b6980796d925b6af3e08b48ff52f25c144`
- Individual checksums: `source.json`; license text: `LICENSE`.

## App integration

The adapted renderer lives in `packages/web/src/scripts/holographic/`; its document
manager is `packages/web/src/scripts/holographic-cards.ts`. The upstream React
wrapper is reference material only, and the app adds no React dependency.

The shader retains the original plane projection, wavelength diffraction,
pearlescent palette, etched contours, grain, and spectral echo. A transparent
molecule texture replaces the triangle and lettering. Premultiplied transparent
output lets Astro keep all card text, category colors, links, and scrolling in
the DOM. Only header artwork tilts (about 5°/3°); touch moves light without
intercepting scrolling. There are no motion-sensor permissions.

Molecule masks are generated directly from the existing SMILES data using the
existing SmilesDrawer/resvg pipeline. `pnpm molecules:web` writes 25 monochrome
1024×1024 PNGs to `packages/web/public/assets/molecules/`. It rejects invalid
structures instead of creating placeholders. The default iOS generator output
is unchanged. Web builds regenerate the masks, and the existing PWA precache
includes them. Substance classes retain the dataset's representative structure.

Each visible full card owns its vgpu context. DPR is capped at 2 and animation at
60 fps; settled and hidden artwork stops requesting frames. The manager observes
fragment insertion/removal, modal visibility, page visibility, reduced motion,
printing, and back/forward-cache lifecycle. Disposal aborts pending fetches,
closes decoded bitmaps, removes listeners/observers, and uses vgpu's ordered GPU
resource cleanup. The original SVG stays visible until the first valid frame
and returns if initialization, shader compilation, or device operation fails.

WebGPU is a progressive enhancement. Reduced motion, printing, missing WebGPU,
or GPU failure keep the existing static molecule. Compact list cards and combo
cards are unaffected. Node/Dawn native install scripts are disabled because this
integration uses the browser entry point and mock-based lifecycle tests.

## Verification

- `pnpm test:holograms`: lifecycle regression tests using jsdom and `vgpu/mock`.
- `pnpm build`: source provenance check, mask generation, and static/PWA build.
- Check the existing development server for pointer reflection, text selection,
  modal scrolling, card replacement, and localized layouts.

The source registry was also refreshed to reflect previously committed locale
changes; this corrects its stale provenance check without changing source content.
