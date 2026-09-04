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

test("browser: chromish media.svgSource", async ({ page }) => {
  await openChromish(page);
  const canvas = page.locator(canvasSelector);
  await expect(canvas).toHaveAttribute("data-chromish-mesh-route", "empty");
  await expect(page.getByRole("status")).toContainText("requires WebGPU");
  const session = await createProofSession(page);
  const lifecycle = session.observe((root) => {
    const output = root.querySelector<HTMLElement>("[data-chromish-mesh-route]");
    const remove = root.querySelector<HTMLButtonElement>('button[aria-label^="Remove "]');
    return {
      itemIds: remove?.getAttribute("aria-label")?.replace("Remove ", "") ? [remove.getAttribute("aria-label")!.replace("Remove ", "")] : [],
      outputSignature: output?.dataset.chromishMeshRoute ?? "missing",
    };
  });
  await expectToolcraftMediaLifecycle(
    lifecycle,
    session.controlAction("media.svgSource", async (field) => {
      await field.locator('input[type="file"]').setInputFiles({
        buffer: Buffer.from(vectorSvg),
        mimeType: "image/svg+xml",
        name: "compound-mark.svg",
      });
    }),
    { itemIds: ["compound-mark.svg"], outputSignature: "vector" },
    { requirementId: "media.svgSource", stabilityIntervalMs: 20, timeoutMs: 20_000 },
  );
  const validTriangles = await canvas.getAttribute("data-chromish-triangle-count");
  await uploadSvg(page, unsafeSvg, "unsafe.svg");
  await expect(page.getByRole("alert")).toContainText("previous valid object remains");
  await expect(canvas).toHaveAttribute("data-chromish-mesh-route", "vector");
  await expect(canvas).toHaveAttribute("data-chromish-triangle-count", validTriangles ?? "");
  await page.getByRole("button", { name: "Remove unsafe.svg" }).click();
  await expect(canvas).toHaveAttribute("data-chromish-mesh-route", "empty");
  await uploadSvg(page, rasterSvg, "raster-mark.svg");
  await expect(canvas).toHaveAttribute("data-chromish-mesh-route", "raster", { timeout: 20_000 });
  await page.getByRole("button", { name: "Reset controls" }).click();
  await expect(canvas).toHaveAttribute("data-chromish-mesh-route", "empty");
});

test("browser: chromish media.backgroundImage", async ({ page }) => {
  await openChromish(page);
  const canvas = page.locator(canvasSelector);
  await expect(canvas).toHaveAttribute("data-chromish-background-image", "none");

  const session = await createProofSession(page);
  const observation = session.observe((root) => {
    const output = root.querySelector<HTMLElement>("[data-chromish-background-image]");
    const fileName = output?.dataset.chromishBackgroundImage ?? "none";
    return {
      itemIds: fileName === "none" ? [] : [fileName],
      outputSignature: `${fileName}:${output?.dataset.chromishBackgroundTransform ?? "{}"}:${output?.dataset.chromishBackgroundImageReady ?? "false"}`,
    };
  });
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxMDAwMAAAAwBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
  await expectToolcraftMediaLifecycle(
    observation,
    session.controlAction("media.backgroundImage", async (field) => {
      await field.locator('input[type="file"]').setInputFiles({ buffer: tinyPng, mimeType: "image/png", name: "refraction-test.png" });
    }),
    { itemIds: ["refraction-test.png"], outputSignature: "refraction-test.png:{}:true" },
    { requirementId: "media.backgroundImage", stabilityIntervalMs: 20, timeoutMs: 20_000 },
  );
  await page.getByRole("button", { name: "90°" }).click();
  await expect(canvas).toHaveAttribute("data-chromish-background-transform", /"rotationDeg":90/u);
  await expect(canvas).toHaveAttribute("data-chromish-background-image-ready", "true", { timeout: 20_000 });
  await page.getByRole("button", { name: "Flip H" }).click();
  await expect(canvas).toHaveAttribute("data-chromish-background-transform", /"flipHorizontal":true/u);
  await expect(canvas).toHaveAttribute("data-chromish-background-image-ready", "true", { timeout: 20_000 });
  await page.getByRole("button", { name: "Remove refraction-test.png" }).click();
  await expect(canvas).toHaveAttribute("data-chromish-background-image", "none");
  await page.getByRole("button", { name: "Reset controls" }).click();
  await expect(canvas).toHaveAttribute("data-chromish-background-image", "none");
});
