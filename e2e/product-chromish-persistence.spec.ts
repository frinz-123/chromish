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

test("browser: chromish restores canvas media panels timeline and values after reload", async ({ page }) => {
  await openChromish(page);
  const session = await createProofSession(page);
  const observation = session.observe((root) => ({
    duration: root.querySelector('[aria-label="Playback position"]')?.getAttribute("aria-valuemax") ?? "hidden",
    file: root.querySelector('button[aria-label^="Remove "]')?.getAttribute("aria-label") ?? "none",
    height: (root.querySelector('[data-toolcraft-control-target="canvas.size.height"] input') as HTMLInputElement | null)?.value ?? "missing",
    route: (root.querySelector("[data-chromish-mesh-route]") as HTMLElement | null)?.dataset.chromishMeshRoute ?? "missing",
    timelineExpanded: root.querySelector('[data-toolcraft-control-target="panels.timeline.extended"] [role="switch"]')?.getAttribute("aria-checked") ?? "missing",
    material: (root.querySelector('[data-chromish-material]') as HTMLElement | null)?.dataset.chromishMaterial ?? "missing",
    primaryColor: (root.querySelector('[data-toolcraft-control-target="material.primaryColor"] input[type="text"]') as HTMLInputElement | null)?.value ?? "missing",
    width: (root.querySelector('[data-toolcraft-control-target="canvas.size.width"] input') as HTMLInputElement | null)?.value ?? "missing",
  }));
  const expected = {
    duration: "2",
    file: "Remove compound-mark.svg",
    height: "550",
    route: "vector",
    timelineExpanded: "true",
    material: "plastic",
    primaryColor: "#B8D7E8",
    width: "880",
  };
  await expectToolcraftPersistenceState(
    observation,
    session.targetAction("canvas.size.width", async (current) => {
      await uploadVectorSvg(current);
      await setCanvasSize(current, 880, 550);
      await chooseSelect(current, "material.type", "plastic");
      await setColor(current, "material.primaryColor", "#B8D7E8");
      await setTimelineDuration(current, "2s");
      await pauseTimeline(current);
      await current.getByRole("slider", { name: "Playback position" }).press("End");
      await current.waitForTimeout(600);
    }),
    session.reload(),
    expected,
    {
      assertRestoredOutput: async () => expect(page.locator(canvasSelector)).toHaveAttribute("data-chromish-mesh-route", "vector", { timeout: 20_000 }),
      requirementId: "persistence.reload",
      stabilityIntervalMs: 50,
      timeoutMs: 20_000,
    },
  );
});
