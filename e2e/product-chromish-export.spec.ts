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

test("browser: chromish export.includeBackground", async ({ page }) => {
  await openChromish(page);
  await uploadVectorSvg(page);
  await setSwitch(page, "canvas.infinity", true);
  const infiniteBackground = await observeInfinityCanvasBackground(page);
  await setSwitch(page, "export.includeBackground", false);
  const excludedBackground = await observeInfinityCanvasBackground(page);
  await expect(page.locator("[data-toolcraft-chromish-canvas]")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(control(page, "canvas.infinity").getByRole("switch")).toBeDisabled();
  await setSwitch(page, "export.includeBackground", true);
  const restoredBackground = await observeInfinityCanvasBackground(page);
  await expectToolcraftInfinityCanvasBackgroundEvidence(
    { backgroundExcluded: excludedBackground, backgroundRestored: restoredBackground, infinite: infiniteBackground },
    { expectedBackgroundColor: "#F7F7F5", requirementId: "export.includeBackground", target: "export.includeBackground" },
  );
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await chooseSelect(gpuPage, "export.image.resolution", "2K");
    await setCanvasSize(gpuPage, 96, 60);
    await setTimelineDuration(gpuPage);
    await gpuPage.waitForTimeout(500);
    const session = await createProofSession(gpuPage);
    await waitForGpuCanvasReady(gpuPage);
    const preview = session.observe((root) => {
      const canvas = root.querySelector<HTMLElement>("[data-chromish-include-background]");
      const visible = canvas?.dataset.chromishIncludeBackground === "true";
      return { backgroundVisible: visible, outputSignature: visible ? "background-visible" : "background-transparent" };
    });
    await expectToolcraftBackgroundOutputSemantics(
      preview,
      session.controlAction("export.includeBackground", async (field) => field.getByRole("switch").click()),
      { backgroundVisible: false, outputSignature: "background-transparent" },
      session.targetAction("export.includeBackground", (current) => downloadFrom(current, "Export PNG")),
      async (download) => {
        const image = await inspectImageFromDownload(gpuPage, download);
        return { ...image.inspection, backgroundAlpha: image.observation.normalizedPixels[3]! };
      },
      {
        requirementId: "export.includeBackground",
        stabilityIntervalMs: 20,
        video: {
          exportArtifact: session.targetAction("export.includeBackground", (current) => downloadFrom(current, "Export Video")),
          inspectArtifact: async (download) => {
            const video = await inspectVideoFromDownload(gpuPage, download);
            return {
              ...video.inspection,
              backgroundIncluded:
                video.inspection.mediaType === "video/mp4" ||
                video.observations.every((item) => item.normalizedPixels[3] === 255),
            };
          },
        },
      },
    );
  });
});


test("browser: chromish export.image.format", async ({ page }) => {
  await openChromish(page);
  for (const format of ["PNG", "JPG"]) {
    await chooseSelect(page, "export.image.format", format);
    await expect(control(page, "export.image.resolution")).toBeVisible();
  }
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await gpuPage.waitForTimeout(500);
    const session = await createProofSession(gpuPage);
    await waitForGpuCanvasReady(gpuPage);
    for (const applicabilityCase of applicabilityCases("export.image.format")) {
      await selectApplicabilityCase(session, applicabilityCase, "export.image.format");
      await chooseSelect(gpuPage, "export.image.format", "JPG");
      await expectToolcraftExportedArtifact(
        session.targetAction("export.image.format", (current) => downloadFrom(current, "Export PNG")),
        async (download) => (await inspectImageFromDownload(gpuPage, download)).inspection,
        { requirementId: applicabilityRequirementId("export.image.format", applicabilityCase) },
      );
    }
  });
});

test("browser: chromish export.image.resolution", async ({ page }) => {
  await openChromish(page);
  for (const resolution of ["2K", "4K", "8K"]) {
    await chooseSelect(page, "export.image.resolution", resolution);
    await expect(control(page, "export.image.format")).toBeVisible();
  }
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await gpuPage.waitForTimeout(500);
    const session = await createProofSession(gpuPage);
    await waitForGpuCanvasReady(gpuPage);
    for (const applicabilityCase of applicabilityCases("export.image.resolution")) {
      await selectApplicabilityCase(session, applicabilityCase, "export.image.resolution");
      await chooseSelect(gpuPage, "export.image.resolution", "2K");
      await expectToolcraftExportedArtifact(
        session.targetAction("export.image.resolution", (current) => downloadFrom(current, "Export PNG")),
        async (download) => (await inspectImageFromDownload(gpuPage, download)).inspection,
        { requirementId: applicabilityRequirementId("export.image.resolution", applicabilityCase) },
      );
    }
  });
});

test("browser: chromish export.video.format", async ({ page }) => {
  await openChromish(page);
  for (const format of ["MP4", "WebM"]) {
    await chooseSelect(page, "export.video.format", format);
    await expect(control(page, "export.video.resolution")).toBeVisible();
  }
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await setTimelineDuration(gpuPage);
    await gpuPage.waitForTimeout(500);
    const session = await createProofSession(gpuPage);
    await waitForGpuCanvasReady(gpuPage);
    for (const applicabilityCase of applicabilityCases("export.video.format")) {
      await selectApplicabilityCase(session, applicabilityCase, "export.video.format");
      await chooseSelect(gpuPage, "export.video.format", "WebM");
      await expectToolcraftExportedArtifact(
        session.targetAction("export.video.format", (current) => downloadFrom(current, "Export Video")),
        async (download) => (await inspectVideoFromDownload(gpuPage, download)).inspection,
        { requirementId: applicabilityRequirementId("export.video.format", applicabilityCase) },
      );
    }
  });
});

test("browser: chromish export.video.resolution", async ({ page }) => {
  await openChromish(page);
  for (const resolution of ["Current", "4K"]) {
    await chooseSelect(page, "export.video.resolution", resolution);
    await expect(control(page, "export.video.format")).toBeVisible();
  }
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await setCanvasSize(gpuPage, 96, 60);
    await setTimelineDuration(gpuPage);
    await gpuPage.waitForTimeout(500);
    const session = await createProofSession(gpuPage);
    await waitForGpuCanvasReady(gpuPage);
    for (const applicabilityCase of applicabilityCases("export.video.resolution")) {
      await selectApplicabilityCase(session, applicabilityCase, "export.video.resolution");
      await chooseSelect(gpuPage, "export.video.resolution", "Current");
      await expectToolcraftExportedArtifact(
        session.targetAction("export.video.resolution", (current) => downloadFrom(current, "Export Video")),
        async (download) => (await inspectVideoFromDownload(gpuPage, download)).inspection,
        { requirementId: applicabilityRequirementId("export.video.resolution", applicabilityCase) },
      );
    }
  });
});

