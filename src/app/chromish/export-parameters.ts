import type { ToolcraftState } from "@/toolcraft/runtime";
import { readToolcraftOrientationPose } from "@/toolcraft/runtime/react";

import { chromishTargets } from "./control-sections";
import { safeCameraVector, type ChromishRenderParameters } from "./vgpu-renderer";

function numberValue(state: Readonly<ToolcraftState>, target: string, fallback: number): number {
  const value = state.values[target];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(state: Readonly<ToolcraftState>, target: string, fallback: string): string {
  const value = state.values[target];
  return typeof value === "string" ? value : fallback;
}

export function getChromishExportParameters(
  state: Readonly<ToolcraftState>,
  timelineProgress: number,
): ChromishRenderParameters {
  const orbit = readToolcraftOrientationPose(state.values[chromishTargets.orbit]);
  const startAngle = numberValue(state, chromishTargets.startAngle, -65);
  const direction = stringValue(state, chromishTargets.direction, "clockwise") === "counterclockwise" ? -1 : 1;
  return {
    background: stringValue(state, chromishTargets.background, "#F7F7F5"),
    cameraPosition: safeCameraVector(orbit.position, [0.15, 0.1, 4.5]),
    cameraUp: safeCameraVector(orbit.up, [0, 1, 0]),
    exposure: numberValue(state, "chrome.exposure", 1),
    includeBackground: state.values[chromishTargets.includeBackground] !== false,
    material: stringValue(state, chromishTargets.material, "diamond") as ChromishRenderParameters["material"],
    primaryColor: stringValue(state, chromishTargets.primaryColor, "#FF5A4F"),
    reflectionContrast: numberValue(state, chromishTargets.reflectionContrast, 1.25),
    roughness: numberValue(state, chromishTargets.roughness, 0.12),
    rotationRadians: (startAngle * Math.PI) / 180 + direction * timelineProgress * Math.PI * 2,
    secondaryColor: stringValue(state, chromishTargets.secondaryColor, "#FFD429"),
    studioRotationRadians: (numberValue(state, chromishTargets.studioRotation, 18) * Math.PI) / 180,
  };
}
