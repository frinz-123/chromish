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

import {
  CHROME_SHADER_WGSL,
  CHROMISH_BACKGROUND_IMAGE_TEXTURE_USAGE,
  TONE_MAP_SHADER_WGSL,
  chromishMaterialIndex,
} from "./vgpu-renderer";

describe("Chromish vgpu bindings", () => {
  it("allocates uploaded image textures for external-image transfer and shader sampling", () => {
    expect(CHROMISH_BACKGROUND_IMAGE_TEXTURE_USAGE).toEqual([
      "copy_dst",
      "render_attachment",
      "texture_binding",
    ]);
  });

  it("maps every selectable material to a stable WGSL branch", () => {
    expect(["chrome", "diamond", "plastic", "glass", "fire", "playdough"].map((material) =>
      chromishMaterialIndex(material as Parameters<typeof chromishMaterialIndex>[0]),
    )).toEqual([0, 1, 2, 3, 4, 5]);
    expect(CHROME_SHADER_WGSL).toContain("shadeOptical(input, true)");
    expect(TONE_MAP_SHADER_WGSL).toContain("composeFire");
    expect(CHROME_SHADER_WGSL).toContain("chromeEnvironment(reflect(-v, brushedNormal)");
  });

  it("compiles and executes the exact HDR, depth, MSAA, and tone-map passes", async () => {
    const gpu = await init({ label: "chromish-mock" });
    const hdr = target(gpu, { depth: true, format: "rgba16float", msaa: 4, size: [32, 24] });
    const ldr = target(gpu, { format: "rgba8unorm", size: [32, 24] });
    const background = target(gpu, { format: "rgba8unorm", size: [1, 1] });
    const backgroundSampler = sampler(gpu, { magFilter: "linear", minFilter: "linear" });
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
      set: { backgroundSampler, backgroundTexture: background, exitTexture: background },
    });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    chrome.set({
      scene: {
        backgroundColorAndMode: [0.93, 0.93, 0.91, 0],
        cameraPosition: [0, 0, 4.5, 1],
        backgroundInfo: [32, 24, 1, 1],
        backgroundTile: [0, 0, 1, 1],
        controls: [1.25, 0.31, 0, 0],
        materialSettings: [1, 0.15, 0, 0.7],
        optics: [0.3, 0, 0, 0],
        model: identity,
        secondaryColor: [1, 0.65, 0.02, 1],
        tile: [0, 0, 1, 1],
        tintRoughness: [0.79, 0.84, 0.86, 0.12],
        viewProjection: identity,
      },
    });
    const tone = effect(gpu, TONE_MAP_SHADER_WGSL, {
      set: {
        backgroundSampler,
        backgroundTexture: background,
        sceneSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
        sceneTexture: hdr,
        tone: {
          background: [0.93, 0.93, 0.91, 1],
          backgroundInfo: [32, 24, 1, 1],
          backgroundTile: [0, 0, 1, 1],
          exposureAndMode: [1, 1, 0, 0],
          fireInfo: [0, 1, 0, 0],
        },
      },
    });

    await chrome.compile(hdr);
    await tone.compile(ldr);
    frame(gpu, (current) => {
      current.pass({ clear: [0, 0, 0, 0], clearDepth: 1, target: hdr }, (pass) => {
        pass.draw(chrome);
      });
      current.pass({ clear: [0, 0, 0, 0], target: ldr }, tone);
    });
    await gpu.settled();
    expect((await ldr.read()).length).toBe(32 * 24 * 4);

    mesh.destroy();
    gpu.dispose();
  });
});
