import { zipSync, strToU8 } from "fflate";
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import type { ToolcraftPanelActionHandler } from "@/toolcraft/runtime/react";

import { getChromishRuntimeSnapshot, type ChromishRuntimeSnapshot } from "./runtime-store";
import type { ChromishCpuMesh } from "./svg-mesh";
import { CHROME_SHADER_WGSL, TONE_MAP_SHADER_WGSL } from "./vgpu-renderer";

const CHRMSH_MAGIC = "CHRMSH01";
const MAX_BASE64_DOWNLOAD_BYTES = 32 * 1024 * 1024;

export function serializeChrmesh(mesh: ChromishCpuMesh): Uint8Array {
  const headerBytes = 16;
  const byteLength = headerBytes + mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength;
  const buffer = new ArrayBuffer(byteLength);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode(CHRMSH_MAGIC), 0);
  const view = new DataView(buffer);
  view.setUint32(8, mesh.positions.length / 3, true);
  view.setUint32(12, mesh.indices.length, true);
  let offset = headerBytes;
  bytes.set(new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength), offset);
  offset += mesh.positions.byteLength;
  bytes.set(new Uint8Array(mesh.normals.buffer, mesh.normals.byteOffset, mesh.normals.byteLength), offset);
  offset += mesh.normals.byteLength;
  bytes.set(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength), offset);
  return bytes;
}

function safeSourceName(fileName: string): string {
  const base = fileName
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
  return base.toLowerCase().endsWith(".svg") ? base : `${base || "source"}.svg`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

type ChromishSaveFilePicker = (options: Readonly<{
  suggestedName: string;
  types: readonly Readonly<{
    accept: Readonly<Record<string, readonly string[]>>;
    description: string;
  }>[];
}>) => Promise<Readonly<{
  createWritable(): Promise<Readonly<{
    close(): Promise<void>;
    write(data: Blob): Promise<void>;
  }>>;
}>>;

async function downloadZip(bytes: Uint8Array, fileName: string): Promise<void> {
  if (bytes.byteLength > MAX_BASE64_DOWNLOAD_BYTES) {
    throw new Error("The generated kit exceeds the safe 32 MB browser-download limit.");
  }
  const picker = (window as typeof window & { showSaveFilePicker?: ChromishSaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{
          accept: { "application/zip": [".zip"] },
          description: "ZIP archive",
        }],
      });
      const writable = await handle.createWritable();
      const payload = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      await writable.write(new Blob([payload], { type: "application/zip" }));
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
    }
  }
  const anchor = document.createElement("a");
  anchor.download = fileName;
  anchor.href = `data:application/zip;base64,${bytesToBase64(bytes)}`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function buildThreeGeometry(mesh: ChromishCpuMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(mesh.positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(Float32Array.from(mesh.normals), 3));
  geometry.setIndex(new BufferAttribute(Uint32Array.from(mesh.indices), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

async function createGlb(mesh: ChromishCpuMesh, tint: string, roughness: number): Promise<Uint8Array> {
  const geometry = buildThreeGeometry(mesh);
  const material = new MeshStandardMaterial({ color: tint, metalness: 1, roughness });
  const object = new Mesh(geometry, material);
  object.name = "Chromish Object";
  try {
    const result = await new GLTFExporter().parseAsync(object, {
      binary: true,
      onlyVisible: true,
      trs: false,
    });
    if (!(result instanceof ArrayBuffer)) throw new Error("GLB exporter returned JSON instead of binary data.");
    return new Uint8Array(result);
  } finally {
    geometry.dispose();
    material.dispose();
  }
}

function glbEmbedHtml(duration: number, counterclockwise: boolean): string {
  const degreesPerSecond = 360 / Math.max(0.01, duration) * (counterclockwise ? -1 : 1);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Chromish GLB embed</title>
  <script type="module" src="https://unpkg.com/@google/model-viewer@4.3.1/dist/model-viewer.min.js"></script>
  <style>html,body,model-viewer{width:100%;height:100%;margin:0}body{background:#f7f7f5}</style>
</head>
<body>
  <model-viewer src="./chromish-object.glb" camera-controls auto-rotate auto-rotate-delay="0" rotation-per-second="${degreesPerSecond.toFixed(6)}deg" environment-image="neutral" shadow-intensity="0"></model-viewer>
</body>
</html>`;
}

export async function createGlbKit(
  snapshotOverride?: ChromishRuntimeSnapshot,
): Promise<Uint8Array> {
  const snapshot = snapshotOverride ?? getChromishRuntimeSnapshot();
  if (!snapshot) throw new Error("Upload a valid SVG before downloading a GLB kit.");
  const glb = await createGlb(snapshot.mesh, snapshot.parameters.tint, snapshot.parameters.roughness);
  const duration = snapshot.durationSeconds;
  const counterclockwise = snapshot.directionSign < 0;
  return zipSync({
    "README.md": strToU8(`# Chromish GLB Kit\n\nOpen \`embed.html\` through a local web server. The standard metallic PBR material is portable and intentionally approximates the procedural vgpu chrome. The embedded model-viewer version is pinned to 4.3.1.\n`),
    "chromish-object.glb": glb,
    "embed.html": strToU8(glbEmbedHtml(duration, counterclockwise)),
    [safeSourceName(snapshot.fileName)]: strToU8(snapshot.sourceSvg),
  }, { level: 6 });
}

function vgpuMainSource(): string {
  return `import "./style.css";
import { draw, effect, frame, geometry, init, sampler, surface, target } from "vgpu";

const chromeShader = ${JSON.stringify(CHROME_SHADER_WGSL)};
const toneShader = ${JSON.stringify(TONE_MAP_SHADER_WGSL)};

async function loadMesh() {
  const bytes = new Uint8Array(await (await fetch("/object.chrmesh")).arrayBuffer());
  const magic = new TextDecoder().decode(bytes.subarray(0, 8));
  if (magic !== "CHRMSH01") throw new Error("Invalid CHRMSH01 mesh");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vertexCount = view.getUint32(8, true);
  const indexCount = view.getUint32(12, true);
  let offset = 16;
  const positions = new Float32Array(bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + vertexCount * 12));
  offset += vertexCount * 12;
  const normals = new Float32Array(bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + vertexCount * 12));
  offset += vertexCount * 12;
  const indices = new Uint32Array(bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + indexCount * 4));
  return { positions, normals, indices };
}

const settings = await (await fetch("/settings.json")).json();
const canvas = document.querySelector("canvas");
const gpu = await init({ label: "Chromish Embed" });
const out = surface(gpu, canvas, { alphaMode: "premultiplied", dpr: [1, 2] });
const hdr = target(gpu, { size: out.size, format: "rgba16float", depth: true, msaa: 4 });
out.onResize(({ width, height }) => hdr.resize([width, height]));
const mesh = await loadMesh();
const geo = geometry(gpu, { buffers: [
  { data: mesh.positions, attributes: { position: "float32x3" } },
  { data: mesh.normals, attributes: { normal: "float32x3" } },
], indices: mesh.indices });
const chrome = draw(gpu, { shader: chromeShader, geometry: geo, cull: "none", depth: { write: true, compare: "less-equal" } });
const present = effect(gpu, toneShader, { set: { sceneTexture: hdr, sceneSampler: sampler(gpu, { minFilter: "linear", magFilter: "linear" }) } });
let yaw = settings.startAngle * Math.PI / 180;
let pitch = 0;
let dragging = false;
let previous = [0, 0];
canvas.addEventListener("pointerdown", (event) => { dragging = true; previous = [event.clientX, event.clientY]; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener("pointermove", (event) => { if (!dragging) return; yaw += (event.clientX - previous[0]) * 0.01; pitch += (event.clientY - previous[1]) * 0.01; previous = [event.clientX, event.clientY]; });
canvas.addEventListener("pointerup", () => { dragging = false; });
function multiply4(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) value += a[index * 4 + row] * b[column * 4 + index];
      out[column * 4 + row] = value;
    }
  }
  return out;
}
function cameraMatrix() {
  const aspect = Math.max(1, canvas.width) / Math.max(1, canvas.height);
  const near = 0.1, far = 100, f = 1 / Math.tan(33 * Math.PI / 360);
  const projection = new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,(2*far*near)/(near-far),0]);
  const view = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,-4.5,1]);
  return multiply4(projection, view);
}
function render(time) {
  if (!dragging) yaw = settings.startAngle * Math.PI / 180 + settings.directionSign * (time / (settings.duration * 1000)) * Math.PI * 2;
  const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const model = new Float32Array([c,sp*s,-cp*s,0,0,cp,sp,0,s,-sp*c,cp*c,0,0,0,0,1]);
  chrome.set({ scene: { viewProjection: cameraMatrix(), model, tintRoughness: [...settings.tintLinear, settings.roughness], controls: [settings.reflectionContrast, settings.studioRotation, 0, 0], cameraPosition: [0,0,4.5,1], tile: [0,0,1,1] } });
  present.set({ tone: { background: [...settings.backgroundLinear, 1], exposureAndMode: [settings.exposure, 1, 0, 0] } });
  frame(gpu, current => { current.pass({ target: hdr, clear: [0,0,0,0], clearDepth: 1 }, chrome); current.pass(out, present); });
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
`;
}

function linearHex(value: string): [number, number, number] {
  const packed = Number.parseInt(value.replace("#", ""), 16);
  return [16, 8, 0].map((shift) => ((packed >> shift) & 255) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) as [number, number, number];
}

export function createVgpuKit(snapshotOverride?: ChromishRuntimeSnapshot): Uint8Array {
  const snapshot = snapshotOverride ?? getChromishRuntimeSnapshot();
  if (!snapshot) throw new Error("Upload a valid SVG before downloading a vgpu kit.");
  const settings = {
    background: snapshot.parameters.background,
    backgroundLinear: linearHex(snapshot.parameters.background),
    directionSign: snapshot.directionSign,
    duration: snapshot.durationSeconds,
    exposure: snapshot.parameters.exposure,
    reflectionContrast: snapshot.parameters.reflectionContrast,
    roughness: snapshot.parameters.roughness,
    startAngle: snapshot.startAngleDegrees,
    studioRotation: snapshot.parameters.studioRotationRadians,
    tint: snapshot.parameters.tint,
    tintLinear: linearHex(snapshot.parameters.tint),
  };
  return zipSync({
    "README.md": strToU8("# Chromish vgpu Kit\n\nRun `npm install` and `npm run dev`. Build with `npm run build` and host the `dist` directory on any static host. Embed with an iframe pointing at the hosted URL. The renderer and inline WGSL reproduce Chromish's procedural chrome; `object.chrmesh` uses the little-endian CHRMSH01 layout.\n"),
    "index.html": strToU8("<div id=app><canvas aria-label='Chromish chrome object'></canvas></div><script type=module src=/src/main.ts></script>"),
    "object.chrmesh": serializeChrmesh(snapshot.mesh),
    "package.json": strToU8(JSON.stringify({ private: true, scripts: { build: "vite build", dev: "vite" }, dependencies: { vgpu: "0.4.0" }, devDependencies: { typescript: "6.0.3", vite: "8.0.0" } }, null, 2)),
    "settings.json": strToU8(JSON.stringify(settings, null, 2)),
    "src/main.ts": strToU8(vgpuMainSource()),
    "src/style.css": strToU8("html,body,#app,canvas{width:100%;height:100%;margin:0;overflow:hidden}canvas{display:block;touch-action:none}"),
    [safeSourceName(snapshot.fileName)]: strToU8(snapshot.sourceSvg),
  }, { level: 6 });
}

export const handleChromishPanelAction: ToolcraftPanelActionHandler = async ({
  action,
  reportFeedback,
  reportProgress,
}) => {
  if (action.value !== "download.glb-kit" && action.value !== "download.vgpu-kit") return;
  try {
    reportProgress(0.08);
    const bytes = action.value === "download.glb-kit" ? await createGlbKit() : createVgpuKit();
    reportProgress(0.84);
    await downloadZip(bytes, action.value === "download.glb-kit" ? "chromish-glb-kit.zip" : "chromish-vgpu-kit.zip");
    reportProgress(1);
  } catch (error) {
    reportFeedback({
      code: "chromish-kit-export-failed",
      message: error instanceof Error ? error.message : "The Chromish kit could not be generated.",
    });
  }
};
