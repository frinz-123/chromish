import { describe, expect, it } from "vitest";
import { createToolcraftState } from "@/toolcraft/runtime";
import { appSchema } from "../app-schema";
import { appControlSectionInventory } from "../app-acceptance-data";
import { getToolcraftControlSectionInventoryErrors } from "../acceptance/control-section-inventory";
import { getToolcraftControlSectionEntityCohesionErrors } from "../acceptance/control-section-entity-cohesion";
import { customizationTargets, defaultMaterialSettings, materialKnobs, materialKnobTarget, materialNames, readCustomization } from "./customization";
import { getChromishExportParameters } from "./export-parameters";
import { fireDeformedPoint } from "./fire-mesh";
import { createChromishRaycastCamera } from "./vgpu-renderer";

describe("material customization", () => {
  it("keeps the expanded sections complete and split by material workflow", () => {
    expect(getToolcraftControlSectionInventoryErrors(appSchema, appControlSectionInventory)).toEqual([]);
    expect(getToolcraftControlSectionEntityCohesionErrors(appControlSectionInventory)).toEqual([]);
  });
  it("keeps 24 material properties independent and three composition properties shared", () => {
    expect(new Set(customizationTargets).size).toBe(27);
    for (const material of materialNames) {
      const values = Object.fromEntries(materialKnobs[material].map((item) => [materialKnobTarget(material, item.key), item.max]));
      expect(readCustomization(values, material).materialSettings).toEqual(materialKnobs[material].map(item => item.max));
      for (const other of materialNames.filter(item => item !== material)) expect(readCustomization(values, other).materialSettings).toEqual(defaultMaterialSettings(other));
    }
  });
  it("uses the same bounded settings in export and preview, including old workspaces", () => {
    const state = createToolcraftState(appSchema);
    state.values["material.type"] = "glass";
    state.values["material.glass.ior"] = 1.8;
    state.values["composition.scale"] = 1.3;
    state.values["composition.fov"] = 45;
    state.values["composition.saturation"] = 0.5;
    const parameters = getChromishExportParameters(state, 0.25);
    expect(parameters).toMatchObject(readCustomization(state.values, "glass"));
    expect(createChromishRaycastCamera(640, 480, parameters).fov).toBe(45);
    expect(readCustomization({ "material.glass.ior": NaN }, "glass").materialSettings[0]).toBe(1.52);
  });
  it("keeps flame amplitudes anchored and loop-seamless at their maximum", () => {
    const p = [0.12, 0.8, 0.05] as const;
    const original = fireDeformedPoint(...p, 1.7, -1, 1, [0, 0]);
    expect(original).toEqual(p);
    const normal = fireDeformedPoint(...p, 1.7, -1, 1);
    const strong = fireDeformedPoint(...p, 1.7, -1, 1, [2, 2]);
    strong.forEach((v, i) => expect(v - p[i]!).toBeCloseTo((normal[i]! - p[i]!) * 2, 9));
    expect(fireDeformedPoint(0, -1, 0, 1.7, -1, 1, [2, 2])).toEqual([0, -1, 0]);
    const first = fireDeformedPoint(...p, 0, -1, 1, [2, 2]);
    fireDeformedPoint(...p, Math.PI * 2, -1, 1, [2, 2]).forEach((v, i) => expect(v).toBeCloseTo(first[i]!, 9));
  });
});
