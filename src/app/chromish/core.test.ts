import { describe, expect, it } from "vitest";

import type { Polygon } from "polygon-clipping";

import {
  assertChromishTriangleLimit,
  extrudeChromishPolygons,
  nestedContoursToPolygons,
  parseSvgPathContours,
  parseSvgTransform,
  traceChromishAlphaEdges,
  unionChromishPolygons,
} from "./svg-mesh";
import {
  CHROMISH_MAX_SVG_BYTES,
  ChromishSvgError,
  detectRasterFallbackSyntax,
  preflightSvgText,
} from "./svg-sanitizer";

const rectangle = (left: number, top: number, right: number, bottom: number): Polygon => [[
  [left, top],
  [right, top],
  [right, bottom],
  [left, bottom],
  [left, top],
]];

describe("Chromish SVG processing", () => {
  it("preflights empty, unsafe, and oversized input", () => {
    expect(() => preflightSvgText(" ")).toThrowError(ChromishSvgError);
    expect(() => preflightSvgText('<svg onload="run()"/>')).toThrow(/event-handler/iu);
    expect(() => preflightSvgText("<svg><foreignObject/></svg>")).toThrow(/externally hosted/iu);
    expect(() => preflightSvgText("x".repeat(CHROMISH_MAX_SVG_BYTES + 1))).toThrow(/5 MB/iu);
  });

  it("classifies alpha-raster fallback features without penalizing closed fills", () => {
    expect(detectRasterFallbackSyntax('<svg><path fill="#000" d="M0 0H10V10Z"/></svg>')).toBe(false);
    expect(detectRasterFallbackSyntax('<svg><text x="0">Chrome</text></svg>')).toBe(true);
    expect(detectRasterFallbackSyntax('<svg><path stroke="#000" d="M0 0L10 10"/></svg>')).toBe(true);
    expect(detectRasterFallbackSyntax('<svg><path stroke="none" d="M0 0L10 10"/></svg>')).toBe(false);
  });

  it("parses transformed paths, compound contours, curves, and malformed commands", () => {
    expect(parseSvgTransform("translate(10 20) scale(2)")).toEqual([2, 0, 0, 2, 10, 20]);
    const contours = parseSvgPathContours(
      "M0 0 H20 V20 H0 Z M5 5 C5 3 15 3 15 5 V15 H5 Z",
      12,
    );
    expect(contours).toHaveLength(2);
    expect(contours[1]!.length).toBeGreaterThan(12);
    expect(() => parseSvgPathContours("M0 0 L10", 12)).toThrow(/missing coordinates/iu);
  });

  it("preserves holes and unions overlapping filled silhouettes", () => {
    const nested = nestedContoursToPolygons([
      [[0, 0], [20, 0], [20, 20], [0, 20]],
      [[5, 5], [15, 5], [15, 15], [5, 15]],
    ]);
    expect(nested).toHaveLength(1);
    expect(nested[0]).toHaveLength(2);

    const merged = unionChromishPolygons([
      rectangle(0, 0, 10, 10),
      rectangle(5, 0, 15, 10),
    ]);
    expect(merged).toHaveLength(1);
    const xs = merged[0]![0]!.map(([x]) => x);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(15);
  });

  it("traces a raster alpha cell into a closed silhouette contour", () => {
    const pixels = new Uint8ClampedArray(3 * 3 * 4);
    pixels[(1 * 3 + 1) * 4 + 3] = 255;
    const contours = traceChromishAlphaEdges(pixels, 3, 3);
    expect(contours).toHaveLength(1);
    expect(contours[0]).toHaveLength(4);
  });

  it("centers, Y-flips, symmetrically extrudes, and generates finite normals", () => {
    const polygons = unionChromishPolygons([rectangle(10, 20, 50, 40)]);
    const mesh = extrudeChromishPolygons(
      polygons,
      { bevel: 0.04, depth: 0.24, detail: "fine" },
      { elementCount: 1, route: "vector", sourceSvg: "<svg/>" },
    );
    expect(mesh.bounds.min[0] + mesh.bounds.max[0]).toBeCloseTo(0, 5);
    expect(mesh.bounds.max[0] - mesh.bounds.min[0]).toBeGreaterThanOrEqual(2);
    expect(mesh.bounds.min[1] + mesh.bounds.max[1]).toBeCloseTo(0, 5);
    expect(mesh.bounds.min[2] + mesh.bounds.max[2]).toBeCloseTo(0, 5);
    expect(mesh.bounds.max[2] - mesh.bounds.min[2]).toBeCloseTo(0.32, 5);
    expect(mesh.triangleCount).toBeGreaterThan(0);
    expect([...mesh.normals].every(Number.isFinite)).toBe(true);
  });

  it("smooths duplicate normals across rounded bevel and side segments", () => {
    const circle = Array.from({ length: 65 }, (_, index) => {
      const angle = (index / 64) * Math.PI * 2;
      return [50 + Math.cos(angle) * 40, 50 + Math.sin(angle) * 40] as [number, number];
    });
    const mesh = extrudeChromishPolygons(
      [[[...circle]]],
      { bevel: 0.04, depth: 0.24, detail: "fine" },
      { elementCount: 1, route: "vector", sourceSvg: "<svg/>" },
    );
    const normalsByPosition = new Map<string, number[][]>();
    for (let offset = 0; offset < mesh.positions.length; offset += 3) {
      const key = [
        mesh.positions[offset]!.toFixed(5),
        mesh.positions[offset + 1]!.toFixed(5),
        mesh.positions[offset + 2]!.toFixed(5),
      ].join(":");
      const group = normalsByPosition.get(key) ?? [];
      group.push([
        mesh.normals[offset]!,
        mesh.normals[offset + 1]!,
        mesh.normals[offset + 2]!,
      ]);
      normalsByPosition.set(key, group);
    }
    const sharedGroups = [...normalsByPosition.values()].filter((group) => group.length > 1);
    expect(sharedGroups.length).toBeGreaterThan(0);
    for (const group of sharedGroups) {
      const reference = group[0]!;
      for (const normal of group.slice(1)) {
        const dot = reference[0]! * normal[0]! + reference[1]! * normal[1]! + reference[2]! * normal[2]!;
        expect(dot).toBeGreaterThan(0.999);
      }
    }
  });

  it("rejects invalid and excessive final triangle counts", () => {
    expect(() => assertChromishTriangleLimit(-1)).toThrow(/invalid triangle count/iu);
    expect(() => assertChromishTriangleLimit(100_001)).toThrow(/100,001 triangles/iu);
  });
});
