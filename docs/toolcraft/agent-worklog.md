# Implementation Worklog

## Status

Mode: product

Chromish is an SVG-to-chrome Toolcraft product with a retained vgpu renderer, a seven-second playback timeline, runtime-owned image/video export, and downloadable GLB/vgpu kits.

The first product delivery uses `npm run verify:delivery`. Later feature work uses focused acceptance. A localized performance complaint may authorize one targeted iteration; only exact request authority permits measured targeted performance. A complete performance audit remains separately user-authorized through `npm run verify:perf`.

## Decisions

### Renderer

- Decision: Render exclusively with a retained two-pass vgpu WebGPU renderer using inline WGSL, an HDR color target, explicit depth, and filmic tone mapping.
- Reason: The requested chrome look depends on stable reflection bands and deterministic GPU frames without a WebGL fallback.
- Evidence: `src/app/chromish/vgpu-renderer.ts`, `src/app/chromish/renderer-pipeline.ts`, and `src/app/app-performance.ts`.

### View Interaction

- Decision: Use orbit view interaction with one shared camera pose for the object and orientation gizmo.
- Reason: A shallow extruded object needs direct spatial inspection while preserving canvas-miss panning.
- Evidence: `src/app/chromish/chromish-canvas.tsx` and `appProductReadiness.viewInteraction`.

### Interaction Ownership

- Decision: The canvas owns object and gizmo orbit; panel controls own geometry, material, motion, source, and delivery settings.
- Reason: Each operation has one primary interaction surface and one canonical target.
- Evidence: `appProductReadiness.interactionOwnership` and the `view.orientation` acceptance row.

### Timeline

- Decision: Use Toolcraft playback with a seven-second looping duration and map every cycle to exactly one signed revolution.
- Reason: Toolcraft must own playback, scrubbing, pause, resume, persistence, and export time.
- Evidence: `src/app/app-schema.ts`, `src/app/chromish/chromish-canvas.tsx`, and the `timeline.playback` acceptance row.

### Layers

- Decision: Do not enable Layers.
- Reason: Chromish accepts one SVG and produces one normalized chrome object.
- Evidence: `appSchema.panels.layers` is omitted.

### Controls

- Decision: Use built-in Toolcraft controls grouped by SVG, geometry, chrome, motion, background, image export, and video export entities.
- Reason: Every requested setting maps directly to runtime state and visible product output without custom control UI.
- Evidence: `src/app/chromish/control-sections.ts` and `appControlSectionInventory`.

### Export

- Decision: Keep PNG/JPG and MP4/WebM runtime-owned through one export renderer; implement GLB and vgpu kits as bounded asynchronous ZIP actions.
- Reason: Runtime export preserves Toolcraft timing and canvas rules while the kits require additional interoperable files.
- Evidence: `src/app/chromish/export-renderer.ts`, `src/app/chromish/kits.ts`, and `src/app/app-composition.tsx`.

### Performance

- Decision: Preserve selected render scale, retained GPU resources, explicit invalidation, and deterministic tiled export with no adaptive quality.
- Reason: Geometry rebuilds should occur only for source/detail/depth/bevel changes, while playback and material changes remain uniform-only.
- Evidence: `src/app/app-performance.ts`, `src/app/chromish/renderer-pipeline.ts`, and the installed vgpu skill guidance.

## Decision Trail

### Delivery 1 — Chromish product build

- Request: Build Chromish as a Toolcraft app that converts one SVG silhouette into a rotating beveled chrome object with controls and downloadable outputs.
- Task type: Schema, SVG processing, WebGPU renderer, timeline, orbit interaction, persistence, export, acceptance, and delivery.
- User-visible result: Uploading a safe SVG creates a centered chrome extrusion that orbits, rotates seamlessly, responds to all requested controls, and exports images, video, GLB, and a standalone vgpu project.
- Source/reference checked: The screen recording, extracted timecoded frames, contact sheet, Toolcraft contracts, installed vgpu package documentation, and official vgpu examples.
- Reference inputs: The saved chrome-emblem motion study supplies rotation rhythm, shallow depth, centered composition, and cool high-contrast reflection banding while cursor and bottom-edge artifacts are excluded.
- Docs/contracts read: `workflow.md`, `core/reference-study.md`, `core/runtime-boundary.md`, `core/assembly-workflow.md`, `core/control-selection.md`, `core/layout.md`, `core/performance.md`, `core/timeline-animation.md`, `core/setup-export.md`, `core/media-upload.md`, `schema-reference.md`, `component-rules.md`, `renderer-technique.md`, `performance.md`, and `acceptance-testing.md`.
- Contract rules applied: runtime-shell-required, controls-product-coverage, interaction-surface-ownership, renderer-view-interaction, output-export-required, persistence-policy-explicit, acceptance-product-observable, and performance-coverage-levels.
- View interaction intent: Orbit is the primary 3D view interaction; the object and orientation gizmo share one pose, and canvas misses continue to the runtime pan owner.
- Interaction ownership: Canvas owns mesh hit-test orbit and orientation-gizmo orbit; panel controls own settings; Toolcraft owns timeline, persistence, finite/infinite canvas behavior, and image/video export.
- Decision: Sanitize and classify the SVG, use direct transformed vector contours when supported, trace browser-rasterized alpha for unsupported visual features, build CPU extrusion/raycast/GLB geometry with Three.js, and render only through vgpu.
- Alternatives rejected: WebGL fallback, Three.js rendering, external HDR assets, adaptive quality, an independent animation loop, storing GPU objects in Toolcraft state, and clearing a previous valid mesh after a failed replacement upload.
- State/output mapping: Runtime media and control values feed the mesh pipeline; timeline progress and orbit pose feed stable uniforms; the retained mesh feeds preview, raycasting, deterministic export, CHRMSH serialization, and GLB generation.
- Performance intent: ordinary-product-work
- Verification: npm run verify:delivery
- Risks: Browser SVG rasterization can vary slightly at alpha edges; strict complexity and triangle caps fail visibly instead of silently reducing quality, and GLB chrome is an approximate portable PBR representation.

### Delivery 2 — Rounded chrome normal smoothing and publication

- Request: Remove the jagged horizontal reflection lines visible on rounded SVG shapes, then create and publish the repository and Vercel site.
- Task type: Later Tier 3 renderer/canvas visual-quality fix followed by repository and production deployment delivery.
- User-visible result: Curved extrusion walls interpolate continuous crease-aware normals, removing dense faceted scanlines while retaining the broad procedural chrome reflection bands and beveled profile.
- Source/reference checked: The user-supplied rounded-emblem screenshot, the live persisted SVG in the local app, Three.js extrusion output, Toolcraft renderer contracts, and installed vgpu guidance.
- Reference inputs: `/var/folders/3d/5why0q955pz555bz4521y4xc0000gn/T/codex-clipboard-0f265585-ee88-4b38-8259-0210f95decef.png` supplied as focused visual-defect evidence; the existing typed motion study remains the product reference input.
- Docs/contracts read: `workflow.md`, `decision-contract.md`, `core/runtime-boundary.md`, `core/performance.md`, `component-rules.md`, `renderer-technique.md`, `performance.md`, and `acceptance-testing.md`.
- Contract rules applied: canvas-surface-preserved, renderer-technique-inventory, acceptance-product-observable, performance-coverage-levels, and workflow-required.
- View interaction intent: Orbit remains unchanged; smoothed normals affect the same mesh seen by every pose without creating a second interaction surface.
- Interaction ownership: No ownership change; canvas orbit and panel material/geometry controls retain their existing targets.
- Decision: Convert indexed input when necessary, then compute 60-degree crease-aware normals using a high-precision normalized-space weld before serializing the retained CPU mesh.
- Alternatives rejected: Increasing render scale, increasing curve subdivisions beyond the requested Fine setting, lowering reflection contrast, blurring the tone-map result, and flattening all normals. Those approaches either hide the symptom, reduce chrome fidelity, or soften intended hard edges.
- State/output mapping: Source/detail/depth/bevel mesh rebuilds now publish the smoothed normal buffer to vgpu preview, deterministic exports, GLB, and CHRMSH output; all uniforms and timeline behavior remain unchanged.
- Performance intent: ordinary-product-work; this is visual-correctness work and does not authorize measured performance.
- Verification: Focused mesh-normal unit test, TypeScript, `renderer.chrome` feature acceptance, WGSL validation, production build, and deployed-site smoke check.
- Risks: Deliberately sharp corners remain split above the crease angle; very low-poly source silhouettes still preserve their authored polygonal outline.

## Evidence

- Source reviewed: `/Users/sw/Desktop/Screen Recording 2026-09-03 at 9.47.09 PM.mov` and `video-reference/2026-09-03-chrome-emblem/contact-sheet.png`.
- Contract applied: Toolcraft runtime boundaries and vgpu resource-stability, explicit-depth, two-pass, prewarming, external-timeline, and deterministic-testing guidance.
- Motion reference study: referenceId=motion-reference-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf; studyId=motion-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf; sourceSha256=ef550a988daab09e1f573d4936a07e2ad9dd0e22b4c3d234f072ddcc43553dca; timingMode=seconds; contactSheetPath=src/app/reference-studies/motion-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf/contact-sheet.png; review=real-time,slowed.

## Verification

Protected receipts own the initial delivery command, selected scenarios, build, artifacts, and pass/fail evidence. Product-focused unit, shader, kit, browser, and render checks supplement that receipt.

## Risks

- Risk: WebGPU availability and browser codec support are explicit runtime requirements; unavailable capabilities produce actionable product feedback without a static or WebGL fallback.
- Risk: Malformed, unsafe, empty, or over-complex SVGs retain the previous valid mesh until the source is deliberately removed.
