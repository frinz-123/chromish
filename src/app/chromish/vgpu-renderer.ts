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
import type { Texture } from "vgpu/core";

import type { ChromishCpuMesh } from "./svg-mesh";

export const CHROME_SHADER_WGSL = /* wgsl */ `
struct SceneUniforms {
  viewProjection: mat4x4f,
  model: mat4x4f,
  tintRoughness: vec4f,
  secondaryColor: vec4f,
  controls: vec4f,
  backgroundInfo: vec4f,
  backgroundTile: vec4f,
  cameraPosition: vec4f,
  tile: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var backgroundTexture: texture_2d<f32>;
@group(0) @binding(2) var backgroundSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) worldNormal: vec3f,
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
) -> VertexOutput {
  let world = scene.model * vec4f(position, 1.0);
  let clip = scene.viewProjection * world;
  let fullNdc = clip.xy / clip.w;
  let localNdc = (fullNdc - scene.tile.xy) / scene.tile.zw;
  var output: VertexOutput;
  output.position = vec4f(localNdc * clip.w, clip.z, clip.w);
  output.worldPosition = world.xyz;
  output.worldNormal = normalize((scene.model * vec4f(normal, 0.0)).xyz);
  return output;
}

fn rotateY(value: vec3f, angle: f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return vec3f(c * value.x + s * value.z, value.y, -s * value.x + c * value.z);
}

fn studio(r: vec3f, contrast: f32, angle: f32) -> vec3f {
  let q = rotateY(normalize(r), angle);
  let azimuth = atan2(q.z, q.x);
  let broad = 0.5 + 0.5 * sin(azimuth * 2.0 + q.y * 5.5);
  let narrow = pow(0.5 + 0.5 * sin(azimuth * 5.0 - q.y * 8.0 + 0.7), 10.0);
  let horizon = smoothstep(-0.28, 0.16, q.y) * (1.0 - smoothstep(0.48, 0.88, q.y));
  let darkBand = smoothstep(0.12, 0.44, abs(sin(azimuth * 1.5 + 0.35)));
  var value = mix(0.018, 1.7, broad);
  value = mix(value, 3.6, narrow);
  value += horizon * 0.75;
  value *= mix(0.16, 1.0, darkBand);
  value = mix(0.45, value, contrast);
  return vec3f(value) * vec3f(0.94, 0.99, 1.03);
}

fn fireNoise(position: vec3f, time: f32) -> f32 {
  let p = position * vec3f(5.0, 3.5, 4.0);
  let loopOffset = vec3f(sin(time), cos(time), sin(time * 2.0));
  let first = sin(p.x + loopOffset.x * 1.7) * sin(p.y * 1.7 + loopOffset.y * 1.3);
  let second = sin(p.z * 2.3 - p.y * 1.2 + loopOffset.z * 1.1);
  return 0.5 + 0.25 * first + 0.25 * second;
}

fn backgroundUv(fragmentPosition: vec2f) -> vec2f {
  let tilePixels = scene.backgroundInfo.xy * scene.backgroundTile.zw;
  let localUv = fragmentPosition / max(tilePixels, vec2f(1.0));
  let fullUv = scene.backgroundTile.xy + localUv * scene.backgroundTile.zw;
  let outputAspect = scene.backgroundInfo.x / max(scene.backgroundInfo.y, 1.0);
  let imageAspect = scene.backgroundInfo.z / max(scene.backgroundInfo.w, 1.0);
  var covered = fullUv;
  if (imageAspect > outputAspect) {
    let visible = outputAspect / imageAspect;
    covered.x = 0.5 + (fullUv.x - 0.5) * visible;
  } else {
    let visible = imageAspect / outputAspect;
    covered.y = 0.5 + (fullUv.y - 0.5) * visible;
  }
  return covered;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let n = normalize(input.worldNormal);
  let v = normalize(scene.cameraPosition.xyz - input.worldPosition);
  let reflected = reflect(-v, n);
  let roughness = scene.tintRoughness.w;
  let contrast = scene.controls.x;
  let studioAngle = scene.controls.y;
  let tint = scene.tintRoughness.xyz;
  let accent = scene.secondaryColor.xyz;
  let material = scene.controls.z;
  let time = scene.controls.w;
  let environment = studio(reflected, contrast, studioAngle);
  let fresnel = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  if (material < 0.5) {
    let refracted = refract(-v, n, 1.0 / 2.42);
    let dispersion = vec3f(
      studio(rotateY(refracted, -0.035), contrast, studioAngle).r,
      studio(refracted, contrast, studioAngle).g,
      studio(rotateY(refracted, 0.035), contrast, studioAngle).b
    );
    let brilliance = pow(max(dot(reflect(-v, n), normalize(vec3f(-0.4, 0.8, 0.5))), 0.0), 42.0);
    let refractedBackdrop = textureSample(backgroundTexture, backgroundSampler, backgroundUv(input.position.xy) + refracted.xy * 0.045).rgb;
    return vec4f(mix(refractedBackdrop, dispersion, 0.28) + environment * fresnel * 1.2 + brilliance * vec3f(4.0), 0.3 + fresnel * 0.68);
  }
  if (material < 1.5) {
    let light = normalize(vec3f(-0.45, 0.75, 0.6));
    let diffuse = 0.24 + max(dot(n, light), 0.0) * 0.76;
    let highlight = pow(max(dot(reflect(-light, n), v), 0.0), mix(96.0, 18.0, roughness));
    return vec4f(tint * diffuse + accent * highlight * 1.8 + fresnel * accent * 0.35, 1.0);
  }
  if (material < 2.5) {
    let refracted = refract(-v, n, 1.0 / 1.52);
    let glassBody = studio(refracted, contrast * 0.75, studioAngle) * vec3f(0.7, 0.9, 1.0);
    let refractedBackdrop = textureSample(backgroundTexture, backgroundSampler, backgroundUv(input.position.xy) + refracted.xy * 0.025).rgb;
    return vec4f(mix(refractedBackdrop, glassBody, 0.16) + environment * fresnel + vec3f(0.02, 0.05, 0.07), 0.16 + fresnel * 0.72);
  }
  if (material < 3.5) {
    let turbulence = fireNoise(input.worldPosition, time);
    let heightGlow = clamp(input.worldPosition.y * 0.35 + 0.58, 0.0, 1.0);
    let flame = smoothstep(0.18, 0.88, turbulence + heightGlow * 0.35);
    return vec4f(mix(tint, accent, flame) * (1.5 + flame * 2.2) + fresnel * accent, 0.9);
  }
  let light = normalize(vec3f(-0.35, 0.8, 0.45));
  let wrap = clamp((dot(n, light) + 0.45) / 1.45, 0.0, 1.0);
  let softSpecular = pow(max(dot(reflect(-light, n), v), 0.0), 12.0) * (1.0 - roughness);
  return vec4f(tint * (0.42 + wrap * 0.72) + softSpecular * vec3f(0.35) + fresnel * tint * 0.2, 1.0);
}
`;

export const TONE_MAP_SHADER_WGSL = /* wgsl */ `
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;
@group(0) @binding(2) var backgroundTexture: texture_2d<f32>;
@group(0) @binding(3) var backgroundSampler: sampler;

struct ToneUniforms {
  background: vec4f,
  exposureAndMode: vec4f,
  backgroundInfo: vec4f,
  backgroundTile: vec4f,
}

@group(0) @binding(4) var<uniform> tone: ToneUniforms;

fn aces(value: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((value * (a * value + b)) / (value * (c * value + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sampleValue = textureSampleLevel(sceneTexture, sceneSampler, uv, 0.0);
  let mapped = aces(sampleValue.rgb * tone.exposureAndMode.x);
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
  background: string;
  backgroundImageSize: readonly [number, number];
  cameraPosition: readonly [number, number, number];
  cameraUp: readonly [number, number, number];
  exposure: number;
  includeBackground: boolean;
  includeBackgroundImage: boolean;
  loopPhaseRadians: number;
  material: "diamond" | "plastic" | "glass" | "fire" | "playdough";
  primaryColor: string;
  reflectionContrast: number;
  roughness: number;
  rotationRadians: number;
  secondaryColor: string;
  studioRotationRadians: number;
}>;

export function chromishMaterialIndex(material: ChromishRenderParameters["material"]): number {
  return { diamond: 0, plastic: 1, glass: 2, fire: 3, playdough: 4 }[material];
}

export function chromishFireLoopOffset(phaseRadians: number): readonly [number, number, number] {
  return [Math.sin(phaseRadians), Math.cos(phaseRadians), Math.sin(phaseRadians * 2)];
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
  const camera = new PerspectiveCamera(33, width / Math.max(1, height), 0.1, 100);
  camera.position.fromArray(parameters.cameraPosition);
  camera.up.fromArray(parameters.cameraUp);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const model = new Matrix4().makeRotationY(parameters.rotationRadians);
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
          backgroundInfo: [1, 1, 1, 1],
          backgroundTile: [0, 0, 1, 1],
        },
      },
    });
    gpu.onError((error) => console.error("Chromish vgpu error", error));
    await toneMap.compile(exportLdr);
    return new ChromishVgpuRenderer(gpu, canvasSurface, previewHdr, exportHdr, exportLdr, toneMap, backgroundSampler, backgroundTexture);
  }

  get size(): readonly [number, number] {
    return this.canvasSurface.size;
  }

  setMesh(mesh: ChromishCpuMesh | null): void {
    this.meshGeometry?.destroy();
    this.meshGeometry = null;
    this.chromeDraw = null;
    if (!mesh || this.disposed) return;
    this.meshGeometry = geometry(this.gpu, {
      buffers: [
        { attributes: { position: "float32x3" }, data: Float32Array.from(mesh.positions), label: "chromish-positions" },
        { attributes: { normal: "float32x3" }, data: Float32Array.from(mesh.normals), label: "chromish-normals" },
      ],
      indices: Uint32Array.from(mesh.indices),
      label: "chromish-object",
      topology: "triangle-list",
    });
    this.chromeDraw = draw(this.gpu, {
      cull: "none",
      depth: { compare: "less-equal", write: true },
      geometry: this.meshGeometry,
      label: "chromish-chrome",
      shader: CHROME_SHADER_WGSL,
      set: {
        backgroundSampler: this.backgroundSampler,
        backgroundTexture: this.backgroundTexture,
      },
    });
    void this.chromeDraw.compile(this.previewHdr);
    void this.chromeDraw.compile(this.exportHdr);
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
        usage: ["copy_dst", "texture_binding"],
      });
      this.gpu.gpu.queue.copyExternalImageToTexture(
        { source: canvas },
        { texture: nextTexture.gpu },
        [canvas.width, canvas.height],
      );
      const previous = this.backgroundTexture;
      this.backgroundTexture = nextTexture;
      this.chromeDraw?.set({ backgroundTexture: nextTexture });
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
    this.chromeDraw?.set({
      scene: {
        backgroundInfo: [fullSize[0], fullSize[1], parameters.backgroundImageSize[0], parameters.backgroundImageSize[1]],
        backgroundTile,
        cameraPosition: [...camera.position.toArray(), 1],
        controls: [parameters.reflectionContrast, parameters.studioRotationRadians, chromishMaterialIndex(parameters.material), parameters.loopPhaseRadians],
        model: new Float32Array(model.elements),
        tile,
        secondaryColor: hexToLinearRgba(parameters.secondaryColor),
        tintRoughness: [...hexToLinearRgba(parameters.primaryColor).slice(0, 3), parameters.roughness],
        viewProjection: new Float32Array(viewProjection.elements),
      },
    });
    this.toneMap.set({
      sceneTexture: hdr,
      tone: {
        background: hexToLinearRgba(parameters.background),
        backgroundInfo: [fullSize[0], fullSize[1], parameters.backgroundImageSize[0], parameters.backgroundImageSize[1]],
        backgroundTile,
        exposureAndMode: [parameters.exposure, parameters.includeBackground ? 1 : 0, parameters.includeBackgroundImage ? 1 : 0, 0],
      },
    });
  }

  render(parameters: ChromishRenderParameters): void {
    if (this.disposed) return;
    const size = this.canvasSurface.size;
    this.setUniforms(parameters, size, [0, 0, 1, 1], this.previewHdr);
    frame(this.gpu, (current) => {
      current.pass({ clear: [0, 0, 0, 0], clearDepth: 1, target: this.previewHdr }, (pass) => {
        if (this.chromeDraw) pass.draw(this.chromeDraw);
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
    const tileEdge = 2048;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    for (let y = 0; y < height; y += tileEdge) {
      for (let x = 0; x < width; x += tileEdge) {
        const tileWidth = Math.min(tileEdge, width - x);
        const tileHeight = Math.min(tileEdge, height - y);
        this.exportHdr.resize([tileWidth, tileHeight]);
        this.exportLdr.resize([tileWidth, tileHeight]);
        this.setUniforms(
          parameters,
          [width, height],
          tileUniform(width, height, x, y, tileWidth, tileHeight),
          this.exportHdr,
        );
        await this.chromeDraw.compile(this.exportHdr);
        await this.toneMap.compile(this.exportLdr);
        let pixels: Uint8Array<ArrayBufferLike> = new Uint8Array();
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const exportFrame = frame(this.gpu, (current) => {
            current.pass({ clear: [0, 0, 0, 0], clearDepth: 1, target: this.exportHdr }, this.chromeDraw!);
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
        tileCanvas.width = tileWidth;
        tileCanvas.height = tileHeight;
        const tileContext = tileCanvas.getContext("2d");
        if (!tileContext) throw new Error("A 2D canvas is required for tiled export compositing.");
        tileContext.putImageData(
          new ImageData(Uint8ClampedArray.from(pixels), tileWidth, tileHeight),
          0,
          0,
        );
        context.drawImage(tileCanvas, x, y);
      }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.backgroundLoadGeneration += 1;
    this.meshGeometry?.destroy();
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
