import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { createToolcraftFeatureVerificationSelection } from "./feature-verification-selection";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
} from "./types";

function acceptance(
  id: string,
  target: string,
  kind: ToolcraftComponentAcceptance["kind"] = "control",
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `${id} unit`,
    browser: true,
    browserTestName: `browser: ${id}`,
    componentType: kind === "control" ? "control" : "runtime",
    evidence: "product-output",
    expectedObservable: `${id} changes output.`,
    fixture: "feature verification fixture",
    id,
    kind,
    target,
    userAction: `Change ${id}.`,
  };
}

const schema = defineToolcraft({
  canvas: { enabled: true },
  panels: {
    controls: {
      sections: [
        {
          controls: {
            frosting: {
              applicability: {
                all: [{ equals: "frosted", target: "material.layer" }],
                mode: "conditional",
              },
              defaultValue: "#FFFFFF",
              label: "Frosting",
              target: "material.frosting",
              type: "color",
            },
            gloss: {
              applicability: { mode: "always" },
              defaultValue: 0.5,
              label: "Gloss",
              max: 1,
              min: 0,
              target: "material.gloss",
              type: "slider",
            },
            layer: {
              applicability: { mode: "always" },
              defaultValue: "frosted",
              label: "Layer",
              options: [
                { label: "Frosted", value: "frosted" },
                { label: "Chocolate", value: "chocolate" },
              ],
              target: "material.layer",
              type: "segmented",
            },
          },
          id: "material",
          title: "Material",
        },
        {
          controls: {
            intensity: {
              applicability: { mode: "always" },
              defaultValue: 0.5,
              label: "Intensity",
              max: 1,
              min: 0,
              target: "lighting.intensity",
              type: "slider",
            },
          },
          id: "lighting",
          title: "Lighting",
        },
      ],
      title: "Controls",
    },
  },
});

const sectionInventory = [
  {
    entity: "Material",
    entityId: "material",
    groupingReason: "Layer, frosting, and gloss define one material.",
    id: "material",
    targets: ["material.layer", "material.frosting", "material.gloss"],
    title: "Material",
  },
  {
    entity: "Lighting",
    entityId: "lighting",
    groupingReason: "Lighting owns its independent intensity.",
    id: "lighting",
    targets: ["lighting.intensity"],
    title: "Lighting",
  },
] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];

const browserAcceptance = [
  acceptance("lighting.intensity", "lighting.intensity"),
  acceptance(
    "material.exportedAppearance",
    "material.frosting",
    "runtime",
  ),
  acceptance("material.frosting", "material.frosting"),
  acceptance("material.gloss", "material.gloss"),
  acceptance("material.layer", "material.layer"),
] as const;

function select(
  selection: { acceptanceIds?: readonly string[]; all?: boolean },
  acceptanceRows: readonly ToolcraftComponentAcceptance[] = browserAcceptance,
) {
  return createToolcraftFeatureVerificationSelection({
    acceptance: acceptanceRows,
    schema,
    sectionInventory,
    ...selection,
  });
}

describe("Toolcraft feature verification selection", () => {
  it("keeps a leaf control focused", () => {
    expect(select({ acceptanceIds: ["material.gloss"] }).acceptanceIds).toEqual([
      "material.gloss",
    ]);
  });

  it("expands a finite selector to semantic peers that derive branch cases", () => {
    const selection = select({ acceptanceIds: ["material.layer"] });

    expect(selection.acceptanceIds).toEqual([
      "material.frosting",
      "material.gloss",
      "material.layer",
    ]);
    expect(selection.testNames).toEqual([
      "browser: material.frosting",
      "browser: material.gloss",
      "browser: material.layer",
    ]);
  });

  it("selects every browser acceptance row only for explicit all mode", () => {
    expect(select({ all: true }).acceptanceIds).toEqual([
      "lighting.intensity",
      "material.exportedAppearance",
      "material.frosting",
      "material.gloss",
      "material.layer",
    ]);
  });

  it("reaches a fixed point without selecting unrelated or runtime rows", () => {
    const chainedSchema = defineToolcraft({
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                detail: {
                  applicability: { mode: "always" },
                  defaultValue: "fine",
                  label: "Detail",
                  options: [
                    { label: "Fine", value: "fine" },
                    { label: "Coarse", value: "coarse" },
                  ],
                  target: "shape.detail",
                  type: "segmented",
                },
                mode: {
                  applicability: { mode: "always" },
                  defaultValue: "solid",
                  label: "Mode",
                  options: [
                    { label: "Solid", value: "solid" },
                    { label: "Wire", value: "wire" },
                  ],
                  target: "shape.mode",
                  type: "segmented",
                },
                width: {
                  applicability: { mode: "always" },
                  defaultValue: 10,
                  label: "Width",
                  max: 20,
                  min: 1,
                  target: "shape.width",
                  type: "slider",
                },
              },
              id: "shape",
              title: "Shape",
            },
          ],
          title: "Controls",
        },
      },
    });
    const chainedInventory = [
      {
        entity: "Shape",
        entityId: "shape",
        groupingReason: "Shape mode, detail, and width define one shape.",
        id: "shape",
        targets: ["shape.mode", "shape.detail", "shape.width"],
        title: "Shape",
      },
    ] as const;
    const selection = createToolcraftFeatureVerificationSelection({
      acceptance: [
        acceptance("shape.detail", "shape.detail"),
        acceptance("shape.mode", "shape.mode"),
        acceptance("shape.width", "shape.width"),
        acceptance("shape.export", "shape.width", "runtime"),
      ],
      acceptanceIds: ["shape.mode"],
      schema: chainedSchema,
      sectionInventory: chainedInventory,
    });

    expect(selection.acceptanceIds).toEqual([
      "shape.detail",
      "shape.mode",
      "shape.width",
    ]);
  });

  it("fails closed for invalid seed and acceptance boundaries", () => {
    expect(() => select({})).toThrow(/acceptance ids or all mode/iu);
    expect(() =>
      select({ acceptanceIds: ["material.layer"], all: true }),
    ).toThrow(/not both/iu);
    expect(() => select({ acceptanceIds: ["missing"] })).toThrow(
      /unknown browser acceptance id.*missing/iu,
    );
    expect(() =>
      select(
        { acceptanceIds: ["material.layer"] },
        [
          ...browserAcceptance,
          acceptance("material.layer", "material.layer"),
        ],
      ),
    ).toThrow(/duplicate browser acceptance id.*material\.layer/iu);
    expect(() =>
      select(
        { acceptanceIds: ["material.nonBrowser"] },
        [
          ...browserAcceptance,
          {
            ...acceptance("material.nonBrowser", "material.gloss"),
            browser: false,
            browserTestName: "",
          },
        ],
      ),
    ).toThrow(/unknown browser acceptance id.*material\.nonBrowser/iu);
  });

  it("rejects duplicate seeds and returns deeply frozen deterministic output", () => {
    expect(() =>
      select({ acceptanceIds: ["material.gloss", "material.gloss"] }),
    ).toThrow(/duplicate acceptance id.*material\.gloss/iu);

    const selection = select({
      acceptanceIds: ["material.layer", "lighting.intensity"],
    });
    expect(selection.acceptanceIds).toEqual([
      "lighting.intensity",
      "material.frosting",
      "material.gloss",
      "material.layer",
    ]);
    expect(Object.isFrozen(selection)).toBe(true);
    expect(Object.isFrozen(selection.acceptanceIds)).toBe(true);
    expect(Object.isFrozen(selection.testNames)).toBe(true);
  });
});
