# Chromish

Chromish turns an uploaded SVG silhouette into a beveled, rotating chrome object. It is built with the Toolcraft app runtime and renders through vgpu/WebGPU.

## Features

- Safe SVG import with vector extrusion and alpha-tracing fallback
- Crease-smoothed beveled geometry for clean rounded reflections
- Procedural chrome material, orbit interaction, and a seamless seven-second loop
- PNG/JPG and MP4/WebM export
- Downloadable GLB and standalone vgpu embed kits

## Local development

```bash
npm install
npm run dev
```

Chromish requires a modern browser with WebGPU support.

## Verification

```bash
npm run typecheck
npm run build
```
