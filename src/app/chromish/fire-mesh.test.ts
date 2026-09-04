import { expect, it } from "vitest";
import { fireDeformedPoint, refineFireMesh } from "./fire-mesh";
import { FIRE_COMPOSITE_WGSL } from "./fire-shader";
import type { ChromishCpuMesh } from "./svg-mesh";

const quad: ChromishCpuMesh = {
  positions: new Float32Array([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0]),
  normals: new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1]),
  indices: new Uint32Array([0,1,2, 0,2,3]), triangleCount: 2,
  bounds: { min: [-1,-1,0], max: [1,1,0] }, elementCount: 1, route: "vector", sourceSvg: "",
};

it("refines without cracks, flipped triangles, area loss or source mutation", () => {
  const mesh = refineFireMesh(quad);
  expect(mesh.triangleCount).toBeGreaterThan(1000);
  expect(mesh.triangleCount).toBeLessThanOrEqual(100_000);
  expect(quad.positions).toHaveLength(12);
  const edges = new Map<string, number>();
  let area = 0;
  for (let i=0; i<mesh.indices.length; i+=3) {
    const [a,b,c] = Array.from(mesh.indices.slice(i,i+3)).map(index => [mesh.positions[index*3]!,mesh.positions[index*3+1]!]);
    const cross = (b![0]!-a![0]!)*(c![1]!-a![1]!) - (b![1]!-a![1]!)*(c![0]!-a![0]!);
    expect(cross).toBeGreaterThan(0); area += cross/2;
    for (let e=0;e<3;e++) {
      const a=mesh.indices[i+e]!; const b=mesh.indices[i+(e+1)%3]!;
      const key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)??0)+1);
    }
  }
  expect(area).toBeCloseTo(4,6);
  for (const [key,count] of edges) if(count===1) {
    const [a,b]=key.split(":").map(Number);
    const p=[mesh.positions[a!*3]!,mesh.positions[a!*3+1]!]; const q=[mesh.positions[b!*3]!,mesh.positions[b!*3+1]!];
    expect((Math.abs(p[0]!)===1 && p[0]===q[0]) || (Math.abs(p[1]!)===1 && p[1]===q[1])).toBe(true);
  } else expect(count).toBe(2);
});

it("honors the refinement cap without dropping original triangles", () => {
  expect(refineFireMesh(quad, 2).indices).toEqual(quad.indices);
  expect(refineFireMesh(quad, 100).triangleCount).toBeLessThanOrEqual(100);
});

it("anchors the base, grows changing upper tongues and stitches the phase seam", () => {
  expect(fireDeformedPoint(0,-1,0,1.7,-1,1)).toEqual([0,-1,0]);
  let peak=0, changes=0;
  for(let i=0;i<=80;i++) {
    const x=-1+i/40;const a=fireDeformedPoint(x,1,0,0,-1,1);
    const b=fireDeformedPoint(x,1,0,1.7,-1,1);const seam=fireDeformedPoint(x,1,0,Math.PI*2,-1,1);
    a.forEach((n,axis)=>expect(seam[axis]).toBeCloseTo(n,6));
    peak=Math.max(peak,a[1]-1); if(Math.abs(a[1]-b[1])>0.1)changes++;
  }
  expect(peak).toBeGreaterThan(0.5);expect(changes).toBeGreaterThan(20);
  expect(FIRE_COMPOSITE_WGSL).not.toMatch(/\b(for|while)\s*\(/);
});
