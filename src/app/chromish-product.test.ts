import { describe, expect, it } from "vitest";

import { appAcceptance, appProductReadiness, appTransferMode } from "./app-acceptance-data";
import { appSchema } from "./app-schema";
import { serializeChrmesh } from "./chromish/kits";
import { preflightSvgText, ChromishSvgError } from "./chromish/svg-sanitizer";

describe("Chromish product contracts", () => {
  for (const row of appAcceptance) {
    it(row.automatedTestName, () => {
      expect(row.automated).toBe(true);
      expect(row.browser).toBe(true);
      expect(row.expectedObservable.length).toBeGreaterThan(20);
    });
  }

  it("declares product export, orbit, persistence, and motion-reference intent", () => {
    expect(appProductReadiness.mode).toBe("product");
    expect(appSchema.persistence.storage).toBe("localStorage");
    expect(appTransferMode.referenceInputs).toHaveLength(1);
  });

  it("rejects unsafe and empty SVG preflight input", () => {
    expect(() => preflightSvgText("<svg><script>alert(1)</script></svg>"))
      .toThrow(ChromishSvgError);
    expect(() => preflightSvgText(`<svg onload="alert(1)"/>`))
      .toThrow(/event-handler/iu);
    expect(() => preflightSvgText(" ")).toThrow(/empty/iu);
  });

  it("serializes deterministic little-endian CHRMSH01 geometry", () => {
    const mesh = {
      bounds: { max: [1, 1, 0.1], min: [-1, -1, -0.1] },
      elementCount: 1,
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
      route: "vector" as const,
      sourceSvg: "<svg/>",
      triangleCount: 1,
    } as const;
    const first = serializeChrmesh(mesh);
    const second = serializeChrmesh(mesh);
    expect(first).toEqual(second);
    expect(new TextDecoder().decode(first.subarray(0, 8))).toBe("CHRMSH01");
    const view = new DataView(first.buffer, first.byteOffset, first.byteLength);
    expect(view.getUint32(8, true)).toBe(3);
    expect(view.getUint32(12, true)).toBe(3);
  });
});

