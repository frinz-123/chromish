import {
  Matrix4,
  PerspectiveCamera,
  Vector3,
} from "three";
import {
  draw,
  effect,
  frame,
  geometry,
  init,
  sampler,
  surface,
  target,
  type Draw,
  type Effect,
  type Geometry,
  type Gpu,
  type Surface,
  type Target,
} from "vgpu";
import { type Texture } from "vgpu/core";
import { CHROME_SHADER_WGSL } from "./surface-shader";
export { CHROME_SHADER_WGSL } from "./surface-shader";
import { OPTICAL_EXIT_SHADER_WGSL } from "./optical-exit-shader";
import { FIRE_NOISE_WGSL, FIRE_COMPOSITE_WGSL } from "./fire-shader";
import { defaultMaterialSettings, type MaterialSettings } from "./customization";

import type { ChromishCpuMesh } from "./svg-mesh";

export const CHROMISH_BACKGROUND_IMAGE_TEXTURE_USAGE = [
  "copy_dst",
  "render_attachment",
  "texture_binding",
] as const;


export const TONE_MAP_SHADER_WGSL = /* wgsl */ `
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;
@group(0) @binding(2) var backgroundTexture: texture_2d<f32>;
@group(0) @binding(3) var backgroundSampler: sampler;

struct ToneUniforms {
  background: vec4f,
  exposureAndMode: vec4f,
  fireInfo: vec4f,
  backgroundInfo: vec4f,
  backgroundTile: vec4f,
}

@group(0) @binding(4) var<uniform> tone: ToneUniforms;

${FIRE_NOISE_WGSL}
${FIRE_COMPOSITE_WGSL}

fn aces(value: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((value * (a * value + b)) / (value * (c * value + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var sampleValue = textureSampleLevel(sceneTexture, sceneSampler, uv, 0.0);
  if (tone.fireInfo.y > 0.5) { sampleValue = composeFire(uv, sampleValue); }
  let exposed = aces(sampleValue.rgb * tone.exposureAndMode.x);
  let mapped = max(mix(vec3f(dot(exposed, vec3f(0.2126, 0.7152, 0.0722))), exposed, tone.exposureAndMode.w), vec3f(0.0));
  let alpha = clamp(sampleValue.a, 0.0, 1.0);
  if (tone.exposureAndMode.y > 0.5) {
    var backdrop = tone.background.rgb;
    if (tone.exposureAndMode.z > 0.5) {
      let fullUv = tone.backgroundTile.xy + uv * tone.backgroundTile.zw;
      let outputAspect = tone.backgroundInfo.x / max(tone.backgroundInfo.y, 1.0);
      let imageAspect = tone.backgroundInfo.z / max(tone.backgroundInfo.w, 1.0);
      var covered = fullUv;
      if (imageAspect > outputAspect) {
        covered.x = 0.5 + (fullUv.x - 0.5) * (outputAspect / imageAspect);
      } else {
        covered.y = 0.5 + (fullUv.y - 0.5) * (imageAspect / outputAspect);
      }
      backdrop = textureSample(backgroundTexture, backgroundSampler, covered).rgb;
    }
    return vec4f(mix(backdrop, mapped, alpha), 1.0);
  }
  return vec4f(mapped * alpha, alpha);
}
`;

export type ChromishRenderParameters = Readonly<{
  materialSettings?: MaterialSettings;
  objectScale?: number;
  fieldOfView?: number;
  saturation?: number;
  background: string;
  backgroundImageSize: readonly [number, number];
  cameraPosition: readonly [number, number, number];
  cameraUp: readonly [number, number, number];
  exposure: number;
  includeBackground: boolean;
  includeBackgroundImage: boolean;
  loopPhaseRadians: number;
  material: "chrome" | "diamond" | "plastic" | "glass" | "fire" | "playdough";
  primaryColor: string;
  reflectionContrast: number;
  roughness: number;
  rotationRadians: number;
  secondaryColor: string;
  studioRotationRadians: number;
}>;

export function chromishMaterialIndex(material: ChromishRenderParameters["material"]): number {
  return { chrome: 0, diamond: 1, plastic: 2, glass: 3, fire: 4, playdough: 5 }[material];
}

function hexToLinearRgba(value: string): [number, number, number, number] {
  const match = /^#?([0-9a-f]{6})$/iu.exec(value);
  if (!match) return [1, 1, 1, 1];
  const packed = Number.parseInt(match[1]!, 16);
  const srgb = [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255].map((channel) => channel / 255);
  const linear = srgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return [linear[0]!, linear[1]!, linear[2]!, 1];
}

function matricesFor(
  width: number,
  height: number,
  parameters: ChromishRenderParameters,
): { camera: PerspectiveCamera; model: Matrix4; viewProjection: Matrix4 } {
  const camera = new PerspectiveCamera(parameters.fieldOfView ?? 33, width / Math.max(1, height), 0.1, 100);
  camera.position.fromArray(parameters.cameraPosition);
  if (parameters.material === "fire") camera.position.multiplyScalar(1.16);
  camera.up.fromArray(parameters.cameraUp);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const model = new Matrix4().makeRotationY(parameters.rotationRadians).scale(new Vector3().setScalar(parameters.objectScale ?? 1));
  const viewProjection = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return { camera, model, viewProjection };
}

function tileUniform(
  fullWidth: number,
  fullHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number, number, number] {
  const left = (2 * x) / fullWidth - 1;
  const right = (2 * (x + width)) / fullWidth - 1;
  const top = 1 - (2 * y) / fullHeight;
  const bottom = 1 - (2 * (y + height)) / fullHeight;
  return [(left + right) * 0.5, (top + bottom) * 0.5, (right - left) * 0.5, (top - bottom) * 0.5];
}

export class ChromishVgpuRenderer {
  private readonly gpu: Gpu;
  private readonly canvasSurface: Surface;
  private readonly previewHdr: Target;
  private readonly exportHdr: Target;
  private readonly exportLdr: Target;
  private readonly toneMap: Effect;
  private readonly backgroundSampler: GPUSampler;
  private backgroundTexture: Texture;
  private backgroundLoadGeneration = 0;
  private meshGeometry: Geometry | null = null;
  private gemGeometry: Geometry | null = null;
  private gemDraw: Draw | null = null;
  private fireGeometry: Geometry | null = null;
  private fireDraw: Draw | null = null;
  private meshY: readonly [number, number] = [-1, 1];
  private opticalDepth = 0.3;
  private gemDepth = 0.3;
  private readonly exitTarget: Target;
  private smoothExitDraw: Draw | null = null;
  private gemExitDraw: Draw | null = null;
  private chromeDraw: Draw | null = null;
  private disposed = false;

  private constructor(
    gpu: Gpu,
    canvasSurface: Surface,
    previewHdr: Target,
    exportHdr: Target,
    exportLdr: Target,
    toneMap: Effect,
    backgroundSampler: GPUSampler,
    backgroundTexture: Texture,
  ) {
    this.gpu = gpu;
    this.exitTarget = target(gpu, { size: [1, 1], format: "rgba16float", depth: true, label: "chromish-optical-exit" });
    this.canvasSurface = canvasSurface;
    this.previewHdr = previewHdr;
    this.exportHdr = exportHdr;
    this.exportLdr = exportLdr;
    this.toneMap = toneMap;
    this.backgroundSampler = backgroundSampler;
    this.backgroundTexture = backgroundTexture;
  }

  static async create(canvas: HTMLCanvasElement, size: readonly [number, number]): Promise<ChromishVgpuRenderer> {
    if (!("gpu" in navigator)) throw new Error("WebGPU is unavailable in this browser.");
    const gpu = await init({ label: "Chromish" });
    if (import.meta.env.DEV) {
      for (const [label, code] of [["surface", CHROME_SHADER_WGSL], ["composition", TONE_MAP_SHADER_WGSL]] as const) {
        const diagnosticModule = gpu.gpu.createShaderModule({ code, label: `chromish-${label}-diagnostic-shader` });
        const compilation = await diagnosticModule.getCompilationInfo();
        for (const message of compilation.messages) {
          if (message.type === "error") {
            console.error(`Chromish ${label} WGSL ${message.lineNum}:${message.linePos}`, message.message);
          }
        }
      }
    }
    const canvasSurface = surface(gpu, canvas, {
      alphaMode: "premultiplied",
      autoResize: false,
      label: "chromish-canvas",
      size,
    });
    const previewHdr = target(gpu, {
      depth: true,
      format: "rgba16float",
      label: "chromish-preview-hdr",
      msaa: 4,
      size,
    });
    const exportHdr = target(gpu, {
      depth: true,
      format: "rgba16float",
      label: "chromish-export-hdr",
      size: [1, 1],
    });
    const exportLdr = target(gpu, {
      format: "rgba8unorm",
      label: "chromish-export-ldr",
      size: [1, 1],
    });
    const backgroundSampler = sampler(gpu, { magFilter: "linear", minFilter: "linear" });
    const backgroundTexture = gpu.device.createTexture({
      format: "rgba8unorm",
      label: "chromish-background-placeholder",
      size: [1, 1],
      usage: ["copy_dst", "texture_binding"],
    });
    gpu.gpu.queue.writeTexture({ texture: backgroundTexture.gpu }, new Uint8Array([247, 247, 245, 255]), { bytesPerRow: 4 }, [1, 1]);
    const toneMap = effect(gpu, TONE_MAP_SHADER_WGSL, {
      label: "chromish-tone-map",
      set: {
        backgroundSampler,
        backgroundTexture,
        sceneSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
        sceneTexture: previewHdr,
        tone: {
          background: [0.93, 0.93, 0.91, 1],
          exposureAndMode: [1, 1, 0, 0],
          fireInfo: [0, 0, 0, 0],
          backgroundInfo: [1, 1, 1, 1],
          backgroundTile: [0, 0, 1, 1],
        },
      },
    });
    gpu.onError((error) => {
      const nativeMessage = typeof (error.cause as { message?: unknown } | undefined)?.message === "string"
        ? (error.cause as { message: string }).message
        : String(error.cause ?? "No native WebGPU diagnostic was provided.");
      console.error("Chromish vgpu error", error, nativeMessage);
    });
    await toneMap.compile(exportLdr);
    return new ChromishVgpuRenderer(gpu, canvasSurface, previewHdr, exportHdr, exportLdr, toneMap, backgroundSampler, backgroundTexture);
  }

  get size(): readonly [number, number] {
    return this.canvasSurface.size;
  }

  setMesh(mesh: ChromishCpuMesh | null): void {
    this.fireGeometry?.destroy();
    this.fireGeometry = null;
    this.fireDraw = null;
    this.meshGeometry?.destroy();
    this.gemGeometry?.destroy();
    this.gemGeometry = null;
    this.gemDraw = null;
    this.smoothExitDraw = null;
    this.gemExitDraw = null;
    this.meshGeometry = null;
    this.chromeDraw = null;
    if (!mesh || this.disposed) return;
    this.meshY = [mesh.bounds.min[1], mesh.bounds.max[1]];
    if (mesh.fire) {
      this.fireGeometry = geometry(this.gpu, {
        buffers: [
          { attributes: { position: "float32x3" }, data: Float32Array.from(mesh.fire.positions) },
          { attributes: { normal: "float32x3" }, data: Float32Array.from(mesh.fire.normals) },
        ], indices: Uint32Array.from(mesh.fire.indices), topology: "triangle-list",
      });
      this.fireDraw = draw(this.gpu, {
        geometry: this.fireGeometry, shader: CHROME_SHADER_WGSL, cull: "none",
        depth: { compare: "less-equal", write: true },
        set: { backgroundSampler: this.backgroundSampler, backgroundTexture: this.backgroundTexture, exitTexture: this.exitTarget },
      });
      void this.fireDraw.compile(this.previewHdr);
      void this.fireDraw.compile(this.exportHdr);
    }
    this.meshGeometry = geometry(this.gpu, {
      buffers: [
        { attributes: { position: "float32x3" }, data: Float32Array.from(mesh.positions), label: "chromish-positions" },
        { attributes: { normal: "float32x3" }, data: Float32Array.from(mesh.normals), label: "chromish-normals" },
      ],
      indices: Uint32Array.from(mesh.indices),
      label: "chromish-object",
      topology: "triangle-list",
    });
    this.opticalDepth = mesh.bounds.max[2] - mesh.bounds.min[2];
    this.chromeDraw = draw(this.gpu, {
      cull: "none",
      depth: { compare: "less-equal", write: true },
      geometry: this.meshGeometry,
      label: "chromish-chrome",
      shader: CHROME_SHADER_WGSL,
      set: {
        backgroundSampler: this.backgroundSampler,
        backgroundTexture: this.backgroundTexture,
        exitTexture: this.exitTarget,
      },
    });
    this.smoothExitDraw = this.makeExitDraw(this.meshGeometry);
    void this.chromeDraw.compile(this.previewHdr);
    void this.chromeDraw.compile(this.exportHdr);
    if (mesh.gem) {
      const gem = mesh.gem;
      this.gemDepth = gem.bounds.max[2] - gem.bounds.min[2];
      this.gemGeometry = geometry(this.gpu, {
        buffers: [
          { attributes: { position: "float32x3" }, data: Float32Array.from(gem.positions) },
          { attributes: { normal: "float32x3" }, data: Float32Array.from(gem.normals) },
        ],
        indices: Uint32Array.from(gem.indices), topology: "triangle-list",
      });
      this.gemDraw = draw(this.gpu, {
        geometry: this.gemGeometry, shader: CHROME_SHADER_WGSL, cull: "none",
        depth: { compare: "less-equal", write: true },
        set: { backgroundSampler: this.backgroundSampler, backgroundTexture: this.backgroundTexture, exitTexture: this.exitTarget },
      });
      this.gemExitDraw = this.makeExitDraw(this.gemGeometry);
      void this.gemDraw.compile(this.previewHdr);
      void this.gemDraw.compile(this.exportHdr);
    }
  }

  private makeExitDraw(mesh: Geometry): Draw {
    const result = draw(this.gpu, { geometry: mesh, shader: OPTICAL_EXIT_SHADER_WGSL, cull: "front", depth: { compare: "less-equal", write: true } });
    void result.compile(this.exitTarget);
    return result;
  }

  private selectedExitDraw(parameters: ChromishRenderParameters): Draw | null {
    if (parameters.material === "diamond") return this.gemExitDraw ?? this.smoothExitDraw;
    return parameters.material === "glass" ? this.smoothExitDraw : null;
  }

  private selectedDraw(parameters: ChromishRenderParameters): Draw | null {
    if (parameters.material === "fire") return this.fireDraw ?? this.chromeDraw;
    return parameters.material === "diamond" ? this.gemDraw ?? this.chromeDraw : this.chromeDraw;
  }

  async setBackgroundImage(
    url: string | null,
    transform: Readonly<{ flipHorizontal?: boolean; flipVertical?: boolean; rotationDeg?: 0 | 90 | 180 | 270 }> = {},
  ): Promise<readonly [number, number]> {
    if (this.disposed) return [1, 1];
    const generation = ++this.backgroundLoadGeneration;
    if (!url) {
      const nextTexture = this.gpu.device.createTexture({
        format: "rgba8unorm",
        label: "chromish-background-placeholder",
        size: [1, 1],
        usage: ["copy_dst", "texture_binding"],
      });
      this.gpu.gpu.queue.writeTexture({ texture: nextTexture.gpu }, new Uint8Array([247, 247, 245, 255]), { bytesPerRow: 4 }, [1, 1]);
      const previous = this.backgroundTexture;
      this.backgroundTexture = nextTexture;
      this.chromeDraw?.set({ backgroundTexture: nextTexture });
      this.gemDraw?.set({ backgroundTexture: nextTexture });
      this.fireDraw?.set({ backgroundTexture: nextTexture });
      this.toneMap.set({ backgroundTexture: nextTexture });
      previous.destroy();
      return [1, 1];
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not read the background image.");
    const bitmap = await createImageBitmap(await response.blob());
    try {
      if (this.disposed || generation !== this.backgroundLoadGeneration) return [1, 1];
      const rotated = transform.rotationDeg === 90 || transform.rotationDeg === 270;
      const canvas = document.createElement("canvas");
      canvas.width = rotated ? bitmap.height : bitmap.width;
      canvas.height = rotated ? bitmap.width : bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("A 2D canvas is required to transform the background image.");
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(((transform.rotationDeg ?? 0) * Math.PI) / 180);
      context.scale(transform.flipHorizontal ? -1 : 1, transform.flipVertical ? -1 : 1);
      context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      const nextTexture = this.gpu.device.createTexture({
        format: "rgba8unorm",
        label: "chromish-background-image",
        size: [canvas.width, canvas.height],
        usage: CHROMISH_BACKGROUND_IMAGE_TEXTURE_USAGE,
      });
      this.gpu.gpu.queue.copyExternalImageToTexture(
        { source: canvas },
        { texture: nextTexture.gpu },
        [canvas.width, canvas.height],
      );
      const previous = this.backgroundTexture;
      this.backgroundTexture = nextTexture;
      this.chromeDraw?.set({ backgroundTexture: nextTexture });
      this.gemDraw?.set({ backgroundTexture: nextTexture });
      this.fireDraw?.set({ backgroundTexture: nextTexture });
      this.toneMap.set({ backgroundTexture: nextTexture });
      previous.destroy();
      return [canvas.width, canvas.height];
    } finally {
      bitmap.close();
    }
  }

  resize(width: number, height: number): void {
    const size = [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))] as const;
    this.canvasSurface.resize(size);
    this.previewHdr.resize(size);
  }

  private setUniforms(
    parameters: ChromishRenderParameters,
    fullSize: readonly [number, number],
    tile: readonly [number, number, number, number],
    hdr: Target,
  ): void {
    const { camera, model, viewProjection } = matricesFor(fullSize[0], fullSize[1], parameters);
    const tileLeft = (tile[0] - tile[2] + 1) * 0.5;
    const tileTop = (1 - (tile[1] + tile[3])) * 0.5;
    const backgroundTile = [tileLeft, tileTop, tile[2], tile[3]] as const;
    const modelValues = new Float32Array(model.elements);
    const exitDraw = this.selectedExitDraw(parameters);
    if (exitDraw) {
      this.exitTarget.resize(hdr.size);
      exitDraw.set({ exitScene: { model: modelValues, viewProjection: new Float32Array(viewProjection.elements), tile, cameraPosition: [...camera.position.toArray(), 1] } });
    }
    const viewProjectionValues = new Float32Array(viewProjection.elements);
    const materialSettings = parameters.materialSettings ?? defaultMaterialSettings(parameters.material);
    this.selectedDraw(parameters)?.set({
      scene: {
        materialSettings,
        backgroundColorAndMode: [
          ...hexToLinearRgba(parameters.background).slice(0, 3),
          parameters.includeBackgroundImage ? 1 : 0,
        ],
        backgroundInfo: [fullSize[0], fullSize[1], parameters.backgroundImageSize[0], parameters.backgroundImageSize[1]],
        backgroundTile,
        cameraPosition: [...camera.position.toArray(), 1],
        optics: [(parameters.material === "diamond" && this.gemDraw ? this.gemDepth : this.opticalDepth) * (parameters.objectScale ?? 1), ...this.meshY, 0],
        controls: [parameters.reflectionContrast, parameters.studioRotationRadians, chromishMaterialIndex(parameters.material), parameters.loopPhaseRadians],
        model: modelValues,
        tile,
        secondaryColor: hexToLinearRgba(parameters.secondaryColor),
        tintRoughness: [...hexToLinearRgba(parameters.primaryColor).slice(0, 3), parameters.roughness],
        viewProjection: viewProjectionValues,
      },
    });
    this.toneMap.set({
      sceneTexture: hdr,
      tone: {
        background: hexToLinearRgba(parameters.background),
        backgroundInfo: [fullSize[0], fullSize[1], parameters.backgroundImageSize[0], parameters.backgroundImageSize[1]],
        backgroundTile,
        fireInfo: [parameters.loopPhaseRadians, parameters.material === "fire" ? 1 : 0, materialSettings[3], 0],
        exposureAndMode: [parameters.exposure, parameters.includeBackground ? 1 : 0, parameters.includeBackgroundImage ? 1 : 0, parameters.saturation ?? 1],
      },
    });
  }

  render(parameters: ChromishRenderParameters): void {
    if (this.disposed) return;
    const size = this.canvasSurface.size;
    this.setUniforms(parameters, size, [0, 0, 1, 1], this.previewHdr);
    frame(this.gpu, (current) => {
      const exit = this.selectedExitDraw(parameters);
      if (exit) current.pass({ target: this.exitTarget, clear: [0, 0, 0, 0], clearDepth: 1 }, exit);
      current.pass({ clear: [0, 0, 0, 0], clearDepth: 1, target: this.previewHdr }, (pass) => {
        const selected = this.selectedDraw(parameters);
        if (selected) pass.draw(selected);
      });
      current.pass({ clear: [0, 0, 0, 0], target: this.canvasSurface }, this.toneMap);
    });
  }

  async renderToContext(
    context: CanvasRenderingContext2D,
    parameters: ChromishRenderParameters,
    width: number,
    height: number,
  ): Promise<void> {
    if (this.disposed || !this.chromeDraw) throw new Error("Upload a valid SVG before exporting.");
    const tileEdge = parameters.material === "fire" ? 1024 : 2048;
    // The flame pass samples below/alongside each pixel. Render those neighbors
    // too, then crop, so an export tile boundary cannot truncate a plume.
    const guardY = parameters.material === "fire" ? Math.ceil(height * 0.205) : 0;
    const guardX = parameters.material === "fire" ? Math.ceil(height * 0.14) : 0;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    for (let y = 0; y < height; y += tileEdge) {
      for (let x = 0; x < width; x += tileEdge) {
        const tileWidth = Math.min(tileEdge, width - x);
        const tileHeight = Math.min(tileEdge, height - y);
        const left = Math.max(0, x - guardX);
        const top = parameters.material === "fire" ? Math.max(0, y - Math.ceil(height * 0.07)) : y;
        const renderWidth = Math.min(width, x + tileWidth + guardX) - left;
        const renderHeight = Math.min(height, y + tileHeight + guardY) - top;
        this.exportHdr.resize([renderWidth, renderHeight]);
        this.exportLdr.resize([renderWidth, renderHeight]);
        this.setUniforms(
          parameters,
          [width, height],
          tileUniform(width, height, left, top, renderWidth, renderHeight),
          this.exportHdr,
        );
        const selected = this.selectedDraw(parameters)!;
        await selected.compile(this.exportHdr);
        const exit = this.selectedExitDraw(parameters);
        if (exit) await exit.compile(this.exitTarget);
        await this.toneMap.compile(this.exportLdr);
        let pixels: Uint8Array<ArrayBufferLike> = new Uint8Array();
        for (let attempt = 0; attempt < 3; attempt += 1) {
          this.setUniforms(parameters, [width, height], tileUniform(width, height, left, top, renderWidth, renderHeight), this.exportHdr);
          const exportFrame = frame(this.gpu, (current) => {
            if (exit) current.pass({ target: this.exitTarget, clear: [0, 0, 0, 0], clearDepth: 1 }, exit);
            current.pass({ clear: [0, 0, 0, 0], clearDepth: 1, target: this.exportHdr }, (pass) => {
              pass.draw(selected);
            });
            current.pass({ clear: [0, 0, 0, 0], target: this.exportLdr }, this.toneMap);
          });
          await exportFrame.done;
          await this.gpu.settled();
          pixels = await this.exportLdr.read();
          if (!parameters.includeBackground || pixels[3] === 255) break;
        }
        if (parameters.includeBackground && pixels[3] !== 255) {
          throw new Error("The WebGPU export readback did not contain the requested opaque background.");
        }
        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = renderWidth;
        tileCanvas.height = renderHeight;
        const tileContext = tileCanvas.getContext("2d");
        if (!tileContext) throw new Error("A 2D canvas is required for tiled export compositing.");
        tileContext.putImageData(
          new ImageData(Uint8ClampedArray.from(pixels), renderWidth, renderHeight),
          0,
          0,
        );
        context.drawImage(tileCanvas, x - left, y - top, tileWidth, tileHeight, x, y, tileWidth, tileHeight);
      }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  dispose(): void {
    this.fireGeometry?.destroy();
    if (this.disposed) return;
    this.disposed = true;
    this.backgroundLoadGeneration += 1;
    this.meshGeometry?.destroy();
    this.gemGeometry?.destroy();
    this.backgroundTexture.destroy();
    this.canvasSurface.dispose();
    this.gpu.dispose();
  }
}

export function createChromishRaycastCamera(
  width: number,
  height: number,
  parameters: ChromishRenderParameters,
): PerspectiveCamera {
  return matricesFor(width, height, parameters).camera;
}

export function createChromishModelMatrix(rotationRadians: number): Matrix4 {
  return new Matrix4().makeRotationY(rotationRadians);
}

export function safeCameraVector(
  value: unknown,
  fallback: readonly [number, number, number],
): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    return [...fallback];
  }
  const vector = new Vector3(value[0], value[1], value[2]);
  return vector.lengthSq() > 0.0001 ? [vector.x, vector.y, vector.z] : [...fallback];
}
