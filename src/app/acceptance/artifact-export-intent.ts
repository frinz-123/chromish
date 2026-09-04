import type { ToolcraftArtifactExportActionRole } from "@/toolcraft/runtime";

import type { ToolcraftArtifactExportIntent } from "./types";

export type ToolcraftArtifactExportDelivery = Readonly<{
  imageEnabled: boolean;
  svgEnabled: boolean;
  videoEnabled: boolean;
}>;

export type ToolcraftArtifactExportSchemaFacts = Readonly<{
  hasImageExportAction: boolean;
  hasImageExportSection: boolean;
  hasSvgExportAction: boolean;
  hasVideoExportAction: boolean;
  hasVideoExportSection: boolean;
}>;

export type ToolcraftArtifactExportIntentValidation = Readonly<{
  delivery: ToolcraftArtifactExportDelivery;
  errors: readonly string[];
}>;

export function resolveToolcraftArtifactExportIntent(
  intent: ToolcraftArtifactExportIntent,
): ToolcraftArtifactExportDelivery {
  return Object.freeze({
    imageEnabled: intent.image.mode !== "user-removed",
    svgEnabled: intent.svg.mode === "user-requested",
    videoEnabled: intent.video.mode === "user-requested",
  });
}

export function getToolcraftArtifactExportIntentEvidenceErrors(
  intent: ToolcraftArtifactExportIntent,
): readonly string[] {
  const errors: string[] = [];

  if (
    intent.svg.mode === "user-requested" &&
    intent.svg.evidence.trim() === ""
  ) {
    errors.push(
      "SVG export user-requested intent requires non-empty evidence.",
    );
  }

  if (
    intent.image.mode !== "toolcraft-default" &&
    intent.image.evidence.trim() === ""
  ) {
    errors.push(
      `Image export ${intent.image.mode} intent requires non-empty evidence.`,
    );
  }

  if (
    intent.video.mode === "user-requested" &&
    intent.video.evidence.trim() === ""
  ) {
    errors.push(
      "Video export user-requested intent requires non-empty evidence.",
    );
  }

  return errors;
}

type ToolcraftArtifactCorrespondenceBase = Readonly<{
  actionRole: ToolcraftArtifactExportActionRole;
  artifact: "Image" | "SVG" | "Video";
  enabled: boolean;
  hasAction: boolean;
  intentMode:
    | ToolcraftArtifactExportIntent["image"]["mode"]
    | ToolcraftArtifactExportIntent["svg"]["mode"]
    | ToolcraftArtifactExportIntent["video"]["mode"];
}>;

type ToolcraftArtifactCorrespondence = ToolcraftArtifactCorrespondenceBase &
  (
    | Readonly<{
        hasSection: boolean;
        section: Readonly<{
          article: "a" | "an";
          title: "Image Export" | "Video Export";
        }>;
      }>
    | Readonly<{ hasSection?: never; section?: never }>
  );

function getToolcraftArtifactCorrespondenceErrors({
  actionRole,
  artifact,
  enabled,
  hasAction,
  hasSection,
  intentMode,
  section,
}: ToolcraftArtifactCorrespondence): string[] {
  const errors: string[] = [];
  const requirement = enabled ? "requires" : "must not have";

  if (hasAction !== enabled) {
    errors.push(
      `${artifact} export intent "${intentMode}" ${requirement} an ${actionRole} panel action.`,
    );
  }

  if (section && hasSection !== enabled) {
    errors.push(
      `${artifact} export intent "${intentMode}" ${requirement} ${section.article} "${section.title}" section.`,
    );
  }

  return errors;
}

export function validateToolcraftArtifactExportIntentCorrespondence({
  hasImageExportAction,
  hasImageExportSection,
  hasSvgExportAction,
  hasVideoExportAction,
  hasVideoExportSection,
  intent,
}: ToolcraftArtifactExportSchemaFacts &
  Readonly<{
    intent: ToolcraftArtifactExportIntent;
  }>): ToolcraftArtifactExportIntentValidation {
  const delivery = resolveToolcraftArtifactExportIntent(intent);
  const errors = [
    ...getToolcraftArtifactExportIntentEvidenceErrors(intent),
    ...getToolcraftArtifactCorrespondenceErrors({
      actionRole: "export-image",
      artifact: "Image",
      enabled: delivery.imageEnabled,
      hasAction: hasImageExportAction,
      hasSection: hasImageExportSection,
      intentMode: intent.image.mode,
      section: { article: "an", title: "Image Export" },
    }),
    ...getToolcraftArtifactCorrespondenceErrors({
      actionRole: "export-svg",
      artifact: "SVG",
      enabled: delivery.svgEnabled,
      hasAction: hasSvgExportAction,
      intentMode: intent.svg.mode,
    }),
    ...getToolcraftArtifactCorrespondenceErrors({
      actionRole: "export-video",
      artifact: "Video",
      enabled: delivery.videoEnabled,
      hasAction: hasVideoExportAction,
      hasSection: hasVideoExportSection,
      intentMode: intent.video.mode,
      section: { article: "a", title: "Video Export" },
    }),
  ];

  return { delivery, errors };
}
