import { describe, expect, it } from "vitest";
import {
  draw,
  effect,
  frame,
  geometry,
  init,
  sampler,
  target,
} from "vgpu/mock";

import { CHROME_SHADER_WGSL, TONE_MAP_SHADER_WGSL, chromishMaterialIndex } from "./vgpu-renderer";

describe("Chromish vgpu bindings", () => {
  it("maps every selectable material to a stable WGSL branch", () => {
    expect(["diamond", "plastic", "glass", "fire", "playdough"].map((material) =>
      chromishMaterialIndex(material as Parameters<typeof chromishMaterialIndex>[0]),
    )).toEqual([0, 1, 2, 3, 4]);
    expect(CHROME_SHADER_WGSL).toContain("1.0 / 2.42");
    expect(CHROME_SHADER_WGSL).toContain("1.0 / 1.52");
    expect(CHROME_SHADER_WGSL).toContain("fireNoise");
  });

  it("compiles and executes the exact HDR, depth, MSAA, and tone-map passes", async () => {
    const gpu = await init({ label: "chromish-mock" });
    const hdr = target(gpu, { depth: true, format: "rgba16float", msaa: 4, size: [32, 24] });
    const ldr = target(gpu, { format: "rgba8unorm", size: [32, 24] });
    const mesh = geometry(gpu, {
      buffers: [
        { attributes: { position: "float32x3" }, data: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]) },
        { attributes: { normal: "float32x3" }, data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) },
      ],
      indices: new Uint32Array([0, 1, 2]),
      topology: "triangle-list",
    });
    const chrome = draw(gpu, {
      cull: "none",
      depth: { compare: "less-equal", write: true },
      geometry: mesh,
      shader: CHROME_SHADER_WGSL,
    });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    chrome.set({
      scene: {
        cameraPosition: [0, 0, 4.5, 1],
        controls: [1.25, 0.31, 0, 0],
        model: identity,
        secondaryColor: [1, 0.65, 0.02, 1],
        tile: [0, 0, 1, 1],
        tintRoughness: [0.79, 0.84, 0.86, 0.12],
        viewProjection: identity,
      },
    });
    const tone = effect(gpu, TONE_MAP_SHADER_WGSL, {
      set: {
        sceneSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
        sceneTexture: hdr,
        tone: {
          background: [0.93, 0.93, 0.91, 1],
          exposureAndMode: [1, 1, 0, 0],
        },
      },
    });

    await chrome.compile(hdr);
    await tone.compile(ldr);
    frame(gpu, (current) => {
      current.pass({ clear: [0, 0, 0, 0], clearDepth: 1, target: hdr }, chrome);
      current.pass({ clear: [0, 0, 0, 0], target: ldr }, tone);
    });
    await gpu.settled();
    expect((await ldr.read()).length).toBe(32 * 24 * 4);

    mesh.destroy();
    gpu.dispose();
  });
});
