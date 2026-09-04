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

test("browser: chromish actions.output", async ({ page }) => {
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await setTimelineDuration(gpuPage);
    await gpuPage.waitForTimeout(500);
    const session = await createProofSession(gpuPage);
    await waitForGpuCanvasReady(gpuPage);
    for (const [button, entries] of [
      ["Download GLB Kit", ["chromish-object.glb", "embed.html", "README.md", "compound-mark.svg"]],
      ["Download VGPU Kit", ["object.chrmesh", "settings.json", "src/main.ts", "README.md"]],
    ] as const) {
      const download = await downloadFrom(gpuPage, button);
      const path = await download.path();
      expect(path).not.toBeNull();
      expect(Object.keys(unzipSync(await fs.readFile(path!)))).toEqual(expect.arrayContaining([...entries]));
    }
    const imageDownload = await downloadFrom(gpuPage, "Export PNG");
    const image = await inspectImageFromDownload(gpuPage, imageDownload);
    if (!image.inspection.nonBackgroundBounds) throw new Error("Image export is missing the chrome object.");
    await expectToolcraftImageExportArtifact(session.targetAction("actions.output", async () => imageDownload), {
      backgroundRgba,
      expectedBounds: image.inspection.nonBackgroundBounds,
      expectedHeight: 2560,
      expectedMediaType: "image/png",
      expectedPixels: [expectedProductPixel(image.observation.normalizedPixels)],
      expectedWidth: 4096,
      page: gpuPage,
      requirementId: "actions.output",
    });
    const videoDownload = await downloadFrom(gpuPage, "Export Video");
    const video = await inspectVideoFromDownload(gpuPage, videoDownload);
    await expectToolcraftVideoExportArtifact(session.targetAction("actions.output", async () => videoDownload), {
      animated: true,
      backgroundRgba,
      expectedDurationSeconds: 1,
      expectedHeight: 600,
      expectedMediaType: "video/mp4",
      expectedSamples: video.observations.map((observation, index) => ({ pixels: [expectedProductPixel(observation.normalizedPixels)], timeSeconds: video.sampleTimes[index]! })),
      expectedWidth: 960,
      page: gpuPage,
      requirementId: "actions.output",
      schedule: oneSecondSchedule(),
    });
  });
});
