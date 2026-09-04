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

test("browser: chromish infinity canvas mode and restoration", async ({ page }) => {
  await openChromish(page);
  await uploadVectorSvg(page);
  await page.waitForTimeout(500);
  const before = await observeInfinityCanvas(page);
  await setSwitch(page, "canvas.infinity", true);
  const enabled = await observeInfinityCanvas(page);
  await dragToolcraftCanvasViewport(page, { x: 24, y: 18 });
  const afterPan = await observeInfinityCanvas(page);
  await page.reload();
  await expect(page.locator("[data-toolcraft-chromish-canvas]")).toBeVisible();
  const afterReload = await observeInfinityCanvas(page);
  await setSwitch(page, "canvas.infinity", false);
  const restored = await observeInfinityCanvas(page);
  await page.getByRole("button", { name: "Undo" }).click();
  const undone = await observeInfinityCanvas(page);
  await page.getByRole("button", { name: "Redo" }).click();
  const redone = await observeInfinityCanvas(page);
  await expectToolcraftInfinityCanvasModeEvidence(
    { afterPan, afterReload, before, enabled, redone, restored, undone },
    {
      expectedFiniteSize: { height: 600, width: 960 },
      expectedSceneRect: { height: 600, width: 960, x: -480, y: -300 },
      requirementId: "canvas.infinity",
      target: "canvas.infinity",
    },
  );
});

test("browser: chromish infinity image export bounds", async ({ page }) => {
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await setCanvasSize(gpuPage, 800, 600);
    await chooseSelect(gpuPage, "export.image.resolution", "2K");
    const finite = await inspectImage(gpuPage);
    await setSwitch(gpuPage, "canvas.infinity", true);
    await expect(gpuPage.locator(canvasSelector)).toHaveAttribute("data-chromish-renderer-ready", "true", { timeout: 25_000 });
    await expect.poll(async () => Number(await gpuPage.locator(canvasSelector).getAttribute("data-chromish-triangle-count"))).toBeGreaterThan(0);
    const infinite = await inspectImage(gpuPage);
    await expectToolcraftInfinityCanvasImageExportEvidence(
      { finite: finite.inspection, infinite: infinite.inspection },
      {
        expectedFiniteSize: { height: 1536, width: 2048 },
        expectedInfiniteSize: { height: 1280, width: 2048 },
        requirementId: "canvas.infinity.image-export",
        target: "canvas.infinity",
      },
    );
  });
});

test("browser: chromish infinity video export bounds", async ({ page }) => {
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await setCanvasSize(gpuPage, 800, 600);
    const finite = await inspectOneSecondVideo(gpuPage);
    await setSwitch(gpuPage, "canvas.infinity", true);
    await expect(gpuPage.locator(canvasSelector)).toHaveAttribute("data-chromish-renderer-ready", "true", { timeout: 25_000 });
    await expect.poll(async () => Number(await gpuPage.locator(canvasSelector).getAttribute("data-chromish-triangle-count"))).toBeGreaterThan(0);
    const infinite = await inspectOneSecondVideo(gpuPage);
    await expectToolcraftInfinityCanvasVideoExportEvidence(
      { finite: finite.inspection, infinite: infinite.inspection },
      {
        expectedFiniteSize: { height: 600, width: 800 },
        expectedInfiniteSize: { height: 600, width: 960 },
        requirementId: "canvas.infinity.video-export",
        target: "canvas.infinity",
      },
    );
  });
});

test("browser: chromish render scale backing during interaction playback and steady state", async ({ page }) => {
  await openChromish(page);
  await uploadVectorSvg(page);
  const canvas = page.locator(canvasSelector);
  await expectToolcraftCanvasRenderScaleEvidence(page, {
    canvasSelector,
    requirementId: "canvas.render-scale",
    selectedScale: 2,
    stateTransitions: [
      {
        state: "interaction",
        run: async () => {
          const box = await canvas.boundingBox();
          if (!box) throw new Error("Missing canvas bounds");
          await page.mouse.move(box.x + 3, box.y + 3);
          await page.mouse.down();
          await page.mouse.move(box.x + 20, box.y + 16);
          await page.mouse.up();
        },
      },
      { state: "playback", run: async () => page.waitForTimeout(80) },
      { state: "steady", run: async () => { await pauseTimeline(page); await page.waitForTimeout(80); } },
    ],
    target: "canvas.renderScale",
  });
});

