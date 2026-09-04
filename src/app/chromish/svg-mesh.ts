import { BufferGeometry, ExtrudeGeometry, Path, Shape, Vector2 } from "three";
import {
  mergeGeometries,
  toCreasedNormals,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { union, type MultiPolygon, type Pair, type Polygon } from "polygon-clipping";

import { ChromishSvgError, sanitizeSvg, type SanitizedSvg } from "./svg-sanitizer";

export const CHROMISH_MAX_TRIANGLES = 100_000;

export type ChromishDetail = "balanced" | "fine";

export type ChromishCpuMesh = Readonly<{
  bounds: Readonly<{ max: readonly [number, number, number]; min: readonly [number, number, number] }>;
  elementCount: number;
  indices: Uint32Array;
  normals: Float32Array;
  positions: Float32Array;
  route: "raster" | "vector";
  sourceSvg: string;
  triangleCount: number;
}>;

type Point = readonly [number, number];

function closedRing(points: readonly Point[]): Pair[] {
  const ring = points.map(([x, y]) => [x, y] as Pair);
  if (ring.length > 0) {
    const first = ring[0]!;
    const last = ring.at(-1)!;
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  }
  return ring;
}

function signedArea(points: readonly Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area * 0.5;
}

function pointSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function simplifyOpen(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return [...points];
  let maximum = 0;
  let selected = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointSegmentDistance(points[index]!, points[0]!, points.at(-1)!);
    if (distance > maximum) {
      maximum = distance;
      selected = index;
    }
  }
  if (maximum <= tolerance) return [points[0]!, points.at(-1)!];
  return [
    ...simplifyOpen(points.slice(0, selected + 1), tolerance).slice(0, -1),
    ...simplifyOpen(points.slice(selected), tolerance),
  ];
}

export function simplifyClosedContour(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 5 || tolerance <= 0) return [...points];
  const withoutClose = points[0]?.[0] === points.at(-1)?.[0] && points[0]?.[1] === points.at(-1)?.[1]
    ? points.slice(0, -1)
    : [...points];
  const simplified = simplifyOpen([...withoutClose, withoutClose[0]!], tolerance);
  return simplified.length >= 4 ? simplified.slice(0, -1) : withoutClose;
}

function isPointInside(point: Point, ring: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]!;
    const b = ring[j]!;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function contoursToPolygons(contours: readonly Point[][]): Polygon[] {
  const outers = contours.filter((ring) => signedArea(ring) > 0).map((ring) => ({ holes: [] as Point[][], ring }));
  const holes = contours.filter((ring) => signedArea(ring) < 0);
  for (const hole of holes) {
    const container = outers
      .filter(({ ring }) => isPointInside(hole[0]!, ring))
      .sort((left, right) => Math.abs(signedArea(left.ring)) - Math.abs(signedArea(right.ring)))[0];
    if (container) container.holes.push(hole);
  }
  return outers.map(({ holes: inner, ring }) => [closedRing(ring), ...inner.map(closedRing)]);
}

export function unionChromishPolygons(polygons: readonly Polygon[]): MultiPolygon {
  if (polygons.length === 0) return [];
  return union(polygons[0]!, ...polygons.slice(1));
}

type Matrix2D = readonly [number, number, number, number, number, number];

const identity2D: Matrix2D = [1, 0, 0, 1, 0, 0];

function multiply2D(left: Matrix2D, right: Matrix2D): Matrix2D {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function transformPoint(matrix: Matrix2D, point: Point): Point {
  return [
    matrix[0] * point[0] + matrix[2] * point[1] + matrix[4],
    matrix[1] * point[0] + matrix[3] * point[1] + matrix[5],
  ];
}

function parseNumbers(value: string): number[] {
  return [...value.matchAll(/[+-]?(?:\d*\.\d+|\d+\.?)(?:e[+-]?\d+)?/giu)].map((match) => Number(match[0]));
}

export function parseSvgTransform(value: string | null): Matrix2D {
  if (!value) return identity2D;
  let matrix = identity2D;
  for (const match of value.matchAll(/([a-z]+)\s*\(([^)]*)\)/giu)) {
    const name = match[1]!.toLowerCase();
    const values = parseNumbers(match[2] ?? "");
    let next: Matrix2D = identity2D;
    if (name === "matrix" && values.length >= 6) {
      next = values.slice(0, 6) as unknown as Matrix2D;
    } else if (name === "translate") {
      next = [1, 0, 0, 1, values[0] ?? 0, values[1] ?? 0];
    } else if (name === "scale") {
      next = [values[0] ?? 1, 0, 0, values[1] ?? values[0] ?? 1, 0, 0];
    } else if (name === "rotate") {
      const angle = ((values[0] ?? 0) * Math.PI) / 180;
      const rotation: Matrix2D = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
      const cx = values[1] ?? 0;
      const cy = values[2] ?? 0;
      next = multiply2D(
        [1, 0, 0, 1, cx, cy],
        multiply2D(rotation, [1, 0, 0, 1, -cx, -cy]),
      );
    } else if (name === "skewx") {
      next = [1, 0, Math.tan(((values[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    } else if (name === "skewy") {
      next = [1, Math.tan(((values[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    matrix = multiply2D(matrix, next);
  }
  return matrix;
}

function worldTransform(element: Element): Matrix2D {
  const chain: Element[] = [];
  for (let current: Element | null = element; current; current = current.parentElement) chain.unshift(current);
  return chain.reduce((matrix, current) => multiply2D(matrix, parseSvgTransform(current.getAttribute("transform"))), identity2D);
}

function cubicPoint(start: Point, a: Point, b: Point, end: Point, t: number): Point {
  const u = 1 - t;
  return [
    u ** 3 * start[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t ** 3 * end[0],
    u ** 3 * start[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t ** 3 * end[1],
  ];
}

function quadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
  const u = 1 - t;
  return [
    u * u * start[0] + 2 * u * t * control[0] + t * t * end[0],
    u * u * start[1] + 2 * u * t * control[1] + t * t * end[1],
  ];
}

function vectorAngle(u: Point, v: Point): number {
  const dot = u[0] * v[0] + u[1] * v[1];
  const length = Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot / Math.max(length, 1e-12))));
  return u[0] * v[1] - u[1] * v[0] < 0 ? -angle : angle;
}

function arcPoints(
  start: Point,
  rxInput: number,
  ryInput: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  end: Point,
  subdivisions: number,
): Point[] {
  let rx = Math.abs(rxInput);
  let ry = Math.abs(ryInput);
  if (rx === 0 || ry === 0 || (start[0] === end[0] && start[1] === end[1])) return [end];
  const phi = (rotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (start[0] - end[0]) * 0.5;
  const dy = (start[1] - end[1]) * 0.5;
  const xPrime = cosPhi * dx + sinPhi * dy;
  const yPrime = -sinPhi * dx + cosPhi * dy;
  const radiusScale = xPrime ** 2 / rx ** 2 + yPrime ** 2 / ry ** 2;
  if (radiusScale > 1) {
    const factor = Math.sqrt(radiusScale);
    rx *= factor;
    ry *= factor;
  }
  const numerator = Math.max(0, rx ** 2 * ry ** 2 - rx ** 2 * yPrime ** 2 - ry ** 2 * xPrime ** 2);
  const denominator = Math.max(1e-12, rx ** 2 * yPrime ** 2 + ry ** 2 * xPrime ** 2);
  const sign = largeArc === sweep ? -1 : 1;
  const coefficient = sign * Math.sqrt(numerator / denominator);
  const cxPrime = coefficient * (rx * yPrime) / ry;
  const cyPrime = coefficient * (-ry * xPrime) / rx;
  const cx = cosPhi * cxPrime - sinPhi * cyPrime + (start[0] + end[0]) * 0.5;
  const cy = sinPhi * cxPrime + cosPhi * cyPrime + (start[1] + end[1]) * 0.5;
  const u: Point = [(xPrime - cxPrime) / rx, (yPrime - cyPrime) / ry];
  const v: Point = [(-xPrime - cxPrime) / rx, (-yPrime - cyPrime) / ry];
  const startAngle = vectorAngle([1, 0], u);
  let delta = vectorAngle(u, v);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  const steps = Math.max(2, Math.ceil(subdivisions * Math.abs(delta) / (Math.PI * 0.5)));
  return Array.from({ length: steps }, (_, index) => {
    const theta = startAngle + delta * ((index + 1) / steps);
    const x = rx * Math.cos(theta);
    const y = ry * Math.sin(theta);
    return [cosPhi * x - sinPhi * y + cx, sinPhi * x + cosPhi * y + cy] as Point;
  });
}

export function parseSvgPathContours(data: string, subdivisions: number): Point[][] {
  const tokens = [...data.matchAll(/[a-zA-Z]|[+-]?(?:\d*\.\d+|\d+\.?)(?:e[+-]?\d+)?/gu)].map((match) => match[0]!);
  const contours: Point[][] = [];
  let index = 0;
  let command = "";
  let current: Point = [0, 0];
  let start: Point = [0, 0];
  let contour: Point[] = [];
  let cubicControl: Point | null = null;
  let quadraticControl: Point | null = null;
  const isCommand = (token: string | undefined) => Boolean(token && /^[a-z]$/iu.test(token));
  const take = () => {
    const token = tokens[index++];
    if (token === undefined || isCommand(token)) {
      throw new ChromishSvgError("invalid-svg", `SVG path command ${command} is missing coordinates.`);
    }
    const value = Number(token);
    if (!Number.isFinite(value)) {
      throw new ChromishSvgError("invalid-svg", "An SVG path contains a non-finite coordinate.");
    }
    return value;
  };
  const point = (relative: boolean): Point => {
    const x = take();
    const y = take();
    return relative ? [current[0] + x, current[1] + y] : [x, y];
  };
  const finish = () => {
    if (contour.length >= 3) contours.push(contour);
    contour = [];
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) command = tokens[index++]!;
    if (!command) throw new ChromishSvgError("invalid-svg", "An SVG path starts without a command.");
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === "Z") {
      finish();
      current = start;
      cubicControl = null;
      quadraticControl = null;
      command = "";
      continue;
    }
    if (upper === "M") {
      const next = point(relative);
      if (contour.length > 0) finish();
      current = next;
      start = next;
      contour = [next];
      command = relative ? "l" : "L";
      continue;
    }
    if (upper === "L") {
      current = point(relative);
      contour.push(current);
    } else if (upper === "H") {
      const x = take();
      current = [relative ? current[0] + x : x, current[1]];
      contour.push(current);
    } else if (upper === "V") {
      const y = take();
      current = [current[0], relative ? current[1] + y : y];
      contour.push(current);
    } else if (upper === "C") {
      const a = point(relative);
      const b = point(relative);
      const end = point(relative);
      for (let step = 1; step <= subdivisions; step += 1) contour.push(cubicPoint(current, a, b, end, step / subdivisions));
      current = end;
      cubicControl = b;
    } else if (upper === "S") {
      const a: Point = cubicControl ? [2 * current[0] - cubicControl[0], 2 * current[1] - cubicControl[1]] : current;
      const b = point(relative);
      const end = point(relative);
      for (let step = 1; step <= subdivisions; step += 1) contour.push(cubicPoint(current, a, b, end, step / subdivisions));
      current = end;
      cubicControl = b;
    } else if (upper === "Q") {
      const control = point(relative);
      const end = point(relative);
      for (let step = 1; step <= subdivisions; step += 1) contour.push(quadraticPoint(current, control, end, step / subdivisions));
      current = end;
      quadraticControl = control;
    } else if (upper === "T") {
      const control: Point = quadraticControl ? [2 * current[0] - quadraticControl[0], 2 * current[1] - quadraticControl[1]] : current;
      const end = point(relative);
      for (let step = 1; step <= subdivisions; step += 1) contour.push(quadraticPoint(current, control, end, step / subdivisions));
      current = end;
      quadraticControl = control;
    } else if (upper === "A") {
      const rx = take();
      const ry = take();
      const rotation = take();
      const largeArc = take() !== 0;
      const sweep = take() !== 0;
      const end = point(relative);
      contour.push(...arcPoints(current, rx, ry, rotation, largeArc, sweep, end, Math.max(3, Math.floor(subdivisions / 4))));
      current = end;
    } else {
      throw new ChromishSvgError("invalid-svg", `Unsupported SVG path command ${command}.`);
    }
    if (upper !== "C" && upper !== "S") cubicControl = null;
    if (upper !== "Q" && upper !== "T") quadraticControl = null;
  }
  finish();
  return contours;
}

function primitiveContours(element: Element, subdivisions: number): Point[][] {
  const name = element.localName.toLowerCase();
  const number = (attribute: string, fallback = 0) => Number(element.getAttribute(attribute) ?? fallback);
  if (name === "path") return parseSvgPathContours(element.getAttribute("d") ?? "", subdivisions);
  if (name === "polygon" || name === "polyline") {
    const values = parseNumbers(element.getAttribute("points") ?? "");
    const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => [values[index * 2]!, values[index * 2 + 1]!] as Point);
    return points.length >= 3 ? [points] : [];
  }
  if (name === "rect") {
    const x = number("x");
    const y = number("y");
    const width = number("width");
    const height = number("height");
    return width > 0 && height > 0 ? [[[x, y], [x + width, y], [x + width, y + height], [x, y + height]]] : [];
  }
  if (name === "circle" || name === "ellipse") {
    const cx = number("cx");
    const cy = number("cy");
    const rx = name === "circle" ? number("r") : number("rx");
    const ry = name === "circle" ? number("r") : number("ry");
    const count = Math.max(24, subdivisions * 4);
    return rx > 0 && ry > 0
      ? [Array.from({ length: count }, (_, index) => {
          const angle = (index / count) * Math.PI * 2;
          return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry] as Point;
        })]
      : [];
  }
  return [];
}

export function nestedContoursToPolygons(contours: readonly Point[][]): Polygon[] {
  const records = contours.map((ring) => ({
    depth: contours.filter((candidate) => candidate !== ring && isPointInside(ring[0]!, candidate)).length,
    holes: [] as Point[][],
    ring,
  }));
  const outers = records.filter(({ depth }) => depth % 2 === 0);
  for (const hole of records.filter(({ depth }) => depth % 2 === 1)) {
    const container = outers
      .filter(({ depth, ring }) => depth === hole.depth - 1 && isPointInside(hole.ring[0]!, ring))
      .sort((left, right) => Math.abs(signedArea(left.ring)) - Math.abs(signedArea(right.ring)))[0];
    container?.holes.push(hole.ring);
  }
  return outers.map(({ holes, ring }) => [closedRing(ring), ...holes.map(closedRing)]);
}

function vectorPolygons(svg: SanitizedSvg, detail: ChromishDetail): MultiPolygon {
  const document = new DOMParser().parseFromString(svg.source, "image/svg+xml");
  const subdivisions = detail === "fine" ? 24 : 12;
  const polygons: Polygon[] = [];
  for (const element of document.querySelectorAll("path,rect,circle,ellipse,polygon,polyline")) {
    const ancestors: Element[] = [];
    for (let candidate: Element | null = element; candidate; candidate = candidate.parentElement) {
      ancestors.push(candidate);
    }
    const inheritedFillNone = ancestors.some(
      (candidate) => candidate.getAttribute("fill")?.trim().toLowerCase() === "none",
    );
    if (inheritedFillNone || Number(element.getAttribute("fill-opacity") ?? 1) <= 0) continue;
    const matrix = worldTransform(element);
    const contours = primitiveContours(element, subdivisions)
      .map((ring) => ring.map((point) => transformPoint(matrix, point)))
      .filter((ring) => ring.length >= 3);
    polygons.push(...nestedContoursToPolygons(contours));
  }
  return unionChromishPolygons(polygons);
}

function encodeSvgDataUrl(source: string): string {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ChromishSvgError("invalid-svg", "The browser could not rasterize this SVG."));
    image.src = encodeSvgDataUrl(source);
  });
}

type Edge = readonly [Point, Point];

export function traceChromishAlphaEdges(alpha: Uint8ClampedArray, width: number, height: number): Point[][] {
  const isFilled = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && alpha[(y * width + x) * 4 + 3]! >= 8;
  const edges: Edge[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isFilled(x, y)) continue;
      if (!isFilled(x, y - 1)) edges.push([[x, y], [x + 1, y]]);
      if (!isFilled(x + 1, y)) edges.push([[x + 1, y], [x + 1, y + 1]]);
      if (!isFilled(x, y + 1)) edges.push([[x + 1, y + 1], [x, y + 1]]);
      if (!isFilled(x - 1, y)) edges.push([[x, y + 1], [x, y]]);
    }
  }

  const outgoing = new Map<string, Point[]>();
  const key = ([x, y]: Point) => `${x},${y}`;
  for (const [start, end] of edges) {
    const list = outgoing.get(key(start)) ?? [];
    list.push(end);
    outgoing.set(key(start), list);
  }

  const contours: Point[][] = [];
  while (outgoing.size > 0) {
    const [startKey, starts] = outgoing.entries().next().value as [string, Point[]];
    const [sx, sy] = startKey.split(",").map(Number);
    const start: Point = [sx!, sy!];
    const contour: Point[] = [start];
    let current = start;
    let guard = 0;
    while (guard++ <= edges.length + 1) {
      const currentKey = key(current);
      const nextList = outgoing.get(currentKey);
      if (!nextList?.length) break;
      const next = nextList.shift()!;
      if (nextList.length === 0) outgoing.delete(currentKey);
      if (next[0] === start[0] && next[1] === start[1]) break;
      contour.push(next);
      current = next;
    }
    if (contour.length >= 3) contours.push(contour);
    if (starts.length === 0) outgoing.delete(startKey);
  }
  return contours;
}

async function rasterPolygons(svg: SanitizedSvg, detail: ChromishDetail): Promise<MultiPolygon> {
  const image = await loadImage(svg.source);
  const sourceWidth = image.naturalWidth || 1;
  const sourceHeight = image.naturalHeight || 1;
  const edge = detail === "fine" ? 1536 : 768;
  const scale = edge / Math.max(sourceWidth, sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new ChromishSvgError("unsupported-svg", "Canvas tracing is unavailable.");
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const contours = traceChromishAlphaEdges(context.getImageData(0, 0, width, height).data, width, height)
    .map((ring) => simplifyClosedContour(ring, detail === "fine" ? 0.75 : 1.25))
    .filter((ring) => ring.length >= 3);
  return unionChromishPolygons(contoursToPolygons(contours));
}

function normalizedShapes(polygons: MultiPolygon): Shape[] {
  const points = polygons.flat(2);
  if (points.length === 0) return [];
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  const extent = Math.max(maxX - minX, maxY - minY);
  if (!Number.isFinite(extent) || extent <= 0) return [];
  const scale = 2 / extent;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const convert = ([x, y]: Pair) => new Vector2((x - cx) * scale, -(y - cy) * scale);

  return polygons.flatMap((polygon) => {
    const outer = polygon[0]?.slice(0, -1).map(convert) ?? [];
    if (outer.length < 3) return [];
    const shape = new Shape(outer);
    for (const ring of polygon.slice(1)) {
      const holePoints = ring.slice(0, -1).map(convert);
      if (holePoints.length >= 3) shape.holes.push(new Path(holePoints));
    }
    return [shape];
  });
}

function geometryToMesh(
  geometry: BufferGeometry,
  sourceSvg: string,
  elementCount: number,
  route: ChromishCpuMesh["route"],
): ChromishCpuMesh {
  const meshGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
  if (meshGeometry !== geometry) geometry.dispose();

  // ExtrudeGeometry duplicates vertices for every triangle. Its default normals
  // consequently make each curved side segment reflect the studio separately,
  // which appears as horizontal scanlines on circles and rounded paths. Scale
  // before Three's crease weld so its fixed position quantization remains much
  // finer than Chromish's normalized silhouette detail.
  meshGeometry.scale(1_000, 1_000, 1_000);
  toCreasedNormals(meshGeometry, Math.PI / 3);
  meshGeometry.scale(0.001, 0.001, 0.001);

  meshGeometry.computeBoundingBox();
  const positions = new Float32Array(meshGeometry.getAttribute("position").array);
  const normals = new Float32Array(meshGeometry.getAttribute("normal").array);
  const vertexCount = positions.length / 3;
  const indexAttribute = meshGeometry.getIndex();
  const indices = indexAttribute
    ? new Uint32Array(indexAttribute.array)
    : Uint32Array.from({ length: vertexCount }, (_, index) => index);
  const triangleCount = Math.floor(indices.length / 3);
  try {
    assertChromishTriangleLimit(triangleCount);
  } catch (error) {
    meshGeometry.dispose();
    throw error;
  }
  const bounds = meshGeometry.boundingBox!;
  meshGeometry.dispose();
  return {
    bounds: {
      max: [bounds.max.x, bounds.max.y, bounds.max.z],
      min: [bounds.min.x, bounds.min.y, bounds.min.z],
    },
    elementCount,
    indices,
    normals,
    positions,
    route,
    sourceSvg,
    triangleCount,
  };
}

export function assertChromishTriangleLimit(triangleCount: number): void {
  if (!Number.isSafeInteger(triangleCount) || triangleCount < 0) {
    throw new ChromishSvgError("invalid-svg", "The generated mesh has an invalid triangle count.");
  }
  if (triangleCount > CHROMISH_MAX_TRIANGLES) {
    throw new ChromishSvgError(
      "svg-too-complex",
      `The generated mesh has ${triangleCount.toLocaleString()} triangles; the limit is ${CHROMISH_MAX_TRIANGLES.toLocaleString()}.`,
    );
  }
}

export function extrudeChromishPolygons(
  polygons: MultiPolygon,
  options: Readonly<{ bevel: number; depth: number; detail: ChromishDetail }>,
  metadata: Readonly<{
    elementCount: number;
    route: ChromishCpuMesh["route"];
    sourceSvg: string;
  }>,
): ChromishCpuMesh {
  const shapes = normalizedShapes(polygons);
  if (shapes.length === 0) {
    throw new ChromishSvgError("empty-svg", "The SVG has no visible alpha silhouette to extrude.");
  }
  const bevel = Math.max(0, Math.min(options.bevel, options.depth * 0.45));
  const geometries = shapes.map((shape) => new ExtrudeGeometry(shape, {
    bevelEnabled: bevel > 0,
    bevelOffset: 0,
    bevelSegments: options.detail === "fine" ? 5 : 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: options.detail === "fine" ? 24 : 12,
    depth: options.depth,
    steps: 1,
  }).translate(0, 0, -options.depth * 0.5));
  const geometry = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false);
  if (!geometry) {
    geometries.forEach((item) => item.dispose());
    throw new ChromishSvgError("invalid-svg", "The SVG contours could not be combined into a mesh.");
  }
  if (geometries.length > 1) geometries.forEach((item) => item.dispose());
  return geometryToMesh(
    geometry,
    metadata.sourceSvg,
    metadata.elementCount,
    metadata.route,
  );
}

export async function buildChromishMesh(
  source: string,
  options: Readonly<{ bevel: number; depth: number; detail: ChromishDetail }>,
): Promise<ChromishCpuMesh> {
  const sanitized = sanitizeSvg(source);
  const route = sanitized.requiresRasterFallback ? "raster" : "vector";
  const polygons = route === "raster"
    ? await rasterPolygons(sanitized, options.detail)
    : vectorPolygons(sanitized, options.detail);
  return extrudeChromishPolygons(polygons, options, {
    elementCount: sanitized.elementCount,
    route,
    sourceSvg: sanitized.source,
  });
}
