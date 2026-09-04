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
  await openChromish(page);
  await uploadVectorSvg(page);
  await pauseTimeline(page);
  await expect(page.locator(canvasSelector)).toHaveAttribute("data-chromish-background-image", "none");
  await expect(page.locator(canvasSelector)).toHaveAttribute("data-chromish-background-image-ready", "false");
  for (const include of [false, true]) {
    await setSwitch(page, "export.includeBackground", include);
    await expect(control(page, "appearance.background")).toBeVisible();
  }
  await setColor(page, "appearance.background", "#DDEEFF");
  await expect(page.locator("[data-toolcraft-chromish-canvas]")).toHaveCSS("background-color", "rgb(221, 238, 255)");
  for (const applicabilityCase of applicabilityCases("appearance.background")) {
    await proveApplicabilityControlChange(page, "appearance.background", "appearance.background", applicabilityCase, async (field) => {
      const input = field.locator('input[type="text"]');
      await input.fill(applicabilityCase.selectorValue ? "#CCDDEE" : "#AACCEE");
      await input.press("Enter");
      await input.blur();
    });
  }
});
