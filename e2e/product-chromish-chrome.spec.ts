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

for (const [testName, target, outputAttribute] of [
  ["browser: chromish chrome.roughness", "chrome.roughness", "data-chromish-roughness"],
  ["browser: chromish chrome.reflectionContrast", "chrome.reflectionContrast", "data-chromish-reflection-contrast"],
  ["browser: chromish chrome.studioRotation", "chrome.studioRotation", "data-chromish-studio-rotation"],
  ["browser: chromish chrome.exposure", "chrome.exposure", "data-chromish-exposure"],
] as const) {
  test(testName, async ({ page }) => {
    await openChromish(page);
    await uploadVectorSvg(page);
    if (target === "chrome.roughness") await chooseSelect(page, "material.type", "plastic");
    const canvas = page.locator(canvasSelector);
    const before = await canvas.getAttribute(outputAttribute);
    await changeSlider(page, target);
    await expect.poll(() => canvas.getAttribute(outputAttribute)).not.toBe(before);
    await proveControlChange(page, target, target, async (field) => {
      await field.getByRole("slider").press("ArrowRight");
    });
  });
}

test("browser: chromish material.type", async ({ page }) => {
  await openChromish(page);
  await uploadVectorSvg(page);
  for (const material of ["plastic", "glass", "fire", "playdough", "diamond"] as const) {
    await chooseSelect(page, "material.type", material);
    await expect(page.locator(canvasSelector)).toHaveAttribute("data-chromish-material", material);
  }
  await proveControlChange(page, "material.type", "material.type", async () => {
    await chooseSelect(page, "material.type", "glass");
  });
});

for (const [testName, target, mode, color, attribute] of [
  ["browser: chromish material.primaryColor", "material.primaryColor", "plastic", "#B8D7E8", "data-chromish-primary-color"],
  ["browser: chromish material.secondaryColor", "material.secondaryColor", "fire", "#FFF06A", "data-chromish-secondary-color"],
] as const) {
  test(testName, async ({ page }) => {
    await openChromish(page);
    await uploadVectorSvg(page);
    await chooseSelect(page, "material.type", mode);
    await setColor(page, target, color);
    await expect(page.locator(canvasSelector)).toHaveAttribute(attribute, color);
    await proveControlChange(page, target, target, async (field) => {
    const input = field.locator('input[type="text"]');
    await input.fill("#D9E4EA");
    await input.press("Enter");
    });
  });
}
