import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftMotionReferenceEvidence,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import motionEvidenceJson from "./reference-studies/motion-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf/evidence.json" with { type: "json" };
import { appSchema } from "./app-schema";
import { chromishTargets } from "./chromish/control-sections";

const motionEvidence = motionEvidenceJson as unknown as ToolcraftMotionReferenceEvidence;
const referenceId = "motion-reference-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf" as const;
const studyId = "motion-v1-b740d39516f721df08c2042f2c6929642f9faae0712087006ac9ec5e3e46b0cf";

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: {
    loopDuration: {
      evidence: "The user explicitly requested one seamless seven-second 360-degree cycle.",
      seconds: 7,
      source: "user-request",
    },
    mode: "timeline-playback",
  },
  mode: "new-toolcraft-app",
  referenceInputs: [
    {
      behaviors: [
        {
          acceptanceId: "timeline.playback",
          description: "A shallow chrome emblem completes one steady Y-axis revolution.",
          id: "reference.rotation",
          implementationIntent: "Map Toolcraft loop progress to exactly one signed 360-degree rotation.",
          timingClaims: [
            { claim: "cadence", studyId },
            { claim: "duration", studyId },
            { claim: "loop-seam", studyId },
            { claim: "speed", studyId },
          ],
        },
        {
          acceptanceId: "renderer.chrome",
          description: "High-contrast black, white, and cool-silver studio bands travel across the bevel.",
          id: "reference.chrome-banding",
          implementationIntent: "Use procedural vgpu reflection bands, Fresnel, and filmic tone mapping.",
          timingClaims: [{ claim: "cadence", studyId }],
        },
      ],
      kind: "motion-reference",
      referenceId,
      studies: [
        {
          evidence: motionEvidence,
          evidencePath: `src/app/reference-studies/${studyId}/evidence.json`,
          events: motionEvidence.detectedEvents.map((event) => ({
            behaviorIds: event.kind === "loop-seam"
              ? ["reference.rotation"]
              : ["reference.rotation", "reference.chrome-banding"],
            classification: "product-behavior" as const,
            evidenceEventId: event.eventId,
            id: `reference.${event.eventId}`,
          })),
          phases: [
            {
              behaviorIds: ["reference.rotation", "reference.chrome-banding"],
              fromFrameId: "source-frame:0",
              id: "reference.full-cycle",
              toFrameId: "source-frame:411",
              visualState: "Centered chrome extrusion rotates continuously while reflection bands sweep across its face and rim.",
            },
          ],
          studyId,
        },
      ],
    },
  ],
};

export const appProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: {
      evidence: "The user explicitly requested PNG/JPG image export with 2K, 4K, and 8K sizing.",
      mode: "user-requested",
    },
    svg: { mode: "not-requested" },
    video: {
      evidence: "The user explicitly requested MP4/WebM export at Current and 4K resolution.",
      mode: "user-requested",
    },
  },
  interactionOwnership: [
    {
      alternative: {
        reason: "Panel-only numeric camera controls would make direct inspection slower.",
        surface: "panel",
      },
      capability: "direct-spatial-edit",
      evidence: {
        detail: "The request calls for tweakable orbit controls and the reference is a spatial rotating object.",
        source: "user-request",
      },
      id: "canvas.chrome-orbit",
      reason: "Dragging the visible mesh or orientation gizmo directly orbits the shared camera pose.",
      surface: "canvas",
      target: chromishTargets.orbit,
    },
  ],
  mode: "product",
  productName: "Chromish",
  productSummary: "Converts one sanitized SVG alpha silhouette into a beveled WebGPU object with five switchable procedural materials and an image-based environment.",
  requestedBehavior: "Import an SVG and background image, test diamond/glass transparency and refraction or colorable plastic/fire/playdough, orbit the extrusion, play a seamless seven-second rotation, and export images, video, GLB, or a full-fidelity vgpu kit.",
  viewInteraction: {
    mode: "orbit",
    orientationTargets: [chromishTargets.orbit],
  },
};

type AcceptanceExtras = Partial<ToolcraftComponentAcceptance>;

function control(
  id: string,
  componentType: string,
  extras: AcceptanceExtras = {},
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `chromish unit: ${id}`,
    browser: true,
    browserTestName: `browser: chromish ${id}`,
    componentType,
    evidence: "product-output",
    expectedObservable: `${id} changes the visible chrome output or its delivered artifact.`,
    fixture: "a compound SVG with an outer contour, a hole, a transform, and a curved detail",
    id,
    kind: "control",
    target: id,
    userAction: `Change ${id} through the visible Toolcraft control.`,
    ...extras,
  };
}

const persistedSlices = appSchema.persistence.storage === "localStorage"
  ? appSchema.persistence.include
  : [];

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  control(chromishTargets.source, "fileDrop", {
    evidence: "media-lifecycle",
    expectedObservable: "A valid SVG creates a chrome mesh; removal and Reset return to a neutral empty canvas while an invalid replacement retains the previous mesh.",
    mediaLifecycleCoverage: ["upload", "remove", "reset"],
    userAction: "Upload a valid SVG, try an unsafe SVG, remove the source, and use Reset.",
  }),
  control(chromishTargets.detail, "segmented", {
    optionCoverage: ["fine", "balanced"],
  }),
  control(chromishTargets.depth, "slider"),
  control(chromishTargets.bevel, "slider"),
  {
    automated: true,
    automatedTestName: "chromish unit: orientation orbit and raycast",
    browser: true,
    browserTestName: "browser: chromish orientation gizmo and model orbit",
    canvasHandle: {
      exportCleanTestName: "browser: chromish export excludes orientation gizmo",
      outputObservable: "The exported artifact contains only the chrome object and background.",
      testId: "toolcraft-orientation-gizmo",
      writesTarget: chromishTargets.orbit,
    },
    componentType: "orientationGizmo",
    evidence: "product-output",
    expectedObservable: "Gizmo and object drags share one orbit pose, misses pan, undo/reset restore it, and exports exclude editor chrome.",
    fixture: "a centered chrome mesh with blank canvas around it",
    id: "view.orientation",
    interactionId: "canvas.chrome-orbit",
    kind: "canvas-handle",
    orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
    target: chromishTargets.orbit,
    userAction: "Drag a gizmo axis, snap an axis, drag the object, drag a canvas miss, then undo and reset.",
  },
  control(chromishTargets.material, "select", {
    expectedObservable: "Each of Diamond, Shiny plastic, Glass, Fire, and Playdough produces a distinct visible vgpu finish.",
    optionCoverage: ["diamond", "plastic", "glass", "fire", "playdough"],
  }),
  control(chromishTargets.primaryColor, "color", {
    expectedObservable: "Primary changes the visible body color for plastic, fire, and playdough while remaining absent for diamond and glass.",
  }),
  control(chromishTargets.secondaryColor, "color", {
    expectedObservable: "Accent changes the visible highlight for plastic and fire while remaining absent for other materials.",
  }),
  control(chromishTargets.roughness, "slider"),
  control(chromishTargets.reflectionContrast, "slider"),
  control(chromishTargets.studioRotation, "slider"),
  control("chrome.exposure", "slider"),
  control(chromishTargets.direction, "select", {
    expectedObservable: "CW and CCW produce opposite signed changes between deterministic timeline samples.",
    optionCoverage: ["clockwise", "counterclockwise"],
  }),
  control(chromishTargets.startAngle, "slider"),
  control(chromishTargets.includeBackground, "switch", {
    backgroundOutputCoverage: "all-required-background-output",
    expectedObservable: "Turning Include off hides the bounded preview background, disables Infinity, gives PNG transparent alpha, and keeps video opaque.",
  }),
  control(chromishTargets.background, "color", {
    expectedObservable: "Changing the background updates preview pixels, Infinity viewport color, and exported background pixels.",
  }),
  control(chromishTargets.backgroundImage, "fileDrop", {
    evidence: "media-lifecycle",
    expectedObservable: "The default Unsplash image appears behind the object, can be replaced, rotated, flipped, removed, and restored by Reset while preview and export consume the transformed image.",
    mediaLifecycleCoverage: ["upload", "remove", "reset", "default-remove", "default-reset", "rotate", "flip", "transform-output"],
    userAction: "Replace, rotate, flip, remove, and Reset the background image through the visible Toolcraft media control.",
  }),
  control(chromishTargets.imageFormat, "select", {
    evidence: "exported-bytes",
    optionCoverage: ["png", "jpg"],
  }),
  control(chromishTargets.imageResolution, "select", {
    evidence: "exported-bytes",
    optionCoverage: ["2k", "4k", "8k"],
  }),
  control(chromishTargets.videoFormat, "select", {
    evidence: "exported-bytes",
    optionCoverage: ["mp4", "webm"],
  }),
  control(chromishTargets.videoResolution, "select", {
    evidence: "exported-bytes",
    optionCoverage: ["current", "4k"],
  }),
  control("actions.output", "panelActions", {
    actionCoverage: ["download.glb-kit", "download.vgpu-kit", "export.image", "export.video"],
    evidence: "exported-bytes",
    exportArtifactCoverage: ["all-required-image-export-behavior", "all-required-video-export-behavior"],
    expectedObservable: "All four footer actions settle real progress and deliver validated, non-empty artifacts.",
    target: "actions.output",
    userAction: "Download both kits, export both image formats/resolutions, and export both video formats/resolutions.",
  }),
  {
    automated: true,
    automatedTestName: "chromish unit: vgpu renderer chrome",
    browser: true,
    browserTestName: "browser: chromish procedural chrome matches motion reference",
    componentType: "custom-renderer",
    evidence: "rendered-pixels",
    expectedObservable: "The vgpu canvas shows centered beveled chrome with moving cool-silver, white, and black bands and no cursor or bottom-edge artifact.",
    fixture: "the saved chrome-emblem motion study and a deterministic SVG fixture",
    id: "renderer.chrome",
    kind: "runtime",
    motionReferenceCoverage: [{ behaviorId: "reference.chrome-banding", referenceId }],
    target: chromishTargets.studioRotation,
    userAction: "Upload the fixture, pause at the reference phases, and compare decoded canvas pixels with the study.",
  },
  {
    automated: true,
    automatedTestName: "chromish unit: timeline maps one exact revolution",
    browser: true,
    browserTestName: "browser: chromish timeline playback scrub pause duration and loop",
    componentType: "timeline",
    evidence: "timeline-output",
    expectedObservable: "Playback advances one signed 360-degree rotation per duration, scrubs deterministically, pauses stably, resumes, and loops with matching first/final frames after duration edits.",
    fixture: "a valid chrome mesh at a seven-second default duration",
    id: "timeline.playback",
    kind: "runtime",
    motionReferenceCoverage: [{ behaviorId: "reference.rotation", referenceId }],
    target: "timeline.playback",
    timelineCoverage: "playback",
    timelineLoopProof: {
      direction: "forward-only",
      durationChange: "reproved-after-edit",
      reversePlayback: "forbidden",
      seam: "first-last-match",
    },
    timelinePlaybackCoverage: "all-playback-behavior",
    userAction: "Play, pause, scrub, edit duration, resume, and inspect the seam at the exact cycle boundary.",
  },
  {
    automated: true,
    automatedTestName: "chromish unit: infinity mode restoration",
    browser: true,
    browserTestName: "browser: chromish infinity canvas mode and restoration",
    componentType: "canvas",
    evidence: "viewport-side-effect",
    expectedObservable: "Infinity hides finite sizing, removes clipping, uses the product scene bounds, and restores the dormant 960×600 size.",
    fixture: "a valid SVG on the default editable 960×600 canvas",
    id: "canvas.infinity",
    infinityCanvasCoverage: "mode-and-restoration",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Enable Infinity, pan the scene, then return to finite mode.",
  },
  {
    automated: true,
    automatedTestName: "chromish unit: infinity image bounds",
    browser: true,
    browserTestName: "browser: chromish infinity image export bounds",
    componentType: "canvas",
    evidence: "exported-bytes",
    expectedObservable: "Infinity image export crops to the declared 960×600 product scene bounds.",
    fixture: "a chrome mesh in Infinity mode",
    id: "canvas.infinity.image-export",
    infinityCanvasCoverage: "scene-bounds-image-export",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Enable Infinity and export PNG.",
  },
  {
    automated: true,
    automatedTestName: "chromish unit: infinity video bounds",
    browser: true,
    browserTestName: "browser: chromish infinity video export bounds",
    componentType: "canvas",
    evidence: "exported-bytes",
    expectedObservable: "Infinity video export uses one 960×600 bounds envelope for the entire rotation.",
    fixture: "a rotating chrome mesh in Infinity mode",
    id: "canvas.infinity.video-export",
    infinityCanvasCoverage: "scene-bounds-video-export",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Enable Infinity and export video.",
  },
  {
    automated: true,
    automatedTestName: "chromish unit: render scale backing",
    browser: true,
    browserTestName: "browser: chromish render scale backing during interaction playback and steady state",
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable: "The canvas backing stays at exact CSS size × devicePixelRatio × selected scale during interaction, playback, and steady state.",
    fixture: "a visible chrome mesh at render scale 2",
    id: "canvas.render-scale",
    kind: "runtime",
    renderScaleCoverage: {
      kind: "selected-backing-pixels",
      states: ["interaction", "playback", "steady"],
    },
    target: "canvas.renderScale",
    userAction: "Drag Resolution scale, orbit the mesh, play the timeline, and inspect backing dimensions.",
  },
  {
    automated: true,
    automatedTestName: "chromish unit: persistence slices",
    browser: true,
    browserTestName: "browser: chromish restores canvas media panels timeline and values after reload",
    componentType: "persistence",
    evidence: "persistence-state",
    expectedObservable: "Uploaded SVG resource references, values, canvas, panel placement, and timeline state restore after a real reload.",
    fixture: "a changed Chromish workspace with one uploaded SVG",
    id: "persistence.reload",
    kind: "runtime",
    persistenceCoverage: "reload",
    persistenceSlices: persistedSlices,
    target: "canvas.size.width",
    userAction: "Upload, edit values and canvas, move a panel, scrub, wait for persistence success, and reload.",
  },
];

export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  { entity: "SVG source", entityId: "svg", groupingReason: "Import admission and silhouette detail are the first workflow stage.", id: "svg", targets: [chromishTargets.source, chromishTargets.detail], title: "SVG", workflowStage: "source" },
  { entity: "Chrome geometry", entityId: "geometry", groupingReason: "Depth, bevel, and shared orbit pose describe the extruded object.", id: "geometry", targets: [chromishTargets.depth, chromishTargets.bevel, chromishTargets.orbit], title: "Geometry", workflowStage: "shape" },
  { entity: "Object material", entityId: "material", groupingReason: "The selector and applicable colors or optical parameters tune one procedural material.", id: "material", targets: [chromishTargets.material, chromishTargets.primaryColor, chromishTargets.secondaryColor, chromishTargets.roughness, chromishTargets.reflectionContrast, chromishTargets.studioRotation, "chrome.exposure"], title: "Material", workflowStage: "appearance" },
  { entity: "Rotation motion", entityId: "motion", groupingReason: "Direction and start angle modify the Toolcraft timeline cycle.", id: "motion", targets: [chromishTargets.direction, chromishTargets.startAngle], title: "Motion", workflowStage: "animation" },
  { entity: "Environment image", entityId: "environment-image", groupingReason: "This source image is the complete editable environment used for backdrop and optical sampling.", id: "environment-image", targets: [chromishTargets.backgroundImage], title: "Environment Image", workflowStage: "source" },
  { entity: "Canvas background", entityId: "background", groupingReason: "Background inclusion and fallback color jointly define preview and export compositing.", id: "background", targets: [chromishTargets.includeBackground, chromishTargets.background], title: "Background", workflowStage: "appearance" },
  { entity: "Image delivery", entityId: "image-export", groupingReason: "Image format and long-edge resolution configure runtime-owned image export.", id: "image-export", targets: [chromishTargets.imageFormat, chromishTargets.imageResolution], title: "Image Export", workflowStage: "delivery" },
  { entity: "Video delivery", entityId: "video-export", groupingReason: "Video container and size configure runtime-owned 30 FPS video export.", id: "video-export", targets: [chromishTargets.videoFormat, chromishTargets.videoResolution], title: "Video Export", workflowStage: "delivery" },
];
