# Implementation Worklog

## Status

Mode: product

Chromish is an SVG-to-material Toolcraft product with a retained vgpu renderer, five selectable finishes, a seven-second playback timeline, runtime-owned image/video export, and downloadable GLB/vgpu kits.

The first product delivery uses `npm run verify:delivery`. Later feature work uses focused acceptance. A localized performance complaint may authorize one targeted iteration; only exact request authority permits measured targeted performance. A complete performance audit remains separately user-authorized through `npm run verify:perf`.

## Decisions

### Renderer

- Decision: Render exclusively with a retained two-pass vgpu WebGPU renderer using inline WGSL, a source-scoped environment texture, an HDR color target, explicit depth, and filmic tone mapping.
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

- Decision: Use built-in Toolcraft controls grouped by SVG, geometry, material, motion, environment image, background, image export, and video export entities; material-specific colors and optical parameters appear only for applicable finishes.
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

### Delivery 3 — Switchable procedural materials

- Request: Add diamond with transparency and refraction, colorable shiny plastic, glass, fire, and playdough while continuing to use Vercel's vgpu.
- Task type: Later Tier 3 schema, conditional controls, retained WebGPU shader, portable kit, acceptance, and browser feature work.
- User-visible result: The Material section now switches the uploaded extrusion among five distinct finishes; only plastic, fire, and playdough expose useful colors, while optical controls remain focused on diamond and glass.
- Source/reference checked: The five supplied material reference images, current Chromish renderer structure, Toolcraft workflow/contracts, and the installed vgpu skill.
- Reference inputs: The prompt images are static visual direction for clear diamond/glass, glossy warm plastic, emissive fire, and soft rounded playdough; they introduce no motion-reference preprocessing requirement.
- Docs/contracts read: `workflow.md`, `core/control-selection.md`, `core/layout.md`, `core/runtime-boundary.md`, `core/performance.md`, `schema-reference.md`, `component-rules.md`, `renderer-technique.md`, `performance.md`, and `acceptance-testing.md`.
- Contract rules applied: controls-product-coverage, controls-section-inventory-required, interaction-surface-ownership, renderer-technique-inventory, renderer-view-interaction, acceptance-product-observable, persistence-policy-explicit, and workflow-required.
- View interaction intent: Orbit remains unchanged and every finish consumes the same camera pose, geometry, hit test, preview, and export framing.
- Interaction ownership: The panel exclusively owns finish and material-property selection; canvas drag remains the complementary spatial orbit operation.
- Decision: Keep one retained vgpu draw pipeline and select five WGSL branches with uniforms. Diamond uses IOR 2.42 dispersion and Fresnel transparency; glass uses IOR 1.52 refraction; plastic uses colorable diffuse/specular shading; fire uses timeline-coherent emissive turbulence; playdough uses wrapped diffuse and broad soft highlights.
- Alternatives rejected: Separate renderer instances or pipelines per finish, texture downloads, custom material UI, always-visible irrelevant colors, WebGL/Three rendering, and duplicating material selection on the canvas.
- State/output mapping: `material.type`, primary/accent colors, roughness, reflection contrast, studio rotation, exposure, timeline phase, and orbit pose feed retained shader uniforms shared by preview and runtime export; GLB maps the selected finish to a portable physical-material approximation and the vgpu kit preserves the exact shader branch.
- Performance intent: ordinary-product-work; the material selector changes a constant-cost shader branch and does not authorize measured performance.
- Verification: Focused schema/product, vgpu mock, kit, typecheck, code-health, feature-browser, and screenshot checks only; the existing initial delivery receipt is not rerun.
- Risks: Refraction is a screen-space environment approximation rather than traced scene geometry, and portable GLB cannot reproduce the exact fire turbulence or diamond dispersion.

### Delivery 4 — Uploadable refraction environment

- Request: Allow a background image for testing transparency, reflection, and refraction, with the supplied Unsplash image as the default.
- Task type: Later Tier 3 media source, default asset, retained texture, shader sampling, export, persistence, acceptance, and browser feature work.
- User-visible result: A new Environment Image uploader starts with the supplied 1632×918 pastel landscape, supports replacement/removal/rotate/flip/reset, fills the canvas by cover-cropping, and visibly passes through distorted diamond and glass surfaces.
- Source/reference checked: The user-supplied image attachment corresponding to Unsplash photo `photo-1638742385167-96fc60e12f59`, current Toolcraft image media lifecycle, existing vgpu renderer, Toolcraft contracts, and vgpu texture/device documentation.
- Reference inputs: The supplied static 1632×918 background image is embedded as a Toolcraft default image asset; it is visual source content rather than a motion reference.
- Docs/contracts read: `workflow.md`, `core/control-selection.md`, `core/layout.md`, `core/runtime-boundary.md`, `core/performance.md`, `core/setup-export.md`, `core/media-upload.md`, `schema-reference.md`, `component-rules.md`, `renderer-technique.md`, `performance.md`, and `acceptance-testing.md`.
- Contract rules applied: canvas-no-app-ui, canvas-surface-preserved, controls-product-coverage, controls-section-inventory-required, output-export-required, persistence-policy-explicit, renderer-technique-inventory, acceptance-product-observable, and workflow-required.
- View interaction intent: Orbit remains unchanged; the environment is a non-interactive renderer input and does not create a second camera or canvas gesture.
- Interaction ownership: The panel exclusively owns environment upload, removal, and transforms through built-in FileDrop actions; canvas continues to own only object orbit and viewport movement.
- Decision: Store the supplied image through `media.defaultAssets`, resolve all replacement assets through Toolcraft presentation URLs, transform the bitmap before one retained GPU upload, cover-crop it in shader coordinates, and sample it with material-dependent offsets for diamond and glass refraction.
- Alternatives rejected: A remote hotlink, CSS-only background, runtime-default-media overlay, custom upload UI, localStorage image bytes, or a decorative background that export/refraction cannot consume.
- State/output mapping: `media.backgroundImage` owns the durable image and transforms; the canvas resolves its repository URL and updates one retained vgpu texture; preview and runtime export share cover coordinates while diamond/glass sample displaced UVs and the tone pass composites the same image behind transparent fragments.
- Performance intent: ordinary-product-work; image decode/upload happens only on source or transform change and does not authorize measured performance.
- Verification: Focused schema/product/media, vgpu mock, kit, WGSL reflection, typecheck, code-health, and feature-browser checks only; the initial delivery receipt is not rerun.
- Risks: The environment is a 2D refraction plate rather than a cubemap, and the standalone downloadable vgpu kit keeps its portable neutral fallback until environment bytes are packaged separately.

### Delivery 5 — Deployment and review repairs

- Request: Fix the Vercel TypeScript deployment failure and address the persistence migration, fire seam, conditional applicability proof, and GLB accent review findings.
- Task type: Later Tier 3 focused build, persistence, timeline-renderer, acceptance-evidence, and artifact-fidelity repair.
- User-visible result: Production compilation succeeds, existing v1 workspaces remain discoverable while schema payload version 3 migrates, Fire stitches at the loop boundary, all material branches receive applicability evidence, and GLB Fire/Plastic approximations retain Accent.
- Source/reference checked: The supplied Vercel build log, four Codex review comments, current Toolcraft persistence bootstrap, timeline contract, acceptance applicability helpers, Three.js physical material export, and current vgpu shader.
- Reference inputs: No new visual or motion inputs; the deployment log and review comments are defect evidence against the existing product behavior.
- Docs/contracts read: `workflow.md`, `decision-contract.md`, `core/runtime-boundary.md`, `core/control-selection.md`, `core/layout.md`, `core/performance.md`, `core/timeline-animation.md`, `core/setup-export.md`, `core/media-upload.md`, `schema-reference.md`, `component-rules.md`, `renderer-technique.md`, `performance.md`, and `acceptance-testing.md`.
- Contract rules applied: persistence-policy-explicit, timeline-enabled-behavior, controls-product-coverage, acceptance-product-observable, output-export-required, renderer-technique-inventory, and workflow-required.
- View interaction intent: Orbit remains unchanged; all repairs preserve the shared view target and do not add another interaction surface.
- Interaction ownership: No ownership change; panel material controls and built-in media actions remain complementary to canvas orbit.
- Decision: Narrow the default-media discriminated union before reading `dataUrl`; restore the stable v1 storage key while retaining payload version 3; derive fire noise only from integer-harmonic sine/cosine loop phase; enumerate all five material applicability cases through protected helpers; map Accent to GLB emissive/specular properties.
- Alternatives rejected: Casting away the schema error, changing Vercel configuration, abandoning prior storage, hiding the fire seam with end-frame clamping, unscoped browser evidence, and documenting GLB color loss as unavoidable.
- State/output mapping: Timeline progress maps to `0..2π` fire phase and identical endpoint offsets; persistence reads the original key and migrates versioned payloads; conditional controls prove visible output only in accepted branches; secondary color feeds WebGPU plus GLB Fire emissive and Plastic specular properties.
- Performance intent: ordinary-product-work; these are correctness repairs and do not authorize measured performance.
- Verification: Production `npm run build`, focused schema/product/shader/kit tests, code health, and material feature selection; no repeated delivery or measured performance run.
- Risks: Browser acceptance still depends on a locally available Playwright Chromium binary; the container's CDN policy may prevent downloading it.

## Evidence

- Source reviewed: `/Users/sw/Desktop/Screen Recording 2026-09-03 at 9.47.09 PM.mov` and `video-reference/2026-09-03-chrome-emblem/contact-sheet.png`.
- Contract applied: Toolcraft runtime boundaries and vgpu resource-stability, explicit-depth, two-pass, prewarming, external-timeline, and deterministic-testing guidance.
- Motion reference study: referenceId=motion-reference-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf; studyId=motion-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf; sourceSha256=ef550a988daab09e1f573d4936a07e2ad9dd0e22b4c3d234f072ddcc43553dca; timingMode=seconds; contactSheetPath=src/app/reference-studies/motion-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf/contact-sheet.png; review=real-time,slowed.

## Verification

Protected receipts own the initial delivery command, selected scenarios, build, artifacts, and pass/fail evidence. Product-focused unit, shader, kit, browser, and render checks supplement that receipt.

## Risks

- Risk: WebGPU availability and browser codec support are explicit runtime requirements; unavailable capabilities produce actionable product feedback without a static or WebGL fallback.
- Risk: Malformed, unsafe, empty, or over-complex SVGs retain the previous valid mesh until the source is deliberately removed.
