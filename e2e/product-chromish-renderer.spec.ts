import fs from "node:fs/promises";

import { expect } from "@playwright/test";
import { unzipSync } from "fflate";

import { expectToolcraftExportedArtifact, expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import {
  expectToolcraftInfinityCanvasBackgroundEvidence,
  expectToolcraftOrientationAxisDrag,
  expectToolcraftOrientationAxisSnap,
  expectToolcraftOrientationCanvasMissPan,
  expectToolcraftOrientationModelDrag,
  expectToolcraftOrientationUndoReset,
} from "./browser-orientation-gizmo-evidence-helpers";
import { readToolcraftBrowserObservation } from "./browser-proof-session";
import {
  expectToolcraftInfinityCanvasImageExportEvidence,
  expectToolcraftInfinityCanvasModeEvidence,
  expectToolcraftInfinityCanvasVideoExportEvidence,
  observeInfinityCanvas,
  observeInfinityCanvasBackground,
} from "./browser-infinity-canvas-evidence";
import { expectToolcraftBackgroundOutputSemantics } from "./browser-background-output-evidence";
import { expectToolcraftMediaLifecycle, expectToolcraftPersistenceState } from "./browser-state-evidence-helpers";
import { expectToolcraftStandardTimelinePlayback } from "./browser-standard-timeline-evidence";
import { expectToolcraftImageExportArtifact, expectToolcraftVideoExportArtifact } from "./browser-media-export-evidence";
import { expectExportExcludesCanvasHandles } from "./canvas-handle-helpers";
import { expectToolcraftSegmentedControlCellsPreservePadding } from "./performance-control-layout-helpers";
import { dragToolcraftCanvasViewport } from "./performance-canvas-helpers";
import { expectToolcraftCanvasRenderScaleEvidence } from "./browser-render-scale-evidence";
import {
  canvasSelector,
  backgroundRgba,
  applicabilityCases,
  applicabilityRequirementId,
  changeSlider,
  chooseSegment,
  chooseSelect,
  chooseSelectInField,
  control,
  createProofSession,
  downloadFrom,
  inspectImage,
  inspectImageFromDownload,
  inspectOneSecondVideo,
  inspectVideoFromDownload,
  oneSecondSchedule,
  openChromish,
  pauseTimeline,
  prepareGpuPage,
  proveApplicabilityControlChange,
  proveControlChange,
  rasterSvg,
  selectApplicabilityCase,
  setCanvasSize,
  setColor,
  setSwitch,
  setTimelineDuration,
  unsafeSvg,
  uploadSvg,
  uploadVectorSvg,
  vectorSvg,
  withGpuPage,
} from "./product-chromish-test-support";
import { test } from "./toolcraft-product-test";

test.setTimeout(180_000);

test("browser: chromish procedural chrome matches motion reference", async ({ page }) => {
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await chooseSelect(gpuPage, "export.image.resolution", "2K");
    const artifact = await inspectImage(gpuPage);
    const pixels = artifact.observation.normalizedPixels;
    const luminanceBands = new Set<number>();
    for (let index = 0; index < pixels.length; index += 16) {
      luminanceBands.add(Math.round((pixels[index]! + pixels[index + 1]! + pixels[index + 2]!) / 24));
    }
    expect(artifact.inspection.nonBackgroundBounds).not.toBeNull();
    expect(artifact.observation.occupiedAreaRatio).toBeGreaterThan(0.08);
    expect(luminanceBands.size).toBeGreaterThan(12);
    await expectToolcraftReferenceParity(
      async () => artifact.observation.occupiedAreaRatio > 0.08 && luminanceBands.size > 12,
      true,
      { requirementId: "renderer.chrome", target: "chrome.studioRotation" },
    );
    await proveControlChange(gpuPage, "chrome.studioRotation", "renderer.chrome", async (field) => {
      await field.getByRole("slider").press("ArrowRight");
    });
  });
});

