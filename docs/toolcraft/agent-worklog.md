# Implementation Worklog

## Status

Mode: product

Chromish is an SVG-to-material Toolcraft product with a retained vgpu renderer, the original chrome plus five alternate finishes, an optional uploaded environment image, a seven-second playback timeline, runtime-owned image/video export, and downloadable GLB/vgpu kits.

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

### Delivery 6 — Restore chrome and upload-only backgrounds

- Request: Restore the original Chrome material, remove the hardcoded background image, keep user background upload, and make the default background color work.
- Task type: Later Tier 3 focused material-schema, media-default, background fallback, renderer, acceptance, and export correction.
- User-visible result: Chrome is again the default finish alongside the five alternatives; the app starts without an image; Background color is the active default; and an uploaded image replaces that color only after its GPU texture is ready.
- Source/reference checked: The user's reported behavior, original chrome WGSL branch, current Toolcraft background/media contract, current vgpu texture lifecycle, and existing preview/export state mapping.
- Reference inputs: No new visual or motion input; this request restores previously approved original behavior and changes environment ownership to upload-only.
- Docs/contracts read: `workflow.md`, `decision-contract.md`, `core/runtime-boundary.md`, `core/control-selection.md`, `core/layout.md`, `core/performance.md`, `core/setup-export.md`, `core/media-upload.md`, `schema-reference.md`, `component-rules.md`, `renderer-technique.md`, `performance.md`, and `acceptance-testing.md`.
- Contract rules applied: canvas-surface-preserved, controls-product-coverage, output-export-required, persistence-policy-explicit, acceptance-product-observable, renderer-technique-inventory, and workflow-required.
- View interaction intent: Orbit remains unchanged across Chrome and every alternative finish.
- Interaction ownership: FileDrop remains the sole owner of optional image import/removal/transforms; the built-in Background color remains the panel-owned fallback; canvas owns no duplicate background action.
- Decision: Restore the original procedural chrome equations as material index zero and schema default; remove `media.defaultAssets`; retain the Environment Image uploader; gate image compositing on successful texture readiness rather than asset metadata; fall back immediately to the runtime Background color after removal, reset, loading, or failure.
- Alternatives rejected: Keeping Chrome as an undocumented diamond approximation, retaining a hidden bundled image, using a remote image URL, disabling the standard Background color, and treating an unresolved presentation URL as a ready texture.
- State/output mapping: `material.type=chrome` selects the original studio/reflection/Fresnel branch; `appearance.background` feeds preview/export when no ready image exists; successful `media.backgroundImage` upload switches the shared tone-map/refraction texture; removal/reset returns to the color path.
- Performance intent: ordinary-product-work; this restores constant-cost branches and removes startup media decode, so no measured performance authority exists.
- Verification: Focused schema/product/renderer/media/export tests, production build, code health, and material/background feature selection only; no repeated delivery or measured performance run.
- Risks: Browser visual proof still requires an available Chromium binary; failed image decode intentionally leaves the selected background color visible and reports feedback.

### Delivery 7 — Repair uploaded environment texture transfer

- Request: Investigate and fix the black canvas background when Background color or an uploaded Environment Image is selected, and consult the vgpu skill.
- Task type: Later Tier 3 focused WebGPU texture-upload, background-compositing, and browser-outcome repair.
- User-visible result: Uploaded environment pixels replace the fallback color after a successful GPU transfer; removing the image immediately restores the selected Background color instead of leaving a black frame.
- Source/reference checked: The user-prepared live canvas with `campfire.svg` and `hassaan-here-bKfkhVRAJTQ-unsplash.jpg`, the T3 browser screenshot and rendering console, vgpu 0.4 `Texture`/effect guidance, and the existing media/render pipeline.
- Reference inputs: No new product reference input; the user's live uploaded SVG and image are defect-reproduction fixtures only.
- Docs/contracts read: `workflow.md`, `decision-contract.md`, `core/runtime-boundary.md`, `core/performance.md`, `core/setup-export.md`, `core/media-upload.md`, `schema-reference.md`, `component-rules.md`, `renderer-technique.md`, `acceptance-testing.md`, and `performance.md`.
- Workflow fallback: The named brainstorming, writing-plans, and systematic-debugging skills were unavailable; the signed local workflow and the available investigation-mode and vgpu skills supplied the equivalent diagnosis and planning path.
- Contract rules applied: canvas-surface-preserved, controls-product-coverage, output-export-required, persistence-policy-explicit, acceptance-product-observable, renderer-technique-inventory, performance-coverage-levels, and workflow-required.
- View interaction intent: Orbit remains unchanged; the environment remains a renderer input and adds no canvas interaction owner.
- Interaction ownership: Environment upload/removal/transforms remain owned by the built-in FileDrop control, Background color remains the panel-owned fallback, and canvas interaction remains orbit/pan only.
- Decision: Allocate external-image textures with the complete WebGPU usage required by Dawn (`copy_dst`, `render_attachment`, and `texture_binding`), retain the existing source-scoped texture swap, and prove the uploaded pixels rather than relying only on a ready attribute.
- Alternatives rejected: Hiding the black frame with CSS, leaving the invalid texture bound while forcing the ready flag, duplicating the uploaded image as a DOM layer, or patching the signed Toolcraft runtime.
- State/output mapping: `media.backgroundImage` resolves to a presentation URL, transfers into the retained vgpu texture, and enables image composition only after success; `appearance.background` remains the preview/export fallback when no ready environment texture exists.
- Performance intent: ordinary-product-work; this is a localized correctness repair and does not authorize measured performance.
- Verification: Tier 3. Passed the focused vgpu renderer unit test (4 tests), `media.backgroundImage` and `appearance.background` product feature checks, TypeScript, production build, and code health (37 files). The shared browser retained the user's SVG and image, reported renderer/image ready, displayed the image behind the mesh with no texture-usage warning, and sampled 100% non-black pixels. Repeated delivery and measured performance checks were skipped because this is later feature work without performance authority.
- Risks: Native external-image validation is browser/driver-sensitive, so the browser proof must fail on any rendering warning and must inspect visible pixels in addition to readiness state.

### Delivery 8 — Intensify optical materials and make Fire visibly burn

- User correction, same batch: The user rejected the mosaic Diamond and lava/spike Fire after switching models. Re-analysis of the supplied images identifies large coherent internal reflections with narrow dispersion, and continuous turbulent combustion growing out of the silhouette. Replace invented facet patterns with bounded BVH traversal of the actual closed extrusion (source-scoped build, retained storage, Fresnel entry/exit and internal reflection). Replace the flame-card crown with alpha-seeded turbulent combustion in the existing composition pass, with padded export tiles. Keep the vgpu skill's native shader diagnostics and pixel checks; previous pass thresholds establish only rendering, not reference fidelity. Focused Tier 3 verification remains in force.

- Request: Make Diamond visibly refract like the supplied faceted crystal references, apply a similarly realistic and intensified optical treatment to Glass, and make Fire deform the object with animated flames like the supplied burning-letter reference.
- Task type: Later Tier 3 focused WebGPU material-shader, animated silhouette, and reference-parity iteration.
- User-visible result: Diamond and Glass trace the actual extrusion for entry/exit refraction and internal reflection, with distinct refractive indices, narrow dispersion, and neutral HDR studio panels. Diamond uses crisp geometric normals; Glass retains smooth surface normals. Fire grows irregular yellow/orange tongues from the rendered silhouette and heats the transition into the body, with timeline-driven deformation.
- Source/reference checked: The three user-supplied static images (two high-contrast faceted/prismatic crystal studies and one flame-engulfed wordmark), the live Diamond canvas with `campfire.svg` and the uploaded environment image, the existing HDR/tone-map pipeline, and vgpu draw/pass/shader workflow guidance.
- Reference inputs: The supplied PNGs are static visual targets, not motion-reference media; the existing typed motion reference remains unchanged. Their mapped cues are internal facet contrast and dispersion for Diamond, stronger transmission/Fresnel for Glass, and emissive flame tongues plus silhouette deformation for Fire.
- Docs/contracts read: `workflow.md`, `decision-contract.md`, `core/runtime-boundary.md`, `core/performance.md`, `core/timeline-animation.md`, `renderer-technique.md`, `performance.md`, and `component-rules.md`.
- Workflow fallback: The named brainstorming, writing-plans, and systematic-debugging skills remain unavailable; the signed local workflow, vgpu shader workflow, and investigation-mode skill supplied the equivalent reference analysis and implementation sequence.
- Contract rules applied: canvas-surface-preserved, timeline-mode-choice, timeline-enabled-behavior, controls-product-coverage, output-export-required, renderer-technique-inventory, renderer-view-interaction, acceptance-product-observable, performance-coverage-levels, and workflow-required.
- Animation intent: Existing playback timeline. Fire deformation and combustion consume the normalized forward loop phase; periodic noise advects exactly one 16-cell period per loop, while curl uses integer phase harmonics. Native pixels verify endpoint continuity and changing intermediate frames.
- View interaction intent: Orbit remains unchanged; material rendering consumes the shared camera pose but adds no camera or canvas interaction owner.
- Interaction ownership: Material selection and applicable color/optical parameters remain panel-owned; orbit remains canvas/gizmo-owned; timeline transport remains runtime-owned. No duplicate Fire or material controls are added.
- Decision: Keep the retained HDR geometry and composition passes. Build a stackless triangle BVH once per source mesh and retain its storage buffers, following the vgpu skill's storage/resource lifecycle guidance. Trace three spectral channels with up to five internal bounces. Remove fabricated facet patterns and flame cards. The composition pass finds and refines the actual silhouette crossing, then advects and erodes it into flames. Guarded export tiles include lateral, upper, and lower sampling neighbors. The standalone vgpu kit includes the same shaders and BVH buffers.
- Alternatives rejected: Static reference textures, a DOM fire overlay, a separate full-screen fire pass, a separate wall-clock animation, material-specific duplicate controls, a tile-local screen-space effect that would seam across export tiles, or patching the signed Toolcraft runtime.
- State/output mapping: `material.type` selects the optical/fire branch; environment image and Background feed refracted color; Reflection contrast and Studio rotation shape Diamond/Glass highlights; Primary and Accent color the Fire body/core; timeline loop phase drives both object rotation and cyclic flame deformation.
- Performance intent: ordinary-product-work. Source changes build the BVH within the existing enforced triangle boundary; three optical channels each allow five bounces and at most 512 BVH node visits per bounce. Fire uses at most 48 silhouette-search steps, stops at the first crossing, and refines it with five bisections; body heating uses eight upper-edge search steps plus five bisections. Resources remain retained and both passes declare timeline invalidation. No measured performance work is authorized or claimed.
- Verification: Tier 3 focused checks. Passed `test:feature -- material.type` (all seven applicable material/control scenarios), timeline playback/scrub/loop browser proof, native Fire start/end and intermediate pixel comparisons, and preview versus guarded tiled export with emitting geometry crossing both tile axes. Passed seven BVH/vgpu mock/standalone-kit tests, TypeScript, production build, and final code health (42 files). Native Diamond/Glass frames and a burning MUY wordmark were visually inspected under `.toolcraft/browser-artifacts`; the shared tab still resolves the user's uploaded SVG and environment, although its screenshot/click automation became unavailable. No repeated delivery or measured performance checks were run; no signed runtime files are edited.
- Risks: Refraction follows the uploaded extrusion, so a flat rectangular SVG still has flat parallel faces, not an invented gemstone cut. The bounded reflection depth can omit very long trapped paths. Fire is a silhouette-driven procedural combustion approximation, not a fluid solver; it is view-dependent but preview and export share full-output coordinates. GLB remains a standard-material approximation, while the vgpu kit carries these custom shaders. Numeric material thresholds detect regressions but do not establish visual reference fidelity; native frames were inspected separately.

### Delivery 9 — Real-time optics and generated gemstone cuts

- Request: the performance on glass and diamond kills my pc , also how can you achieve the gemetry of the gemstone cut that you mention? you are free to rewrite from scrach with your prefered method , you dont have to confine yourself to the existing work
- Task type: Later Tier 3 localized optical-rendering performance repair plus authorized gemstone geometry redesign.
- User-visible result: Replaced per-pixel BVH tracing with fixed-work Glass/Diamond shading and actual crown/table/girdle/pavilion geometry derived from the uploaded outline; no backing-resolution reduction.
- Source/reference checked: Previous three-channel/five-bounce/512-node-per-bounce BVH shader, uploaded SVG workflow, the two provided crystal PNGs, vgpu performance-model and shader-workflow guidance.
- Reference inputs: Existing static crystal PNGs; no new motion input.
- Docs/contracts read: workflow, decision-contract, core/runtime-boundary, core/performance, core/setup-export, core/media-upload, schema-reference, component-rules, renderer-technique, performance, acceptance-testing.
- Contract rules applied: renderer-technique-inventory, performance-coverage-levels, canvas-surface-preserved, output-export-required, renderer-view-interaction, workflow-required.
- View interaction intent: Existing orbit and view.orbit remain; hit testing and exports must use the selected cut mesh.
- Interaction ownership: Finish and geometry parameters remain panel-owned; canvas/gizmo owns orbit; runtime owns timeline, media, and export actions. No duplicate controls.
- Decision: Remove per-fragment mesh traversal and GPU optical storage entirely. Use a full-resolution, single-sample back-face normal target followed by fixed-count transmission, spectral environment samples, and Fresnel reflections. The existing chrome-hdr semantic stage owns both optical raster passes; non-optical materials skip the back-face pass. Generate a cached real cut mesh from outline-preserving outer contours and inner distance contours, with flat face normals. Keep the smooth original mesh for Glass/other materials. Source changes rebuild meshes; playback only updates uniforms. The vgpu skill guided retained targets, one frame submission, shader diagnostics, and a native GPU analytic-direction probe.
- Alternatives rejected: Reducing render scale, silently lowering SVG detail, retaining expensive rays under an adaptive toggle, fake painted facets, and rebuilding the runtime shell.
- State/output mapping: Diamond selects the cached cut geometry; Depth/Bevel shape the crown and pavilion; Glass selects the original smooth mesh; Studio rotation/contrast/exposure retain their light controls; preview and export share shader and selected geometry.
- Performance intent: performance-iteration
- Performance request evidence: "the performance on glass and diamond kills my pc"
- Performance paths: ["performance-path:%5B%22interactive-continuous%22%2C%22timeline-playback%22%2C%5B%22chrome-hdr%22%2C%22tone-map%22%5D%2C%5B%22gpu%22%5D%2C%5B%22preview-scale%22%5D%5D"]
- Focused checks: Tier 3 mesh topology/shader/kit tests, material and source geometry feature checks, native optical frames and current-source browser checks. Skip full audit and unrelated runtime/export matrices. Pre-code assessment has zero structural errors but exposes existing pending kernel candidates and an empty performance-adapter registry, which must not be misrepresented as passing measured evidence.
- Verification: `npm run verify:delivery`
- Focused results: Seventeen unit tests passed across source geometry, cut topology, mock shader/resource wiring, standalone kit build, and render-plan assessment. Native GPU optical frames pass clean-console, changing-reflection and visible-highlight checks; the exact shipped transmission function passes a GPU parallel-slab analytic direction probe. Material switching and Primary color browser checks pass; narrow dispersion is sampled at 512px rather than lost in the old 32px thumbnail. `npm run test:feature -- geometry.depth geometry.bevel` passes both protected feature scenarios. Production TypeScript/build, code health (45 files), and git diff whitespace checks pass. Final native Diamond/Glass images were visually inspected; these are real-time approximations, not asserted offline-render reference parity.
- Performance proof blocker: The authorized protected command stopped before measurement at signed-runtime integrity checks. No signed runtime files are modified in git. Read-only SHA-256 inspection of runtime/contracts/component-contract-builders.ts confirmed the raw Windows CRLF bytes differ, while LF-normalized bytes exactly match manifest hash 03d3b9c72608d17d2422862f0a520948a10f747610b97d04c691fd9f6685cd15. Do not rewrite signed files or fabricate a measurement receipt. The existing empty adapter registry and pending kernel candidates remain additional proof risks; no measured speedup or frame-rate claim is made.
- Regression result: Native Fire endpoint/intermediate animation and guarded tiled-export pixel comparison still pass after the optical rewrite.
- Risks: Exit normals are rasterized along the camera ray, not the exact refracted ray; one internal-reflection approximation replaces full path tracing. Narrow strokes can lack space for a large table; very thin sources fall back to the original extrusion. The outer silhouette and holes remain authored contours; inset contours use a bounded 384-square distance grid. GLB carries selected cut geometry with standard-material approximation; the vgpu kit carries the custom optical passes.

### Delivery 10 — Mesh-driven combustion

- Request: now for fire i would like for the flames to morph the mesh like in the ref image and also be performant , like i said before feel free to rewrite/remake from scratch
- Task type: Later Tier 3 focused Fire geometry, shader, and deterministic export redesign.
- User-visible result: Fire now selects a refined source mesh whose upper contours physically stretch and curl into incandescent tongues, retaining recognizable lower source shapes. Five local composite samples soften the edges; the previous silhouette-search loops are removed.
- Source/reference checked: Supplied burning-MUY PNG; existing weak vertex displacement and 48-step silhouette-search compositor; vgpu performance-model, shader-workflow and extraction guidance.
- Reference inputs: Existing static flame PNG; no new motion reference.
- Docs/contracts read: workflow, decision-contract, core/runtime-boundary, core/performance, core/timeline-animation, core/setup-export, core/media-upload, component-rules, schema-reference, renderer-technique, performance, acceptance-testing.
- Workflow fallback: Missing brainstorming/writing-plans/systematic-debugging skills are replaced by the signed local workflow. Browser-native GPU extraction remains the available verification path; no Node adapter dependency is added.
- Contract rules applied: renderer-technique-inventory, timeline-enabled-behavior, output-export-required, renderer-view-interaction, performance-coverage-levels, acceptance-product-observable, workflow-required.
- View interaction intent: Existing orbit remains; Fire picking must evaluate the same displacement at pointer-down.
- Interaction ownership: Existing Material/colors and geometry controls remain panel-owned; orbit is canvas/gizmo-owned and transport runtime-owned. No new controls or layers.
- Decision: Cache a conformingly subdivided Fire mesh once per source within the existing 100,000-triangle ceiling. Apply position-only, periodic upward tongue/curl displacement in the vertex stage. Replace long silhouette searches with a bounded local combustion composite; preserve full backing pixels and shared preview/export math. Keep continuous playback uniform-only and evaluate CPU picking only on demand.
- Alternatives rejected: Fluid simulation, per-pixel ray marching, particle populations growing over time, flat flame cards, resolution clamps, and per-frame CPU remeshing.
- State/output mapping: Fire selects the retained refined mesh; timeline phase drives forward cyclic flow and deformation; Primary/Accent color the body/core; image/video/vgpu-kit share the same shader, while GLB remains a standard-material approximation.
- Performance intent: ordinary-product-work. This is a feature redesign with a performance constraint, not a report that Fire currently misses a measured budget. Structural render-plan assessment passes; existing pending kernel requirements remain explicit. No full audit or measured performance is inferred.
- Verification: Tier 3 focused subdivision and deformation tests, native GPU/CPU deformation comparison, Fire frame/loop/tile regression, material/color and timeline browser checks, typecheck and code health. No repeated aggregate gate.
- Focused results: Eighteen unit tests pass, including conforming refinement, triangle cap, preserved area/winding, anchored base, phase continuity, shader/resource wiring, posed GLB bytes, standalone vgpu build and render-plan assessment. Native GPU deformation agrees with the CPU picking function within 0.0001; native frames pass changing pixels, loop seam, guarded tiled export and clean console assertions. Material selection, Primary/Accent applicability and timeline playback/scrub/pause/duration/loop browser checks pass. Production build and final typecheck pass; code health passes at 48 files after separating surface WGSL from renderer lifecycle. Native front, middle-phase and angled wordmark images were inspected. No measured performance run or FPS claim.
- Browser handoff: agent-browser CLI is unavailable; existing protected Playwright plus the available T3 preview provide the local fallback. Restarted dev server on port 3002. Live tab reports renderer ready, no Vite overlay, Fire deforming-mesh with 69,488 triangles, and the user's campfire.svg and uploaded environment JPG intact. GLB bakes the current Fire pose; the vgpu kit retains animated vertex deformation. The vgpu skill guided retained geometry, uniform-only playback and numeric GPU extraction.
- Risks: Procedural mesh combustion is not a fluid solver. Extreme source complexity can exhaust the refinement budget; original triangles are never discarded. Prior protected-runtime CRLF integrity and performance-fixture gaps remain unresolved.

### Delivery 11 — richer material editing and chrome studio response

Request: Improve Chrome, expose many more per-material controls, and choose useful general controls without clarification.
Decision: Add four independent numeric properties for each of six finishes, plus object scale, field of view, and foreground saturation. Keep existing shared properties compatible. Split the material entity into shared appearance and four-control finish-specific stages; inactive branches are absent. Improve chrome with directional studio softboxes, roughness broadening, brushed micro-normal detail, conductor reflection and edge highlights. All new values are runtime-owned, persisted and exported; Fire picking and GLB baking use the same deformation amplitudes as the shader.
Reference: Existing user gemstone/fire stills and current shader implementation; no new motion reference. Existing seven-second forward loop, layers, orbit ownership, and runtime image/video export remain unchanged. General composition edits belong to the panel, while object orbit remains canvas-owned.
Rules: controls-section-inventory-required, controls-product-coverage, renderer-technique-inventory, interaction-surface-ownership, persistence-policy-explicit, output-export-required. vgpu guidance keeps these edits uniform-only and requires real pixel checks. Missing brainstorming/writing-plans/systematic-debugging skills use the signed local workflow fallback.
Plan: Declare catalog, inventory, schema and invalidation; assess retained render plan; implement shader and preview/export/picking mappings; run focused unit and real-browser material outcomes and inspect Chrome pixels. Reject ray tracing, extra render passes, geometry rebuilds on material sliders, and background-wide saturation.
Verification tier: Tier 3 (later focused edit).
Run: ai:check; render-plan and customization/material/export unit tests; focused material and composition browser acceptance; native GPU control pixel checks and Chrome screenshot.
Skip: aggregate delivery, full browser suite and measured performance; this request is ordinary feature work, not new performance authority. Existing bounded geometry and selected backing resolution are preserved. Portable GLB remains an approximation of procedural shading.
Task type: renderer and material-control feature iteration.
User-visible result: four additional controls for each finish, three composition controls, and a chrome studio response with broad fill, shaped highlights and optional image reflections.
State/output mapping: material-specific runtime targets pack into the selected shader's vec4; composition targets feed model scale, projection FOV and foreground-only grading. Image/video rendering and vgpu kits use those same settings; GLB exports preserve scale and bake the selected Fire amplitudes while approximating procedural appearance with portable PBR properties.
Performance intent: ordinary feature work; no new measured-performance authority or claims.
Verification: 27 focused feature scenarios passed with protected runtime output evidence. A separate wide-viewport browser test exercised all 27 values against unobscured object pixels, checked all six conditional branches, and verified every new value plus identical rendered output after reload. Three native GPU checks passed for all knobs and Chrome roughness, numerical softbox math, customized Fire CPU/GPU deformation and loop/tiled exports, and refractive optics. Fourteen focused unit tests passed across customization/inventory, render plan, Fire geometry, vgpu bindings and kit export/build. Typecheck, code health, native vgpu doctor and both composed WGSL validations passed. Chrome softbox Node readback agreed with the CPU reference within 2/255 quantization tolerance. No aggregate delivery or measured performance suite ran.
Debugging evidence: the first reload pixel comparison included the floating sidebar at two different scroll positions; renderer parameters matched exactly. Moving the fixture to a 1920px viewport excluded UI from the product capture, and both pixel equality and restored controls passed. The final live user preview remained ready with its background image intact.
Risks: GLB shading is intentionally approximate, and actual FPS has not been benchmarked. Existing shared color/roughness settings remain shared for compatibility; the 24 new material-specific properties persist independently.
Status: implemented and focused verification passed.

## Evidence

- Source reviewed: `/Users/sw/Desktop/Screen Recording 2026-09-03 at 9.47.09 PM.mov` and `video-reference/2026-09-03-chrome-emblem/contact-sheet.png`.
- Contract applied: Toolcraft runtime boundaries and vgpu resource-stability, explicit-depth, two-pass, prewarming, external-timeline, and deterministic-testing guidance.
- Motion reference study: referenceId=motion-reference-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf; studyId=motion-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf; sourceSha256=ef550a988daab09e1f573d4936a07e2ad9dd0e22b4c3d234f072ddcc43553dca; timingMode=seconds; contactSheetPath=src/app/reference-studies/motion-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf/contact-sheet.png; review=real-time,slowed.

## Verification

Protected receipts own the initial delivery command, selected scenarios, build, artifacts, and pass/fail evidence. Product-focused unit, shader, kit, browser, and render checks supplement that receipt.

## Risks

- Risk: WebGPU availability and browser codec support are explicit runtime requirements; unavailable capabilities produce actionable product feedback without a static or WebGL fallback.
- Risk: Malformed, unsafe, empty, or over-complex SVGs retain the previous valid mesh until the source is deliberately removed.
