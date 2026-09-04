import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftControlSchema,
} from "../schema/types";
import type {
  ToolcraftInitialState,
  ToolcraftState,
  ToolcraftTimelineKeyframeGroup,
  ToolcraftTimelineState,
} from "./types";
import { toolcraftCanvasZoomDefault } from "./canvas-zoom";
import {
  getToolcraftDefaultCanvasMode,
  normalizeToolcraftCanvasMode,
} from "./canvas-frame";
import { normalizeToolcraftCanvasModeForBackground } from "./canvas-background-state";
import {
  cloneToolcraftLayers,
  cloneToolcraftMediaAssets,
  createToolcraftDefaultMediaState,
  createToolcraftLayersFromMediaAssets,
} from "./media-defaults";
import { getMediaReadyTimelineState } from "./timeline-readiness";
import {
  cloneToolcraftJsonValue,
} from "./control-value-codecs";
import {
  createCanonicalToolcraftControlDefaults,
  getToolcraftValueControls,
  mergeCanonicalToolcraftInitialValues,
  normalizeToolcraftControlValue,
} from "./control-value-normalization";

function cloneTimelineKeyframeGroups(
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[],
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>,
): ToolcraftTimelineKeyframeGroup[] {
  return keyframeGroups.map((group) => ({
    ...group,
    keyframes: group.keyframes.map((keyframe) => {
      const control = controls.get(group.controlId);
      const normalized = control
        ? normalizeToolcraftControlValue(control, keyframe.value)
        : { accepted: true as const, value: cloneToolcraftJsonValue(keyframe.value) };

      if (!normalized.accepted) {
        throw new Error(
          `Invalid seeded keyframe ${keyframe.id} for ${group.controlId} (${control?.type}).`,
        );
      }

      return {
        ...keyframe,
        easing:
          keyframe.easing?.type === "bezier"
            ? {
                controlPoints: [...keyframe.easing.controlPoints],
                type: "bezier" as const,
              }
            : keyframe.easing,
        value: normalized.value,
      };
    }),
  }));
}

function createDefaultTimelineState({
  controls,
  defaultDurationSeconds,
  timeline,
}: {
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  defaultDurationSeconds: number;
  timeline?: Partial<ToolcraftTimelineState>;
}): ToolcraftTimelineState {
  return {
    currentTimeSeconds: 0,
    durationSeconds: defaultDurationSeconds,
    expanded: false,
    isLooping: true,
    isPlaying: true,
    selectedKeyframeId: null,
    ...timeline,
    keyframeGroups: cloneTimelineKeyframeGroups(
      timeline?.keyframeGroups ?? [],
      controls,
    ),
  };
}

export function createToolcraftState(
  schema: ResolvedToolcraftAppSchema,
  initialState: ToolcraftInitialState = {},
): ToolcraftState {
  const valueControls = getToolcraftValueControls(schema);
  const defaults = createCanonicalToolcraftControlDefaults(valueControls);
  const values = mergeCanonicalToolcraftInitialValues({
    controls: valueControls,
    defaults,
    initialValues: initialState.values,
  });
  const defaultMediaState = createToolcraftDefaultMediaState(schema);
  const hasInitialMediaAssets = Object.hasOwn(initialState, "mediaAssets");
  const mediaAssets = hasInitialMediaAssets
    ? cloneToolcraftMediaAssets(initialState.mediaAssets ?? [])
    : cloneToolcraftMediaAssets(defaultMediaState.mediaAssets);
  const layers =
    initialState.layers ??
    (hasInitialMediaAssets
      ? createToolcraftLayersFromMediaAssets(mediaAssets, defaultMediaState.layers)
      : cloneToolcraftLayers(defaultMediaState.layers));
  const selectedLayerId =
    initialState.selectedLayerId ??
    (hasInitialMediaAssets ? (layers[0]?.id ?? null) : defaultMediaState.selectedLayerId);
  const timeline = getMediaReadyTimelineState(
    schema,
    createDefaultTimelineState({
      controls: valueControls,
      defaultDurationSeconds: schema.panels.timeline?.defaultDurationSeconds ?? 8,
      timeline: initialState.timeline,
    }),
    mediaAssets,
  );

  const validSectionIds = new Set(
    schema.panels.controls?.sections.map((section) => section.id) ?? [],
  );
  const collapsedSections = Object.fromEntries(
    Object.entries(initialState.panels?.controls?.collapsedSections ?? {}).filter(
      ([sectionId, collapsed]) => validSectionIds.has(sectionId) && collapsed === true,
    ),
  );
  const panels: ToolcraftState["panels"] = {
    controls: { collapsedSections: {}, offset: { x: 0, y: 0 } },
    layers: { offset: { x: 0, y: 0 } },
    timeline: { offset: { x: 0, y: 0 } },
    toolbar: { offset: { x: 0, y: 0 } },
  };
  const initialCanvas = {
    offset: { x: 0, y: 0 },
    size: schema.canvas.size,
    zoom: toolcraftCanvasZoomDefault,
    ...initialState.canvas,
    mode: normalizeToolcraftCanvasModeForBackground({
      mode: normalizeToolcraftCanvasMode(
        initialState.canvas?.mode ?? getToolcraftDefaultCanvasMode(schema.canvas),
      ),
      schema,
      values,
    }),
  };

  return {
    canvas: initialCanvas,
    defaults,
    history: {
      redo: [],
      undo: [],
    },
    layers,
    mediaAssets,
    panels: {
      controls: {
        ...panels.controls,
        ...initialState.panels?.controls,
        collapsedSections,
      },
      layers: { ...panels.layers, ...initialState.panels?.layers },
      timeline: { ...panels.timeline, ...initialState.panels?.timeline },
      toolbar: { ...panels.toolbar, ...initialState.panels?.toolbar },
    },
    schema,
    selectedLayerId,
    timeline,
    values,
  };
}
