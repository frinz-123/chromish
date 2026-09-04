import { BufferGeometry, Float32BufferAttribute, Path, Shape, ShapeGeometry, Vector2 } from "three";
import clipping, { type MultiPolygon, type Pair } from "polygon-clipping";

type TraceMask = (rgba: Uint8ClampedArray, size: number) => MultiPolygon;
const GRID = 384;
const ORIGIN = -1.04;
const CELL = 2.08 / GRID;

function shapePolygons(shapes: Shape[]): MultiPolygon {
  return shapes.map(shape => {
    const points = shape.extractPoints(12);
    return [points.shape, ...points.holes].map(ring => {
      const result: Pair[] = ring.map(p => [p.x, p.y]);
      if (result.length && (result[0]![0] !== result.at(-1)![0] || result[0]![1] !== result.at(-1)![1])) result.push([...result[0]!] as Pair);
      return result;
    });
  });
}

function distanceField(polygons: MultiPolygon): Float32Array {
  const field = new Float32Array(GRID * GRID);
  const rings = polygons.flat();
  // Scanline parity preserves concavities and holes, without per-pixel edge searches.
  for (let y = 1; y < GRID - 1; y++) {
    const worldY = ORIGIN + (y + 0.5) * CELL;
    const intersections: number[] = [];
    for (const ring of rings) for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!; const b = ring[i]!;
      if ((a[1] > worldY) !== (b[1] > worldY)) intersections.push(a[0] + (worldY - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.max(1, Math.ceil((intersections[i]! - ORIGIN) / CELL - 0.5));
      const right = Math.min(GRID - 2, Math.floor((intersections[i + 1]! - ORIGIN) / CELL - 0.5));
      for (let x = left; x <= right; x++) field[y * GRID + x] = 1e5;
    }
  }
  const diagonal = Math.SQRT2;
  for (let y = 1; y < GRID - 1; y++) for (let x = 1; x < GRID - 1; x++) {
    const i = y * GRID + x;
    field[i] = Math.min(field[i]!, field[i - 1]! + 1, field[i - GRID]! + 1, field[i - GRID - 1]! + diagonal, field[i - GRID + 1]! + diagonal);
  }
  for (let y = GRID - 2; y > 0; y--) for (let x = GRID - 2; x > 0; x--) {
    const i = y * GRID + x;
    field[i] = Math.min(field[i]!, field[i + 1]! + 1, field[i + GRID]! + 1, field[i + GRID + 1]! + diagonal, field[i + GRID - 1]! + diagonal);
  }
  return field;
}

function toShapes(polygons: MultiPolygon): Shape[] {
  return polygons.map(polygon => {
    const rings = polygon.map(ring => ring.slice(0, -1).map(([x, y]) => new Vector2(x, y)));
    const shape = new Shape(rings[0]);
    shape.holes = rings.slice(1).map(ring => new Path(ring));
    return shape;
  });
}

/** Real planar crown/pavilion surfaces. Only inset contours use a distance grid;
 * the authored outer silhouette and holes remain exact geometry. */
export function buildGemCutGeometry(shapes: Shape[], options: { depth: number; bevel: number }, trace: TraceMask): BufferGeometry | null {
  const outer = shapePolygons(shapes);
  const field = distanceField(outer);
  let maximum = 0;
  for (const distance of field) maximum = Math.max(maximum, distance);
  if (maximum < 3) return null;
  const inset = (width: number) => {
    const pixels = new Uint8ClampedArray(GRID * GRID * 4);
    for (let i = 0; i < field.length; i++) if (field[i]! * CELL > width) pixels[i * 4 + 3] = 255;
    return trace(pixels, GRID).map(polygon => polygon.map(ring => ring.map(([x, y]): Pair => [ORIGIN + x * CELL, ORIGIN + y * CELL])));
  };
  const crownWidth = Math.min(options.depth * 0.55 + options.bevel * 0.8, maximum * CELL * 0.48);
  const pavilionWidth = Math.min(crownWidth * 1.8, maximum * CELL * 0.86);
  const table = inset(crownWidth);
  const culet = inset(pavilionWidth);
  if (!table.length || !culet.length) return null;
  const positions: number[] = [];
  const key = (x: number, y: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;
  const girdle = Math.max(0.008, options.depth * 0.06);
  const crownZ = girdle + options.depth * 0.52;
  const pavilionZ = -girdle - options.depth * 0.86;
  function surface(polygons: MultiPolygon, inner: MultiPolygon, edgeZ: number, innerZ: number, reverse: boolean): void {
    const innerPoints = new Set(inner.flat(2).map(([x, y]) => key(x, y)));
    const indexed = new ShapeGeometry(toShapes(polygons));
    const geometry = indexed.toNonIndexed();
    const points = geometry.getAttribute("position");
    for (let i = 0; i < points.count; i += 3) {
      for (const corner of reverse ? [0, 2, 1] : [0, 1, 2]) {
        const x = points.getX(i + corner); const y = points.getY(i + corner);
        positions.push(x, y, innerPoints.has(key(x, y)) ? innerZ : edgeZ);
      }
    }
    geometry.dispose(); indexed.dispose();
  }
  surface(clipping.difference(outer, table), table, girdle, crownZ, false);
  surface(table, table, crownZ, crownZ, false);
  surface(clipping.difference(outer, culet), culet, -girdle, pavilionZ, true);
  surface(culet, culet, pavilionZ, pavilionZ, true);
  for (const polygon of outer) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]!; const b = ring[i]!;
    positions.push(a[0], a[1], -girdle, b[0], b[1], -girdle, a[0], a[1], girdle,
      b[0], b[1], -girdle, b[0], b[1], girdle, a[0], a[1], girdle);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
