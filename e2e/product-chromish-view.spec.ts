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

test("browser: chromish orientation gizmo and model orbit", async ({ page }) => {
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    const session = await createProofSession(gpuPage);
    const observation = session.observe((root) => {
      const gizmo = root.querySelector<HTMLElement>('[data-toolcraft-orientation-target="view.orbit"]');
      const canvas = root.querySelector<HTMLElement>("[data-chromish-camera-position]");
      const world = root.querySelector<HTMLElement>("[data-toolcraft-canvas-world]");
      const camera = canvas?.dataset.chromishCameraPosition ?? "missing-camera";
      return {
        outputSignature: camera,
        pixelSignature: `chrome-pixels:${camera}`,
        pose: JSON.parse(gizmo?.dataset.toolcraftOrientationPose ?? "null"),
        poseTarget: gizmo?.dataset.toolcraftOrientationTarget ?? "missing",
        presentationCacheKey: `mesh:${canvas?.dataset.chromishTriangleCount ?? "missing"}`,
        presentationDocumentId: "compound-mark.svg",
        viewportOffsetX: Number(world?.dataset.toolcraftCanvasOffsetX ?? 0),
        viewportOffsetY: Number(world?.dataset.toolcraftCanvasOffsetY ?? 0),
      };
    });
    const options = { requirementId: "view.orientation", stabilityIntervalMs: 20, target: "view.orbit" } as const;
    await expectToolcraftOrientationAxisDrag(observation, session, { ...options, dragDelta: { x: 18, y: -12 } });
    await expectToolcraftOrientationAxisSnap(observation, session, "+z", options);
    await gpuPage.getByRole("button", { name: "Reset Geometry section" }).click();
    const baseline = await readToolcraftBrowserObservation(observation);
    const changed = await expectToolcraftOrientationModelDrag(observation, session, { ...options, dragDelta: { x: 24, y: -16 } });
    await expectToolcraftOrientationUndoReset(
      observation,
      session.targetAction("view.orbit", (current) => current.getByRole("button", { name: "Undo" }).click()),
      session.targetAction("view.orbit", (current) => current.getByRole("button", { name: "Redo" }).click()),
      session.targetAction("view.orbit", (current) => current.getByRole("button", { name: "Reset Geometry section" }).click()),
      baseline,
      changed,
      options,
    );
    await expectToolcraftOrientationCanvasMissPan(
      observation,
      session.targetAction("view.orbit", async (current) => {
        const box = await current.locator(canvasSelector).boundingBox();
        if (!box) throw new Error("Missing Chromish canvas bounds");
        await current.mouse.move(box.x + 3, box.y + 3);
        await current.mouse.down();
        await current.mouse.move(box.x + 36, box.y + 28, { steps: 6 });
        await current.mouse.up();
      }),
      options,
    );
  });
});

test("browser: chromish export excludes orientation gizmo", async ({ page }) => {
  await withGpuPage(page, async (gpuPage) => {
    await prepareGpuPage(gpuPage);
    await chooseSelect(gpuPage, "export.image.resolution", "2K");
    await expectExportExcludesCanvasHandles(
      gpuPage,
      () => downloadFrom(gpuPage, "Export PNG"),
      async (download) => (await inspectImageFromDownload(gpuPage, download)).inspection,
      { requirementId: "view.orientation#export-clean", target: "view.orbit" },
    );
  });
});

