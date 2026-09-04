import type {
  ResolvedToolcraftAppSchema,
  ToolcraftArtifactExportActionRole,
} from "@/toolcraft/runtime";
import { isToolcraftArtifactExportAction } from "@/toolcraft/runtime";

import { getControlActions } from "./actions";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftExportArtifactCoverage,
} from "./types";

const requiredCoverageByRole = {
  "export-image": "all-required-image-export-behavior",
  "export-svg": "all-required-svg-export-behavior",
  "export-video": "all-required-video-export-behavior",
} as const satisfies Record<
  ToolcraftArtifactExportActionRole,
  ToolcraftExportArtifactCoverage
>;

function getCoverageValues(
  entry: ToolcraftComponentAcceptance,
): readonly ToolcraftExportArtifactCoverage[] {
  if (!entry.exportArtifactCoverage) return [];
  return typeof entry.exportArtifactCoverage === "string"
    ? [entry.exportArtifactCoverage]
    : entry.exportArtifactCoverage;
}

function collectArtifactExportActions(schema: ResolvedToolcraftAppSchema) {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).flatMap((control) =>
      control.type !== "panelActions" || !control.target
        ? []
        : getControlActions(control)
            .filter(isToolcraftArtifactExportAction)
            .map((action) => ({
              requiredCoverage: requiredCoverageByRole[action.role],
              role: action.role,
              target: control.target,
              value: action.value,
            })),
    ),
  );
}

function getMisplacedArtifactExportActionErrors(
  schema: ResolvedToolcraftAppSchema,
): string[] {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).flatMap((control) =>
      control.type === "panelActions"
        ? []
        : getControlActions(control)
            .filter(isToolcraftArtifactExportAction)
            .map(
              (action) =>
                `Typed ${action.role} action "${action.value}" must be declared in sticky panelActions.`,
            ),
    ),
  );
}

export function getToolcraftExportArtifactCoverageErrors({
  acceptance,
  schema,
}: Readonly<{
  acceptance: readonly ToolcraftComponentAcceptance[];
  schema: ResolvedToolcraftAppSchema;
}>): string[] {
  const errors = getMisplacedArtifactExportActionErrors(schema);
  const exportActions = collectArtifactExportActions(schema);

  for (const entry of acceptance) {
    const coverage = getCoverageValues(entry);
    if (coverage.length === 0) continue;
    if (entry.evidence !== "exported-bytes") {
      errors.push(
        `Acceptance "${entry.id}" declares exportArtifactCoverage but evidence is not "exported-bytes".`,
      );
    }
    if (!entry.automated || !entry.browser) {
      errors.push(
        `Acceptance "${entry.id}" exportArtifactCoverage requires automated and browser proof.`,
      );
    }
    for (const value of coverage) {
      const hasMatchingAction = exportActions.some(
        (action) =>
          action.target === entry.target &&
          action.requiredCoverage === value &&
          (entry.actionCoverage ?? []).includes(action.value),
      );
      if (!hasMatchingAction) {
        errors.push(
          `Acceptance "${entry.id}" declares ${value} without a matching typed export action in target/actionCoverage.`,
        );
      }
    }
  }

  for (const action of exportActions) {
    const hasCoverage = acceptance.some(
      (entry) =>
        entry.target === action.target &&
        entry.evidence === "exported-bytes" &&
        entry.automated &&
        entry.browser &&
        (entry.actionCoverage ?? []).includes(action.value) &&
        getCoverageValues(entry).includes(action.requiredCoverage),
    );
    if (!hasCoverage) {
      errors.push(
        `Typed ${action.role} action "${action.value}" on "${action.target}" requires ${action.requiredCoverage} acceptance coverage.`,
      );
    }
  }

  return errors;
}
