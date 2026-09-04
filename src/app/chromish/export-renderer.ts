import type { ToolcraftProductExportRenderer } from "@/toolcraft/runtime";

import { getChromishExportParameters } from "./export-parameters";
import { getChromishRuntimeSnapshot } from "./runtime-store";

export const chromishExportRenderer: ToolcraftProductExportRenderer = {
  baseFileName: "chromish",
  async renderFrame({ context, state, timelineProgress }) {
    const snapshot = getChromishRuntimeSnapshot();
    if (!snapshot) throw new Error("Upload a valid SVG before exporting.");
    const parameters = getChromishExportParameters(state, timelineProgress);
    const runtimeBackgroundIsOpaque = context.getImageData(0, 0, 1, 1).data[3] === 255;
    const longestEdge = Math.max(context.canvas.width, context.canvas.height);
    const usesImageResolution = longestEdge === 2048 || longestEdge === 4096 || longestEdge === 8192;
    await snapshot.renderer.renderToContext(
      context,
      (runtimeBackgroundIsOpaque || !usesImageResolution) && !parameters.includeBackground
        ? { ...parameters, includeBackground: true }
        : parameters,
      context.canvas.width,
      context.canvas.height,
    );
  },
};
