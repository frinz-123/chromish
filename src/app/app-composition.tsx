import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { ChromishCanvas } from "./chromish/chromish-canvas";
import { chromishExportRenderer } from "./chromish/export-renderer";
import { handleChromishPanelAction } from "./chromish/kits";
import { rendererPipelineRegistration } from "./chromish/renderer-pipeline";

export const appComposition: ToolcraftAppComposition = {
  canvasContent: <ChromishCanvas />,
  exportRenderer: chromishExportRenderer,
  modelPresentation: { mode: "runtime" },
  onPanelAction: handleChromishPanelAction,
  renderDefaultCanvasMedia: false,
  rendererPipelineRegistration,
  sceneBoundsProvider: ({ state }) => state.mediaAssets.some(
    (asset) => asset.sourceTarget === "media.svgSource",
  ) ? [{ height: 600, width: 960, x: -480, y: -300 }] : [],
  schema: appSchema,
};
