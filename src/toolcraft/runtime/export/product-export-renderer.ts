import type { ToolcraftRendererPipelineClient } from "../rendering";
import type { ToolcraftState } from "../state/types";
import type { ToolcraftExportFrame } from "./export-frame";

export type ToolcraftProductExportFrameContext = Readonly<{
  context: CanvasRenderingContext2D;
  frame: ToolcraftExportFrame;
  pixelRatio: number;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  state: Readonly<ToolcraftState>;
  timeSeconds: number;
  timelineProgress: number;
}>;

export type ToolcraftProductExportFrameRenderer = (
  context: ToolcraftProductExportFrameContext,
) => PromiseLike<void> | void;

export type ToolcraftProductExportRenderer = Readonly<{
  baseFileName: string;
  renderFrame: ToolcraftProductExportFrameRenderer;
}>;
