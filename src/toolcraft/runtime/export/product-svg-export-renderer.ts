import type { ToolcraftRendererPipelineClient } from "../rendering";
import type { ToolcraftState } from "../state/types";
import type { ToolcraftExportFrame } from "./export-frame";

export type ToolcraftProductSvgExportFrameContext = Readonly<{
  container: SVGGElement;
  frame: ToolcraftExportFrame;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  state: Readonly<ToolcraftState>;
  timeSeconds: number;
  timelineProgress: number;
}>;

export type ToolcraftProductSvgExportFrameRenderer = (
  context: ToolcraftProductSvgExportFrameContext,
) => PromiseLike<void> | void;

export type ToolcraftProductSvgExportRenderer = Readonly<{
  baseFileName: string;
  renderFrame: ToolcraftProductSvgExportFrameRenderer;
}>;
