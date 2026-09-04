import { expect, it } from "vitest";
import { deriveToolcraftPerformancePaths } from "@/toolcraft/runtime";
import { appPerformance, appRenderPlanAssessment } from "../app-performance";
import { appSchema } from "../app-schema";

it("keeps the optical render plan structurally valid", () => {
  expect(appRenderPlanAssessment.errors).toEqual([]);
  const paths = deriveToolcraftPerformancePaths(appSchema, appPerformance);
  expect(paths.some(path => path.interaction === "timeline-playback" && path.invalidates.includes("chrome-hdr"))).toBe(true);
});
