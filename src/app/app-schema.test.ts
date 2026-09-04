import { describe, expect, it } from "vitest";

import {
  appAcceptance,
  validateProductAcceptanceCoverage,
} from "./app-acceptance";
import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";

describe("Chromish appSchema", () => {
  it("publishes the Toolcraft product shell and controls", () => {
    expect(appSchema.canvas.draggable).toBe(true);
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
    expect(appSchema.canvas.upload).toBe(true);
    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");
    expect(appSchema.panels.controls?.sections[0]?.controls.settingsTransfer).toMatchObject({
      target: "runtime.settingsTransfer",
      type: "settingsTransfer",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasAspectRatio).toMatchObject({
      target: "canvas.aspectRatio",
      type: "aspectRatio",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasWidth).toMatchObject({
      target: "canvas.size.width",
      type: "text",
    });
    expect(appSchema.panels.controls?.sections[0]?.controls.canvasHeight).toMatchObject({
      target: "canvas.size.height",
      type: "text",
    });
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.panels.timeline).toMatchObject({
      defaultDurationSeconds: 7,
      enabled: true,
      mode: "playback",
    });
    expect(appSchema.toolbar).toEqual({
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    });
    expect(appSchema.assembly.components).toEqual([
      "canvas",
      "controlsPanel",
      "timelinePanel",
      "toolbar",
    ]);
    expect(appSchema.assembly.capabilities).toEqual(
      expect.arrayContaining([
        "canvas.draggable",
        "canvas.editableSize",
        "canvas.upload",
        "controls.defaults",
        "controls.panel",
        "timeline.playback",
        "toolbar.history",
        "toolbar.radar",
        "toolbar.theme",
        "toolbar.zoom",
      ]),
    );
    expect(appSchema.assembly.capabilities).not.toContain("timeline.keyframes");
    expect(appSchema.assembly.commands).toEqual(
      expect.arrayContaining([
        "canvas.center",
        "canvas.setSize",
        "canvas.setViewport",
        "canvas.zoomIn",
        "controls.reset",
        "controls.setValue",
        "history.undo",
        "media.delete",
        "media.import",
      ]),
    );
    expect(appSchema.assembly.commands).toContain("timeline.setCurrentTime");
  });

  it("keeps the generated Setup section first and renders Chromish sections", () => {
    const productSections =
      appSchema.panels.controls?.sections.filter((section) => section.title !== "Setup") ??
      [];

    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");
    expect(productSections.map((section) => section.title)).toEqual([
      "SVG",
      "Geometry",
      "Material",
      "Motion",
      "Environment Image",
      "Image Export",
      "Video Export",
      "Export",
    ]);
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.panels.timeline?.enabled).toBe(true);
    expect(appSchema.media.defaultAssets).toEqual([]);
    const materialControl = appSchema.panels.controls?.sections
      .flatMap((section) => Object.values(section.controls))
      .find((control) => control.target === "material.type");
    expect(materialControl?.defaultValue).toBe("chrome");
  });

  it("enables playback without exposing keyframe editing", () => {
    expect(appSchema.assembly.capabilities).toContain("timeline.playback");
    expect(appSchema.assembly.capabilities).not.toContain("timeline.keyframes");
    expect(appSchema.assembly.commands).not.toContain("timeline.toggleControlKeyframes");
    expect(appSchema.assembly.commands).not.toContain("timeline.moveKeyframe");
  });

  it("models Chromish workload and functional performance paths", () => {
    expect(appPerformance.scenarios.length).toBeGreaterThan(0);
    expect(appPerformance.workloadEnvelope.dimensions.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "svg-elements",
        "detail-level",
        "preview-scale",
        "mesh-triangles",
        "image-export-long-edge",
        "video-export-long-edge",
      ]),
    );
  });

  it("declares production reload coverage for the product schema", () => {
    expect(appSchema.persistence.storage).toBe("localStorage");
    if (appSchema.persistence.storage !== "localStorage") {
      throw new Error("Chromish must persist user settings in localStorage.");
    }
    expect(appSchema.persistence).toMatchObject({
      key: "toolcraft:chromish:state:v1",
      version: 3,
    });
    expect(appSchema.persistence.include).toContain("canvas");
    expect(
      appAcceptance.find((entry) => entry.id === "persistence.reload"),
    ).toMatchObject({
      automated: true,
      browser: true,
      evidence: "persistence-state",
      kind: "runtime",
      persistenceCoverage: "reload",
      persistenceSlices: appSchema.persistence.include,
      target: "canvas.size.width",
    });
    expect(validateProductAcceptanceCoverage()).toEqual([]);
  });
});
