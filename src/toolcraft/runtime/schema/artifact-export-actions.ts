import type {
  ResolvedToolcraftAppSchema,
  ToolcraftActionRole,
  ToolcraftActionSchema,
} from "./types";

export const TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES = [
  "export-image",
  "export-svg",
  "export-video",
] as const satisfies readonly ToolcraftActionRole[];

export type ToolcraftArtifactExportActionRole =
  (typeof TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES)[number];

const artifactExportActionRoleSet = new Set<ToolcraftActionRole>(
  TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES,
);

export function isToolcraftArtifactExportActionRole(
  role: ToolcraftActionRole | undefined,
): role is ToolcraftArtifactExportActionRole {
  return role !== undefined && artifactExportActionRoleSet.has(role);
}

export function isToolcraftArtifactExportAction(
  action: ToolcraftActionSchema | string,
): action is ToolcraftActionSchema & {
  role: ToolcraftArtifactExportActionRole;
} {
  return (
    typeof action !== "string" &&
    isToolcraftArtifactExportActionRole(action.role)
  );
}

export function getToolcraftArtifactExportActions(
  schema: ResolvedToolcraftAppSchema,
): readonly (ToolcraftActionSchema & {
  role: ToolcraftArtifactExportActionRole;
})[] {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).flatMap((control) =>
      control.type === "panelActions"
        ? (control.actions ?? []).filter(isToolcraftArtifactExportAction)
        : [],
    ),
  );
}
