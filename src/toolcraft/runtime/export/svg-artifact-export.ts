import type { ToolcraftRendererPipelineClient } from "../rendering";
import type {
  ToolcraftProductSceneBoundsProvider,
  ToolcraftRuntimeSceneVisibility,
} from "../scene";
import {
  getToolcraftRuntimeBackgroundColor,
  isToolcraftRuntimeBackgroundEnabled,
} from "../state/canvas-background-state";
import type { ToolcraftState } from "../state/types";
import {
  downloadToolcraftArtifact,
  type ToolcraftArtifactDownloadRequest,
  type ToolcraftArtifactDownloadResult,
} from "./artifact-download";
import {
  createToolcraftArtifactFrameState,
  getToolcraftArtifactTimelineProgress,
} from "./artifact-frame-state";
import { resolveToolcraftStillArtifactFrame } from "./artifact-scene-frame";
import {
  ToolcraftSceneExportError,
  validateToolcraftArtifactSize,
} from "./export-frame";
import { normalizeToolcraftExportError } from "./export-error";
import type { ToolcraftProductSvgExportRenderer } from "./product-svg-export-renderer";
import {
  createToolcraftSvgDocument,
  createToolcraftSvgProductContainer,
  serializeToolcraftSvgDocument,
} from "./svg-document";

export type ToolcraftSvgArtifactExportResult = Readonly<{
  byteLength: number;
  extension: ".svg";
  height: number;
  mediaType: "image/svg+xml";
  vectorElementCount: number;
  width: number;
}>;

export type ToolcraftSvgArtifactExportRequest = Readonly<{
  boundsProvider: ToolcraftProductSceneBoundsProvider | undefined;
  downloadArtifact?: (
    request: ToolcraftArtifactDownloadRequest,
  ) => ToolcraftArtifactDownloadResult;
  productSceneRequired: boolean;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  reportProgress: (progress: number) => void;
  state: ToolcraftState;
  svgExportRenderer: ToolcraftProductSvgExportRenderer;
  visibility: ToolcraftRuntimeSceneVisibility;
}>;

export async function exportToolcraftSvgArtifact(
  request: ToolcraftSvgArtifactExportRequest,
): Promise<ToolcraftSvgArtifactExportResult> {
  const frameState = createToolcraftArtifactFrameState(
    request.state,
    request.state.timeline.currentTimeSeconds,
  );
  const frame = resolveToolcraftStillArtifactFrame({
    boundsProvider: request.boundsProvider,
    productSceneRequired: request.productSceneRequired,
    state: frameState,
    visibility: request.visibility,
  });
  const sizeValidation = validateToolcraftArtifactSize(frame);
  if (!sizeValidation.ok) {
    throw new ToolcraftSceneExportError(sizeValidation);
  }

  const { document: svgDocument } = createToolcraftSvgDocument(frame);
  const { container } = createToolcraftSvgProductContainer();
  request.reportProgress(0.1);
  try {
    await request.svgExportRenderer.renderFrame({
      container,
      frame,
      rendererPipeline: request.rendererPipeline,
      state: frameState,
      timeSeconds: frameState.timeline.currentTimeSeconds,
      timelineProgress: getToolcraftArtifactTimelineProgress(frameState),
    });
  } catch (error) {
    throw normalizeToolcraftExportError(error, {
      code: "svg-render-failed",
      message: "Toolcraft could not render product vectors for SVG export.",
    });
  }
  request.reportProgress(0.65);

  const serialized = serializeToolcraftSvgDocument({
    backgroundColor: isToolcraftRuntimeBackgroundEnabled(frameState)
      ? (getToolcraftRuntimeBackgroundColor(frameState) ?? "#000000")
      : null,
    container,
    document: svgDocument,
    frame,
  });
  const blob = new Blob([serialized.source], {
    type: "image/svg+xml;charset=utf-8",
  });
  request.reportProgress(0.9);
  (request.downloadArtifact ?? downloadToolcraftArtifact)({
    blob,
    extension: ".svg",
    rawBaseFileName: request.svgExportRenderer.baseFileName,
  });
  request.reportProgress(1);

  return Object.freeze({
    byteLength: blob.size,
    extension: ".svg",
    height: frame.height,
    mediaType: "image/svg+xml",
    vectorElementCount: serialized.vectorElementCount,
    width: frame.width,
  });
}
