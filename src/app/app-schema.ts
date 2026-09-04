import { defineToolcraft } from "@/toolcraft/runtime";

import { appIdentity } from "./app-identity";
import { chromishControlSections } from "./chromish/control-sections";

export const appSchema = defineToolcraft({
  canvas: {
    draggable: true,
    enabled: true,
    renderScale: { step: 0.25 },
    size: { height: 600, unit: "px", width: 960 },
    sizing: { mode: "editable-output" },
    upload: true,
  },
  export: { png: { background: "include" } },
  identity: appIdentity,
  panels: {
    controls: {
      sections: chromishControlSections,
      title: "Controls",
    },
    timeline: {
      defaultDurationSeconds: 7,
      enabled: true,
      mode: "playback",
    },
  },
  persistence: {
    include: ["canvas", "media", "panels", "timeline", "values"],
    key: "toolcraft:chromish:state:v1",
    storage: "localStorage",
    version: 1,
  },
  settingsTransfer: {
    enabled: "auto",
    fileName: "chromish-settings.json",
  },
  toolbar: {
    history: true,
    radar: true,
    theme: true,
    zoom: true,
  },
});
