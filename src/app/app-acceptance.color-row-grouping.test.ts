import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { getToolcraftControlSectionInvariantErrors } from "./acceptance/control-layout";

function makeMixedColorSchema(includeSemanticGroups: boolean) {
  const withSemanticGroup = (
    semanticGroup: string,
  ): { semanticGroup: string } | Record<string, never> =>
    includeSemanticGroups ? { semanticGroup } : {};

  return defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              trackEnabled: {
                defaultValue: true,
                label: "Track",
                target: "track.enabled",
                type: "switch",
              },
              trackColor: {
                ...withSemanticGroup("track-line"),
                defaultValue: { hex: "#F1F1F1" },
                label: "Track color",
                target: "track.color",
                type: "color",
              },
              lowerColor: {
                ...withSemanticGroup("track-range"),
                defaultValue: { hex: "#7A9CBD" },
                label: "Lower",
                target: "track.lower",
                type: "color",
              },
              upperColor: {
                ...withSemanticGroup("track-range"),
                defaultValue: { hex: "#52AAFF" },
                label: "Upper",
                target: "track.upper",
                type: "color",
              },
            },
            id: "track-appearance",
            title: "Track Appearance",
          },
        ],
        title: "Controls",
      },
    },
  });
}

function makeColorOnlySchema() {
  return defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              trackColor: {
                defaultValue: { hex: "#F1F1F1" },
                label: "Track",
                target: "track.color",
                type: "color",
              },
              lowerColor: {
                defaultValue: { hex: "#7A9CBD" },
                label: "Lower",
                target: "track.lower",
                type: "color",
              },
              upperColor: {
                defaultValue: { hex: "#52AAFF" },
                label: "Upper",
                target: "track.upper",
                type: "color",
              },
            },
            id: "track-palette",
            title: "Track Palette",
          },
        ],
        title: "Controls",
      },
    },
  });
}

describe("starter acceptance semantic color rows", () => {
  it("rejects ambiguous plain colors in a mixed section", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeMixedColorSchema(false)),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must declare semanticGroup for every plain Color",
        ),
      ]),
    );
  });

  it("accepts explicit color banks in a mixed section", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeMixedColorSchema(true)),
    ).toEqual([]);
  });

  it("keeps a color-only section as one implicit bank", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeColorOnlySchema()),
    ).toEqual([]);
  });
});
