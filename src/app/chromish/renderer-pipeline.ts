import {
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";

import type { ChromishCpuMesh } from "./svg-mesh";

export type ChromishMeshResource = Readonly<{
  indexCount: number;
  sourceKey: string;
  triangleCount: number;
}>;

export type ChromishGpuResource = Readonly<{
  rendererId: string;
}>;

type ChromishPipelineContracts = {
  "svg-extrusion": ToolcraftRendererPipelinePassContract<
    ChromishCpuMesh
  >;
  "chrome-hdr": ToolcraftRendererPipelinePassContract<
    ChromishGpuResource,
    ChromishGpuResource,
    readonly [string]
  >;
  "tone-map": ToolcraftRendererPipelinePassContract<
    ChromishGpuResource,
    ChromishGpuResource,
    readonly [string]
  >;
  "export-readback": ToolcraftRendererPipelinePassContract<
    void,
    ChromishGpuResource,
    readonly [string]
  >;
};

export const rendererPipelineRegistration =
  registerToolcraftRendererPipeline<ChromishPipelineContracts>()({
    runtimeId: "chromish-vgpu-v1",
    passes: [
      {
        cacheKey: ["source", "detail", "depth", "bevel"],
        cost: {
          dimensions: ["svg-elements", "detail-level"],
          frequency: "discrete",
          relationship: "product",
        },
        id: "svg-extrusion",
        inputs: ["media.svgSource", "svg.detail", "geometry.depth", "geometry.bevel"],
        invalidatedBy: ["initial-render", "media-import", "control-change", "control-drag"],
        kind: "vector-build",
        lifecycle: { cache: "memoized", resourceScope: "source" },
        output: "intermediate",
        quality: "full",
        runsOn: "main",
      },
      {
        cacheKey: ["renderer"],
        cost: {
          dimensions: ["preview-scale"],
          frequency: "frame",
          relationship: "quadratic",
        },
        id: "chrome-hdr",
        inputs: ["svg-extrusion", "material.*", "chrome.*", "view.orbit", "motion.*", "timeline", "canvas.renderScale"],
        invalidatedBy: ["initial-render", "control-change", "control-drag", "animation-frame", "timeline-playback", "timeline-scrub", "viewport-drag", "viewport-zoom"],
        kind: "rasterize",
        lifecycle: { cache: "retained-resource", resourceScope: "renderer" },
        output: "intermediate",
        quality: "retina",
        runsOn: "gpu",
      },
      {
        cacheKey: ["renderer"],
        cost: {
          dimensions: ["preview-scale"],
          frequency: "frame",
          relationship: "quadratic",
        },
        id: "tone-map",
        inputs: ["chrome-hdr", "chrome.exposure", "appearance.background", "export.includeBackground"],
        invalidatedBy: ["initial-render", "control-change", "control-drag", "animation-frame", "timeline-playback", "timeline-scrub", "viewport-drag", "viewport-zoom"],
        kind: "composite",
        lifecycle: { cache: "retained-resource", resourceScope: "renderer" },
        output: "preview",
        quality: "retina",
        runsOn: "gpu",
      },
      {
        cacheKey: ["renderer"],
        cost: {
          dimensions: ["mesh-triangles", "image-export-long-edge", "video-export-long-edge"],
          frequency: "batch",
          relationship: "product",
        },
        id: "export-readback",
        inputs: ["svg-extrusion", "chrome-hdr", "tone-map", "export.image.resolution", "export.video.resolution"],
        invalidatedBy: ["export"],
        kind: "export",
        lifecycle: { cache: "retained-resource", resourceScope: "renderer" },
        output: "export",
        quality: "export",
        runsOn: "gpu",
      },
    ],
    interactionInvalidation: [
      { interaction: "initial-render", invalidates: ["svg-extrusion", "chrome-hdr", "tone-map"], targets: ["canvas"] },
      { interaction: "media-import", invalidates: ["svg-extrusion", "chrome-hdr", "tone-map"], targets: ["media.svgSource"] },
      { interaction: "control-change", invalidates: ["svg-extrusion", "chrome-hdr", "tone-map"], targets: ["svg.detail", "geometry.depth", "geometry.bevel"] },
      { interaction: "control-drag", invalidates: ["svg-extrusion", "chrome-hdr", "tone-map"], targets: ["geometry.depth", "geometry.bevel"] },
      { interaction: "control-change", invalidates: ["chrome-hdr", "tone-map"], mustNotInvalidate: ["svg-extrusion"], targets: ["material.type", "material.primaryColor", "material.secondaryColor", "chrome.roughness", "chrome.reflectionContrast", "chrome.studioRotation", "chrome.exposure", "motion.direction", "motion.startAngle", "view.orbit", "appearance.background", "export.includeBackground"] },
      { interaction: "control-drag", invalidates: ["chrome-hdr", "tone-map"], mustNotInvalidate: ["svg-extrusion"], targets: ["chrome.roughness", "chrome.reflectionContrast", "chrome.studioRotation", "chrome.exposure", "motion.startAngle", "view.orbit"] },
      { interaction: "timeline-playback", invalidates: ["tone-map"], mustNotInvalidate: ["svg-extrusion", "chrome-hdr"], targets: ["timeline"] },
      { interaction: "timeline-scrub", invalidates: ["tone-map"], mustNotInvalidate: ["svg-extrusion", "chrome-hdr"], targets: ["timeline"] },
      { interaction: "viewport-drag", invalidates: ["tone-map"], mustNotInvalidate: ["svg-extrusion", "chrome-hdr"], targets: ["view.orbit"] },
      { interaction: "viewport-zoom", invalidates: ["chrome-hdr", "tone-map"], mustNotInvalidate: ["svg-extrusion"], targets: ["canvas.zoom", "canvas.renderScale"] },
      { interaction: "export", invalidates: ["export-readback"], mustNotInvalidate: ["svg-extrusion"], targets: ["export.image", "export.video"] },
    ],
  });

export const chromishPipelinePasses = {
  chromeHdr: rendererPipelineRegistration.getPass("chrome-hdr"),
  exportReadback: rendererPipelineRegistration.getPass("export-readback"),
  svgExtrusion: rendererPipelineRegistration.getPass("svg-extrusion"),
  toneMap: rendererPipelineRegistration.getPass("tone-map"),
} as const;
