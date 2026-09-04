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
  observeChromishCanvasRaster,
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
    await pauseTimeline(page);
    for (const applicabilityCase of applicabilityCases(target)) {
      if (applicabilityCase.expectation === "visible") {
        await proveApplicabilityControlChange(page, target, target, applicabilityCase, async (field) => {
          await field.getByRole("slider").press("ArrowRight");
        });
      } else {
        await selectApplicabilityCase(await createProofSession(page), applicabilityCase, target);
      }
    }
  });
}

test("browser: chromish material.type", async ({ page }) => {
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await setSwitch(gpuPage, "panels.timeline.extended", true);
    await gpuPage.getByRole("slider", { name: "Playback position" }).press("Home");
    await setColor(gpuPage, "appearance.background", "#050509");
    const observations = new Map<string, Awaited<ReturnType<typeof observeChromishCanvasRaster>>>();
    for (const [material, label] of [
      ["chrome", "Chrome"],
      ["plastic", "Shiny plastic"],
      ["glass", "Glass"],
      ["fire", "Fire"],
      ["playdough", "Playdough"],
      ["diamond", "Diamond"],
    ] as const) {
      await chooseSelect(gpuPage, "material.type", label);
      await expect(gpuPage.locator(canvasSelector)).toHaveAttribute("data-chromish-material", material);
      await expect(gpuPage.locator(canvasSelector)).toHaveAttribute("data-chromish-cut", material === "diamond" ? "crown-pavilion" : "smooth-extrusion");
      await gpuPage.waitForTimeout(80);
      // Resolve narrow spectral edges instead of averaging them away in a 32px thumbnail.
      observations.set(material, await observeChromishCanvasRaster(gpuPage, 512));
      if (["diamond", "glass", "fire"].includes(material)) {
        await gpuPage.locator(canvasSelector).screenshot({ path: `.toolcraft/browser-artifacts/${material}-revised.png` });
      }
    }
    expect(new Set([...observations.values()].map(({ hash }) => hash)).size).toBe(6);
    expect(observations.get("diamond")!.luminanceStdDev).toBeGreaterThan(28);
    expect(observations.get("diamond")!.chromaticRatio).toBeGreaterThan(0.001);
    expect(observations.get("glass")!.luminanceStdDev).toBeGreaterThan(18);
    expect(observations.get("fire")!.warmRatio).toBeGreaterThan(0.025);
    await proveControlChange(gpuPage, "material.type", "material.type", async () => {
      await chooseSelect(gpuPage, "material.type", "Glass");
    });
  });
});

for (const [testName, target, color, attribute] of [
  ["browser: chromish material.primaryColor", "material.primaryColor", "#B8D7E8", "data-chromish-primary-color"],
  ["browser: chromish material.secondaryColor", "material.secondaryColor", "#FFF06A", "data-chromish-secondary-color"],
] as const) {
  test(testName, async ({ page }) => {
    await withGpuPage(page, async (gpuPage) => {
      await prepareGpuPage(gpuPage);
      let colorIndex = 0;
      for (const applicabilityCase of applicabilityCases(target)) {
        if (applicabilityCase.expectation === "visible") {
          const nextColor = colorIndex++ % 2 === 0 ? color : "#E87235";
          await proveApplicabilityControlChange(gpuPage, target, target, applicabilityCase, async (field) => {
            const input = field.locator('input[type="text"]');
            await input.fill(nextColor);
            await input.press("Enter");
          }, canvasSelector);
          await expect(gpuPage.locator(canvasSelector)).toHaveAttribute(attribute, nextColor);
        } else {
          await selectApplicabilityCase(await createProofSession(gpuPage), applicabilityCase, target);
        }
      }
    });
  });
}
