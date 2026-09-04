import { expect, it } from "vitest";
import { extrudeChromishPolygons } from "./svg-mesh";
import { OPTICAL_SHADER_WGSL } from "./optical-shader";

it("generates real table, crown, girdle and pavilion while preserving a hole", () => {
  const mesh = extrudeChromishPolygons([[
    [[0,0],[10,0],[10,8],[0,8],[0,0]],
    [[4,3],[4,5],[6,5],[6,3],[4,3]],
  ]], { depth: 0.4, bevel: 0.06, detail: "fine" }, { elementCount: 1, route: "vector", sourceSvg: "fixture" });
  const gem = mesh.gem!;
  expect(gem).toBeDefined();
  expect(gem.bounds.min[0]).toBeCloseTo(-1);
  expect(gem.bounds.max[0]).toBeCloseTo(1);
  const heights = new Set(Array.from(gem.positions).filter((_, index) => index % 3 === 2).map(z => z.toFixed(4)));
  expect(heights.size).toBe(4);
  expect(gem.bounds.max[2]).toBeGreaterThan(0.2);
  expect(gem.bounds.min[2]).toBeLessThan(-0.3);
  let sloped = 0;
  for (let i = 0; i < gem.positions.length; i += 9) {
    const nx = gem.normals[i]!; const ny = gem.normals[i + 1]!; const nz = gem.normals[i + 2]!;
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 4);
    expect(Array.from(gem.normals.slice(i, i + 3))).toEqual(Array.from(gem.normals.slice(i + 3, i + 6)));
    const cx = (gem.positions[i]! + gem.positions[i + 3]! + gem.positions[i + 6]!) / 3;
    const cy = (gem.positions[i + 1]! + gem.positions[i + 4]! + gem.positions[i + 7]!) / 3;
    expect(Math.abs(cx) < 0.199 && Math.abs(cy) < 0.199).toBe(false);
    if (Math.abs(nz) > 0.1 && Math.abs(nz) < 0.99) sloped++;
  }
  expect(sloped).toBeGreaterThan(12);
  expect(gem.triangleCount).toBeLessThan(100_000);
});

it("keeps optical per-pixel work independent of source triangle count", () => {
  expect(OPTICAL_SHADER_WGSL).not.toMatch(/var<storage|for\s*\(|while\s*\(|intersectOpticalMesh/);
  expect(OPTICAL_SHADER_WGSL).toContain("transmittedDirection");
});
