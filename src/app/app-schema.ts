import { defineToolcraft } from "@/toolcraft/runtime";

import { appIdentity } from "./app-identity";
import { chromishControlSections } from "./chromish/control-sections";
import { defaultBackgroundDataUrl } from "./chromish/default-background";

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
  media: {
    defaultAssets: [{
      assetKind: "image",
      dataUrl: defaultBackgroundDataUrl,
      fileName: "photo-1638742385167-96fc60e12f59.png",
      id: "chromish-default-background",
      mimeType: "image/png",
      sourceTarget: "media.backgroundImage",
    }],
  },
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
    key: "toolcraft:chromish:state:v3",
    storage: "localStorage",
    version: 3,
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
