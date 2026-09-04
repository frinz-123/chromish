import {
  getToolcraftRuntimeSetupBackgroundControls,
  toolcraftOutputBackgroundToggleTarget,
} from "../schema/runtime-setup-background";
import type { ResolvedToolcraftAppSchema } from "../schema/types";
import type { ToolcraftState } from "./types";

export function hasToolcraftRuntimeSetupBackground(
  schema: ResolvedToolcraftAppSchema,
): boolean {
  return getToolcraftRuntimeSetupBackgroundControls(schema) !== undefined;
}

export function isToolcraftRuntimeBackgroundEnabled({
  schema,
  values,
}: {
  schema: ResolvedToolcraftAppSchema;
  values: Readonly<Record<string, unknown>>;
}): boolean {
  return (
    !hasToolcraftRuntimeSetupBackground(schema) ||
    values[toolcraftOutputBackgroundToggleTarget] !== false
  );
}

export function normalizeToolcraftCanvasModeForBackground({
  mode,
  schema,
  values,
}: {
  mode: ToolcraftState["canvas"]["mode"];
  schema: ResolvedToolcraftAppSchema;
  values: Readonly<Record<string, unknown>>;
}): ToolcraftState["canvas"]["mode"] {
  return mode === "infinite" &&
    !isToolcraftRuntimeBackgroundEnabled({ schema, values })
    ? "finite"
    : mode;
}

export function getToolcraftInfiniteCanvasBackgroundColor(
  state: ToolcraftState,
): string | undefined {
  if (
    state.canvas.mode !== "infinite" ||
    !isToolcraftRuntimeBackgroundEnabled(state)
  ) {
    return undefined;
  }

  return getToolcraftRuntimeBackgroundColor(state);
}

export function getToolcraftRuntimeBackgroundColor(
  state: ToolcraftState,
): string | undefined {
  const background = getToolcraftRuntimeSetupBackgroundControls(state.schema);
  const value = background
    ? state.values[background.color.target] ?? background.color.defaultValue
    : undefined;

  return typeof value === "string" ? value : undefined;
}
