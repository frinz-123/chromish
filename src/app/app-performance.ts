import {
  assessToolcraftRenderPlan,
  defineToolcraftPerformance,
  deriveToolcraftPerformancePaths,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformancePath,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";
import { rendererPipelineRegistration } from "./chromish/renderer-pipeline";

const performanceModel = {
    rendererPipeline: rendererPipelineRegistration,
    rendererStrategy: "webgpu",
    rendererTechnique: {
      exportRenderer: "webgpu",
      fidelityRisks: [
        "Browser alpha tracing approximates SVG filters, fonts, strokes, masks, and clip paths.",
        "The portable GLB material cannot reproduce the procedural vgpu reflection shader exactly.",
      ],
      layers: [
        {
          content: ["shader"],
          exportMode: "composited",
          id: "studio-background",
          kind: "background",
          primitiveCount: "low",
          renderer: "webgpu",
        },
        {
          content: ["geometry", "shader"],
          exportMode: "included",
          id: "chrome-object",
          kind: "product-foreground",
          primitiveCount: "high",
          renderer: "webgpu",
          uiSelector: "[data-toolcraft-chromish-canvas]",
        },
        {
          content: ["composite"],
          exportMode: "composited",
          id: "tone-map",
          kind: "export-composite",
          primitiveCount: "low",
          renderer: "webgpu",
        },
      ],
      performanceRisks: [
        "Fine alpha tracing and bevel generation can approach the enforced 100,000-triangle limit.",
        "8K image and 4K video exports require deterministic tiled rendering and GPU readback.",
      ],
      previewExportDifferenceReason:
        "Preview uses 4x MSAA at selected backing scale; export uses deterministic non-MSAA tiles up to 2048 px.",
      previewRenderer: "webgpu",
      productRepresentation: "mixed",
      rendererStrategy: "webgpu",
      sourceRepresentation: "svg",
      whyNotAlternativeStrategies: [
        "DOM and SVG cannot render the required extruded chrome object or HDR post-process.",
        "Canvas 2D lacks depth-tested 3D geometry and the procedural reflection pipeline.",
        "WebGL would duplicate a fallback the product explicitly excludes and would not exercise vgpu.",
      ],
    },
    scenarios: [],
    usesCustomRenderer: true,
    workloadEnvelope: {
      dimensions: [
        {
          batchMax: 10_000,
          defaultValue: 0,
          id: "svg-elements",
          interactiveMax: 10_000,
          mapping: "direct",
          source: { id: "sanitized-svg-elements", kind: "external-input" },
          unit: "elements",
        },
        {
          batchMax: 2,
          defaultValue: 2,
          id: "detail-level",
          interactiveMax: 2,
          mapping: "direct",
          source: { kind: "schema-target", target: "svg.detail" },
          unit: "quality-tier",
        },
        {
          batchMax: 2,
          defaultValue: 2,
          id: "preview-scale",
          interactiveMax: 2,
          mapping: "quadratic",
          source: { kind: "runtime-state", path: "values.canvas.renderScale" },
          unit: "scale",
        },
        {
          batchMax: 100_000,
          defaultValue: 0,
          id: "mesh-triangles",
          interactiveMax: 100_000,
          mapping: "direct",
          source: { inputs: ["svg-elements", "detail-level"], kind: "derived" },
          unit: "triangles",
        },
        {
          batchMax: 8192,
          defaultValue: 4096,
          id: "image-export-long-edge",
          mapping: "quadratic",
          source: { kind: "schema-target", target: "export.image.resolution" },
          unit: "pixels",
        },
        {
          batchMax: 4096,
          defaultValue: 960,
          id: "video-export-long-edge",
          mapping: "quadratic",
          source: { kind: "schema-target", target: "export.video.resolution" },
          unit: "pixels",
        },
      ],
    },
  } as const satisfies ToolcraftEnvelopePerformanceConfig;

const performancePaths = deriveToolcraftPerformancePaths(
  appSchema,
  performanceModel,
);

function createPerformanceScenario(
  path: ToolcraftPerformancePath,
  index: number,
): ToolcraftPerformanceScenario {
  const common = {
    automated: true,
    automatedTestName: `exercises ${path.interaction} render path ${index + 1}`,
    browser: true,
    browserTestName: `browser perf: chromish ${path.interaction} path ${index + 1}`,
    coversTargets: path.targets,
    expectedObservable:
      path.interaction === "export"
        ? "A non-empty runtime-owned artifact is downloaded at the selected dimensions."
        : "The retained vgpu canvas presents a changed chrome frame without adaptive quality reduction.",
    fixture: "sanitized chrome silhouette at the compiled workload checkpoint",
    id: `chromish.performance.${index + 1}`,
    pathId: path.id,
    uiSelector: "[data-toolcraft-chromish-canvas]",
    ...(path.targets.length === 1 ? { target: path.targets[0] } : {}),
  } as const;

  return path.interaction === "export"
    ? {
        ...common,
        actionValue: "export.image",
        completionEvidence: "download",
        controlLabel: "Export PNG",
        interaction: "export",
      }
    : { ...common, interaction: path.interaction };
}

export const appPerformance: ToolcraftEnvelopePerformanceConfig =
  defineToolcraftPerformance({
    ...performanceModel,
    fixtureAdapters: {
      dimensions: {
        "detail-level": {
          apply: (value: number) => (value === 2 ? "fine" : "balanced"),
          dimensionId: "detail-level",
          domain: {
            kind: "schema-options",
            optionValues: ["fine", "balanced"],
            target: "svg.detail",
          },
          entries: [
            { appliedValue: "balanced", value: 1 },
            { appliedValue: "fine", value: 2 },
          ],
          kind: "exhaustive-discrete",
          observe: (value: unknown) => (value === "fine" ? 2 : 1),
        },
        "image-export-long-edge": {
          apply: (value: number) => (value === 8192 ? "8k" : value === 4096 ? "4k" : "2k"),
          dimensionId: "image-export-long-edge",
          domain: {
            kind: "schema-options",
            optionValues: ["2k", "4k", "8k"],
            target: "export.image.resolution",
          },
          entries: [
            { appliedValue: "2k", value: 2048 },
            { appliedValue: "4k", value: 4096 },
            { appliedValue: "8k", value: 8192 },
          ],
          kind: "exhaustive-discrete",
          observe: (value: unknown) => value === "8k" ? 8192 : value === "4k" ? 4096 : 2048,
        },
        "mesh-triangles": {
          apply: (value: number) => value,
          dimensionId: "mesh-triangles",
          observe: (value: unknown) => Number(value),
        },
        "preview-scale": {
          apply: (value: number) => value,
          dimensionId: "preview-scale",
          observe: (value: unknown) => Number(value),
        },
        "svg-elements": {
          apply: (value: number) => value,
          dimensionId: "svg-elements",
          observe: (value: unknown) => Number(value),
        },
        "video-export-long-edge": {
          apply: (value: number) => value === 4096 ? "4k" : "current",
          dimensionId: "video-export-long-edge",
          domain: {
            kind: "schema-options",
            optionValues: ["current", "4k"],
            target: "export.video.resolution",
          },
          entries: [
            { appliedValue: "current", value: 960 },
            { appliedValue: "4k", value: 4096 },
          ],
          kind: "exhaustive-discrete",
          observe: (value: unknown) => value === "4k" ? 4096 : 960,
        },
      },
    },
    scenarios: performancePaths.map(createPerformanceScenario),
  });

export const appRenderPlanAssessment = assessToolcraftRenderPlan(
  appSchema,
  appPerformance,
);

if (appRenderPlanAssessment.errors.length > 0) {
  throw new Error(
    `Chromish render plan is invalid:\n- ${appRenderPlanAssessment.errors.join("\n- ")}`,
  );
}
