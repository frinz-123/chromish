import fs from "node:fs/promises";

import { expect } from "@playwright/test";
import { unzipSync } from "fflate";

import { expectToolcraftExportedArtifact } from "./browser-acceptance-outcome-helpers";
import { expectToolcraftBackgroundOutputSemantics } from "./browser-background-output-evidence";
import {
  expectToolcraftInfinityCanvasBackgroundEvidence,
  observeInfinityCanvasBackground,
} from "./browser-infinity-canvas-evidence";
import { expectToolcraftImageExportArtifact, expectToolcraftVideoExportArtifact } from "./browser-media-export-evidence";
import {
  applicabilityCases,
  applicabilityRequirementId,
  backgroundRgba,
  canvasSelector,
  chooseSelect,
  control,
  createProofSession,
  downloadFrom,
  expectedProductPixel,
  inspectImageFromDownload,
  inspectVideoFromDownload,
  oneSecondSchedule,
  observeChromishCanvasRaster,
  openChromish,
  pauseTimeline,
  prepareGpuPage,
  proveApplicabilityControlChange,
  selectApplicabilityCase,
  setCanvasSize,
  setColor,
  setSwitch,
  setTimelineDuration,
  uploadVectorSvg,
  waitForGpuCanvasReady,
  withGpuPage,
} from "./product-chromish-test-support";
import { test } from "./toolcraft-product-test";

test.setTimeout(180_000);

test("browser: chromish appearance.background", async ({ page }) => {
  await withGpuPage(page, async (gpuPage) => {
    await expect(gpuPage.locator(canvasSelector)).toHaveAttribute("data-chromish-renderer-ready", "true", { timeout: 25_000 });
    await pauseTimeline(gpuPage);
    await expect(gpuPage.locator(canvasSelector)).toHaveAttribute("data-chromish-background-image", "none");
    await expect(gpuPage.locator(canvasSelector)).toHaveAttribute("data-chromish-background-image-ready", "false");
    for (const include of [false, true]) {
      await setSwitch(gpuPage, "export.includeBackground", include);
      await expect(control(gpuPage, "appearance.background")).toBeVisible();
    }
    const before = await observeChromishCanvasRaster(gpuPage);
    await setColor(gpuPage, "appearance.background", "#DDEEFF");
    await expect(gpuPage.locator("[data-toolcraft-chromish-canvas]")).toHaveCSS("background-color", "rgb(221, 238, 255)");
    await expect.poll(async () => (await observeChromishCanvasRaster(gpuPage)).hash).not.toBe(before.hash);
    const changed = await observeChromishCanvasRaster(gpuPage);
    expect(changed.nonBlackRatio).toBeGreaterThan(0.99);
    expect(changed.averageRgb[2]).toBeGreaterThan(changed.averageRgb[0]);
    for (const applicabilityCase of applicabilityCases("appearance.background")) {
      await proveApplicabilityControlChange(gpuPage, "appearance.background", "appearance.background", applicabilityCase, async (field) => {
        const input = field.locator('input[type="text"]');
        await input.fill(applicabilityCase.selectorValue ? "#CCDDEE" : "#AACCEE");
        await input.press("Enter");
        await input.blur();
      });
    }
  });
});
