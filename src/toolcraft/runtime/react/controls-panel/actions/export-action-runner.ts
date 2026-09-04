import type { ToolcraftArtifactExportRequest } from "../../../export/artifact-export-request";
import { ToolcraftArtifactExportError } from "../../../export/export-error";
import type { ToolcraftExportFrame } from "../../../export/export-frame";
import { exportToolcraftImageArtifact } from "../../../export/image-artifact-export";
import type { ToolcraftProductExportRenderer } from "../../../export/product-export-renderer";
import type { ToolcraftProductSvgExportRenderer } from "../../../export/product-svg-export-renderer";
import {
  exportToolcraftSvgArtifact,
  type ToolcraftSvgArtifactExportRequest,
} from "../../../export/svg-artifact-export";
import { exportToolcraftVideoArtifact } from "../../../export/video-artifact-export";
import type { ToolcraftRendererPipelineClient } from "../../../rendering";
import type {
  ToolcraftProductSceneBoundsProvider,
  ToolcraftRuntimeSceneVisibility,
} from "../../../scene";
import type { ToolcraftActionSchema } from "../../../schema/types";
import type { ToolcraftState } from "../../../state/types";

export type ToolcraftControlsSceneExport = Readonly<{
  boundsProvider?: ToolcraftProductSceneBoundsProvider;
  exportRenderer?: ToolcraftProductExportRenderer;
  productSceneRequired: boolean;
  svgExportRenderer?: ToolcraftProductSvgExportRenderer;
  visibility: ToolcraftRuntimeSceneVisibility;
}>;

export type ToolcraftExportActionRequest = Readonly<{
  action: ToolcraftActionSchema;
  renderRuntimeScene: (
    canvas: HTMLCanvasElement,
    frame: ToolcraftExportFrame,
    state: ToolcraftState,
  ) => Promise<unknown>;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  reportProgress: (progress: number) => void;
  sceneExport: ToolcraftControlsSceneExport;
  state: ToolcraftState;
}>;

function createSharedArtifactRequest(
  request: ToolcraftExportActionRequest,
): ToolcraftArtifactExportRequest {
  return {
    boundsProvider: request.sceneExport.boundsProvider,
    exportRenderer: request.sceneExport.exportRenderer,
    productSceneRequired: request.sceneExport.productSceneRequired,
    renderRuntimeScene: request.renderRuntimeScene,
    rendererPipeline: request.rendererPipeline,
    reportProgress: request.reportProgress,
    state: request.state,
    visibility: request.sceneExport.visibility,
  };
}

function requireSvgExportRenderer(
  renderer: ToolcraftProductSvgExportRenderer | undefined,
): ToolcraftProductSvgExportRenderer {
  if (!renderer) {
    throw new ToolcraftArtifactExportError({
      code: "svg-render-failed",
      message: "SVG export requires svgExportRenderer.",
    });
  }
  return renderer;
}

function createSvgArtifactRequest(
  request: ToolcraftExportActionRequest,
): ToolcraftSvgArtifactExportRequest {
  return {
    boundsProvider: request.sceneExport.boundsProvider,
    productSceneRequired: request.sceneExport.productSceneRequired,
    rendererPipeline: request.rendererPipeline,
    reportProgress: request.reportProgress,
    state: request.state,
    svgExportRenderer: requireSvgExportRenderer(
      request.sceneExport.svgExportRenderer,
    ),
    visibility: request.sceneExport.visibility,
  };
}

export function runToolcraftExportAction(
  request: ToolcraftExportActionRequest,
): PromiseLike<unknown> | null {
  switch (request.action.role) {
    case "export-image":
      return exportToolcraftImageArtifact(createSharedArtifactRequest(request));
    case "export-svg":
      return exportToolcraftSvgArtifact(createSvgArtifactRequest(request));
    case "export-video":
      return exportToolcraftVideoArtifact(createSharedArtifactRequest(request));
    default:
      return null;
  }
}
