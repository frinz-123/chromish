import type { ChromishCpuMesh } from "./svg-mesh";
import type { ChromishRenderParameters, ChromishVgpuRenderer } from "./vgpu-renderer";

export type ChromishRuntimeSnapshot = Readonly<{
  directionSign: -1 | 1;
  durationSeconds: number;
  fileName: string;
  mesh: ChromishCpuMesh;
  parameters: ChromishRenderParameters;
  renderer: ChromishVgpuRenderer;
  sourceSvg: string;
  startAngleDegrees: number;
}>;

let activeSnapshot: ChromishRuntimeSnapshot | null = null;

export function getChromishRuntimeSnapshot(): ChromishRuntimeSnapshot | null {
  return activeSnapshot;
}

export function setChromishRuntimeSnapshot(snapshot: ChromishRuntimeSnapshot | null): void {
  activeSnapshot = snapshot;
}
