import { describe, expect, it } from "vitest";

import type {
  ToolcraftComponentAcceptance,
  ToolcraftInteractionOwnershipEntry,
  ToolcraftProductReadiness,
} from "./types";
import { getToolcraftSelectionScopeErrors } from "./selection-scope";

const selectionAcceptance: ToolcraftComponentAcceptance = {
  automated: true,
  automatedTestName: "selection updates the active shape",
  browser: true,
  browserTestName: "browser: selection updates the active shape",
  componentType: "canvas selection",
  evidence: "command-side-effect",
  expectedObservable: "Selecting either shape updates the active shape.",
  fixture: "two separated visible shapes",
  id: "shape.selection",
  interactionId: "shape-selection",
  kind: "runtime",
  target: "selection.activeShape",
  userAction: "Select each shape.",
};

const fillAcceptance: ToolcraftComponentAcceptance = {
  automated: true,
  automatedTestName: "selected fill changes only the active shape",
  browser: true,
  browserTestName: "browser: selected fill changes only the active shape",
  componentType: "color",
  evidence: "product-output",
  expectedObservable: "Only the selected shape changes fill.",
  fixture: "two separated visible shapes",
  id: "shape.selected-fill",
  interactionId: "shape-fill",
  kind: "control",
  selectionScopeCoverage: "two-entity-isolation",
  target: "selectedShape.fill",
  userAction: "Select each shape and edit Fill.",
};

function readiness(
  interactionOwnership: readonly ToolcraftInteractionOwnershipEntry[],
): ToolcraftProductReadiness {
  return {
    exportIntent: {
      image: { mode: "toolcraft-default" },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    interactionOwnership,
    mode: "product",
    productName: "Selection fixture",
    productSummary: "Two shapes with selected-entity property editing.",
    requestedBehavior: "Select either shape and edit only that shape.",
    viewInteraction: {
      mode: "non-spatial",
      reason: "The fixture uses a fixed two-dimensional editing view.",
    },
  };
}

const validOwnership = [
  {
    alternative: {
      reason: "A panel selector would separate selection from visible shapes.",
      surface: "panel",
    },
    capability: "spatial-selection",
    evidence: {
      detail: "The user requested direct selection on the visible canvas.",
      source: "user-request",
    },
    id: "shape-selection",
    reason: "Canvas selection provides immediate spatial target feedback.",
    surface: "canvas",
    target: "selection.activeShape",
  },
  {
    alternative: {
      reason: "A canvas color editor would duplicate panel property editing.",
      surface: "canvas",
    },
    capability: "property-edit",
    evidence: {
      detail: "The user requested built-in panel controls for shape properties.",
      source: "user-request",
    },
    id: "shape-fill",
    reason: "The panel keeps exact color entry accessible and discoverable.",
    selectionScope: {
      mode: "selected-entity",
      selectionInteractionId: "shape-selection",
    },
    surface: "panel",
    target: "selectedShape.fill",
  },
] as const;

describe("Toolcraft selection scope", () => {
  it("accepts a linked two-entity selected-property proof", () => {
    expect(
      getToolcraftSelectionScopeErrors({
        acceptance: [selectionAcceptance, fillAcceptance],
        layersEnabled: false,
        productReadiness: readiness(validOwnership),
      }),
    ).toEqual([]);
  });

  it("allows an explicitly global property without isolation coverage", () => {
    const globalOwnership = [
      {
        ...validOwnership[1],
        id: "scene-background",
        selectionScope: { mode: "global" },
        target: "scene.background",
      },
    ] as const;
    const globalAcceptance = {
      ...fillAcceptance,
      id: "scene.background",
      interactionId: "scene-background",
      selectionScopeCoverage: undefined,
      target: "scene.background",
    };

    expect(
      getToolcraftSelectionScopeErrors({
        acceptance: [globalAcceptance],
        layersEnabled: false,
        productReadiness: readiness(globalOwnership),
      }),
    ).toEqual([]);
  });

  it("rejects omitted scope, invalid selection links, and missing isolation", () => {
    const malformed = [
      {
        ...validOwnership[1],
        selectionScope: undefined,
      },
      {
        ...validOwnership[1],
        id: "wrong-link",
        selectionScope: {
          mode: "selected-entity",
          selectionInteractionId: "shape-fill",
        },
      },
    ] as never;

    expect(
      getToolcraftSelectionScopeErrors({
        acceptance: [
          selectionAcceptance,
          { ...fillAcceptance, selectionScopeCoverage: undefined },
        ],
        layersEnabled: false,
        productReadiness: readiness(malformed),
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must declare selectionScope"),
        expect.stringContaining(
          "must reference spatial-selection or structured-selection",
        ),
        expect.stringContaining("two-entity-isolation"),
      ]),
    );
  });

  it("rejects meaningless isolation metadata", () => {
    expect(
      getToolcraftSelectionScopeErrors({
        acceptance: [
          {
            ...fillAcceptance,
            interactionId: "scene-background",
            target: "scene.background",
          },
        ],
        layersEnabled: false,
        productReadiness: readiness([
          {
            ...validOwnership[1],
            id: "scene-background",
            selectionScope: { mode: "global" },
            target: "scene.background",
          },
        ]),
      }),
    ).toEqual([
      expect.stringContaining(
        "without selected-entity ownership or a selectedLayer.* target",
      ),
    ]);
  });
});
