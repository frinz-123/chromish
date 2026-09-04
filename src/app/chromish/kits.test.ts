import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WebIO } from "@gltf-transform/core";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "vite";

import type { ChromishRuntimeSnapshot } from "./runtime-store";
import type { ChromishCpuMesh } from "./svg-mesh";
import { createGlbKit, createVgpuKit, serializeChrmesh } from "./kits";

const mesh: ChromishCpuMesh = {
  bounds: { max: [1, 1, 0], min: [-1, -1, 0] },
  elementCount: 1,
  indices: new Uint32Array([0, 1, 2]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
  route: "vector",
  sourceSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H10V10Z"/></svg>',
  triangleCount: 1,
};

const snapshot: ChromishRuntimeSnapshot = {
  directionSign: -1,
  durationSeconds: 9,
  fileName: "Chrome Mark.svg",
  mesh,
  parameters: {
    background: "#F7F7F5",
    backgroundImageSize: [1632, 918],
    cameraPosition: [0.15, 0.1, 4.5],
    cameraUp: [0, 1, 0],
    exposure: 1.1,
    includeBackground: true,
    includeBackgroundImage: true,
    material: "plastic",
    primaryColor: "#E6ECEF",
    reflectionContrast: 1.4,
    rotationRadians: 0.2,
    secondaryColor: "#FFD429",
    roughness: 0.16,
    studioRotationRadians: 0.31,
  },
  renderer: {} as ChromishRuntimeSnapshot["renderer"],
  sourceSvg: mesh.sourceSvg,
  startAngleDegrees: -42,
};

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Chromish delivery kits", () => {
  it("serializes exact CHRMSH01 little-endian arrays", () => {
    const bytes = serializeChrmesh(mesh);
    expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe("CHRMSH01");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(8, true)).toBe(3);
    expect(view.getUint32(12, true)).toBe(3);
    expect(new Float32Array(bytes.buffer.slice(16, 16 + mesh.positions.byteLength))).toEqual(mesh.positions);
  });

  it("parses the GLB ZIP and preserves live timeline direction and duration", async () => {
    const priorFileReader = globalThis.FileReader;
    class TestFileReader {
      result: string | ArrayBuffer | null = null;
      onloadend: (() => void) | null = null;
      readAsArrayBuffer(blob: Blob): void {
        void blob.arrayBuffer().then((result) => {
          this.result = result;
          this.onloadend?.();
        });
      }
    }
    globalThis.FileReader = TestFileReader as unknown as typeof FileReader;
    try {
      const zip = unzipSync(await createGlbKit(snapshot));
      expect(Object.keys(zip).sort()).toEqual([
        "README.md",
        "chrome-mark.svg",
        "chromish-object.glb",
        "embed.html",
      ]);
      const glb = zip["chromish-object.glb"]!;
      expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe("glTF");
      const document = await new WebIO().readBinary(glb);
      expect(document.getRoot().listMeshes()).toHaveLength(1);
      const embed = new TextDecoder().decode(zip["embed.html"]!);
      expect(embed).toContain("@google/model-viewer@4.3.1");
      expect(embed).toContain('rotation-per-second="-40.000000deg"');
    } finally {
      globalThis.FileReader = priorFileReader;
    }
  });

  it("extracts and builds the pinned standalone vgpu project", async () => {
    const zip = unzipSync(createVgpuKit(snapshot));
    expect(Object.keys(zip)).toEqual(expect.arrayContaining([
      "README.md",
      "index.html",
      "object.chrmesh",
      "package.json",
      "settings.json",
      "src/main.ts",
      "src/style.css",
      "chrome-mark.svg",
    ]));
    const packageJson = JSON.parse(new TextDecoder().decode(zip["package.json"]!));
    const settings = JSON.parse(new TextDecoder().decode(zip["settings.json"]!));
    expect(packageJson.dependencies.vgpu).toBe("0.4.0");
    expect(settings).toMatchObject({ directionSign: -1, duration: 9, startAngle: -42 });
    expect(new TextDecoder().decode(zip["src/main.ts"]!)).toContain('import "./style.css"');

    const root = await mkdtemp(join(process.cwd(), ".toolcraft/browser-artifacts/chromish-kit-"));
    temporaryRoots.push(root);
    for (const [path, bytes] of Object.entries(zip)) {
      const destination = join(root, path);
      await mkdir(join(destination, ".."), { recursive: true });
      await writeFile(destination, bytes);
    }
    await build({ build: { emptyOutDir: true }, logLevel: "silent", root });
  });
});
