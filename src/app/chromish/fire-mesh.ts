import type { ChromishCpuMesh } from "./svg-mesh";

/** Source-time conforming refinement: shared edges split together, never per frame. */
export function refineFireMesh(mesh: ChromishCpuMesh, maxTriangles = 100_000): ChromishCpuMesh {
  const positions = Array.from(mesh.positions);
  const normals = Array.from(mesh.normals);
  let indices = Array.from(mesh.indices);
  const edgeLength = 0.055;
  for (let level = 0; level < 8; level++) {
    const midpoint = new Map<string, number>();
    const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
    let count = 0;
    for (let i = 0; i < indices.length; i += 3) {
      let splits = 0;
      for (let e = 0; e < 3; e++) {
        const a = indices[i + e]!; const b = indices[i + (e + 1) % 3]!;
        let squared = 0;
        for (let axis = 0; axis < 3; axis++) squared += (positions[a * 3 + axis]! - positions[b * 3 + axis]!) ** 2;
        if (squared > edgeLength ** 2) { midpoint.set(key(a, b), -1); splits++; }
      }
      count += splits + 1;
    }
    if (!midpoint.size || count > maxTriangles) break;
    const middle = (a: number, b: number): number => {
      const id = key(a, b); const existing = midpoint.get(id)!;
      if (existing >= 0) return existing;
      const index = positions.length / 3;
      for (let axis = 0; axis < 3; axis++) {
        positions.push((positions[a * 3 + axis]! + positions[b * 3 + axis]!) * 0.5);
        normals.push((normals[a * 3 + axis]! + normals[b * 3 + axis]!) * 0.5);
      }
      midpoint.set(id, index); return index;
    };
    const next: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const corners = indices.slice(i, i + 3);
      const marked = corners.map((a, e) => midpoint.has(key(a, corners[(e + 1) % 3]!)));
      const splits = marked.filter(Boolean).length;
      if (!splits) { next.push(...corners); continue; }
      // Rotate so a-b is the only split, or a-b and b-c are the two splits.
      const start = splits === 2 ? marked.findIndex((v, e) => v && marked[(e + 1) % 3]) : marked.indexOf(true);
      const [a, b, c] = [corners[start]!, corners[(start + 1) % 3]!, corners[(start + 2) % 3]!];
      const ab = middle(a, b);
      if (splits === 1) next.push(a, ab, c, ab, b, c);
      else {
        const bc = middle(b, c);
        if (splits === 2) next.push(a, ab, c, ab, bc, c, ab, b, bc);
        else { const ca = middle(c, a); next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); }
      }
    }
    indices = next;
  }
  return { ...mesh, positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices), triangleCount: indices.length / 3 };
}

const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t);
};

/** CPU twin for pointer-down picking; GPU executes this during playback. */
export function fireDeformedPoint(x: number, y: number, z: number, phase: number, minY: number, maxY: number, settings: readonly number[] = [1, 1]): [number, number, number] {
  const height = (y - minY) / Math.max(maxY - minY, 0.001);
  const fuel = smooth(0.18, 0.92, height);
  const tongue = (0.5 + 0.5 * Math.sin(x * 18 + Math.sin(phase * 2 + x * 5) * 1.5 + phase * 4)) ** 3;
  const curl = Math.sin(x * 12 - y * 7 + phase * 3) + 0.45 * Math.sin(x * 27 + y * 10 - phase * 5);
  return [x + settings[1]! * fuel * (0.055 * curl + 0.07 * Math.sin(y * 17 - phase * 4)), y + settings[0]! * fuel * (0.06 + 0.48 * tongue), z + settings[1]! * fuel * 0.035 * Math.sin(x * 13 - y * 9 + phase * 3)];
}

export const FIRE_DEFORMATION_WGSL = /* wgsl */ `
fn fireDeformedPosition(position: vec3f, time: f32, minY: f32, maxY: f32) -> vec3f {
  let height = (position.y - minY) / max(maxY - minY, 0.001);
  let fuel = smoothstep(0.18, 0.92, height);
  let tongue = pow(0.5 + 0.5 * sin(position.x * 18.0 + sin(time * 2.0 + position.x * 5.0) * 1.5 + time * 4.0), 3.0);
  let curl = sin(position.x * 12.0 - position.y * 7.0 + time * 3.0) + 0.45 * sin(position.x * 27.0 + position.y * 10.0 - time * 5.0);
  return position + fuel * vec3f(0.055 * curl + 0.07 * sin(position.y * 17.0 - time * 4.0), 0.06 + 0.48 * tongue, 0.035 * sin(position.x * 13.0 - position.y * 9.0 + time * 3.0));
}
`;
