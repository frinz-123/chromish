import { expect } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import type { ToolcraftSvgArtifactInspection } from "./export-artifact-helpers";
import { assertToolcraftInspectedSvgArtifact } from "./svg-artifact-inspection";

export async function expectToolcraftInfinityCanvasSvgExportEvidence(
  artifacts: Readonly<{
    finite: ToolcraftSvgArtifactInspection;
    infinite: ToolcraftSvgArtifactInspection;
  }>,
  options: Readonly<{
    expectedFiniteSize: Readonly<{ height: number; width: number }>;
    expectedInfiniteSize: Readonly<{ height: number; width: number }>;
    requirementId: string;
    target: string;
  }>,
): Promise<void> {
  assertToolcraftInspectedSvgArtifact(artifacts.finite);
  assertToolcraftInspectedSvgArtifact(artifacts.infinite);
  expect(artifacts.finite).toMatchObject(options.expectedFiniteSize);
  expect(artifacts.infinite).toMatchObject(options.expectedInfiniteSize);

  for (const artifact of [artifacts.finite, artifacts.infinite]) {
    expect(artifact.byteLength).toBeGreaterThan(100);
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(artifact.mediaType).toBe("image/svg+xml");
    expect(artifact.vectorElementCount).toBeGreaterThan(0);
  }

  expect({ height: artifacts.infinite.height, width: artifacts.infinite.width })
    .not.toEqual({
      height: artifacts.finite.height,
      width: artifacts.finite.width,
    });

  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "infinity-scene-bounds-svg-export",
    requirementId: options.requirementId,
    target: options.target,
  });
}
