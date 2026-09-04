import type {
  ToolcraftComponentAcceptance,
  ToolcraftInteractionOwnershipEntry,
  ToolcraftProductReadiness,
} from "./types";

type ToolcraftSelectionScopeValidationInput = {
  acceptance: readonly ToolcraftComponentAcceptance[];
  layersEnabled: boolean;
  productReadiness: ToolcraftProductReadiness;
};

function isPropertyOwner(
  entry: ToolcraftInteractionOwnershipEntry,
): boolean {
  return (
    entry.capability === "precise-value-entry" ||
    entry.capability === "property-edit"
  );
}

function isSelectionOwner(
  entry: ToolcraftInteractionOwnershipEntry | undefined,
): boolean {
  return (
    entry?.capability === "spatial-selection" ||
    entry?.capability === "structured-selection"
  );
}

export function getToolcraftSelectionScopeErrors({
  acceptance,
  layersEnabled,
  productReadiness,
}: ToolcraftSelectionScopeValidationInput): string[] {
  const errors: string[] = [];
  const inventory =
    productReadiness.mode === "product"
      ? (productReadiness.interactionOwnership ?? [])
      : [];

  const ownershipById = new Map(
    inventory.map((entry) => [entry.id, entry]),
  );

  for (const owner of inventory) {
    const selectionScope = owner.selectionScope;

    if (!isPropertyOwner(owner)) {
      if (selectionScope !== undefined) {
        errors.push(
          `${owner.id} may not declare selectionScope because ${owner.capability} is not a property operation.`,
        );
      }
      continue;
    }

    if (
      !selectionScope ||
      (selectionScope.mode !== "global" &&
        selectionScope.mode !== "selected-entity")
    ) {
      errors.push(
        `${owner.id} must declare selectionScope as global or selected-entity.`,
      );
      continue;
    }

    if (selectionScope.mode === "global") {
      if ("selectionInteractionId" in selectionScope) {
        errors.push(
          `${owner.id} global selectionScope may not declare selectionInteractionId.`,
        );
      }
      continue;
    }

    if (!selectionScope.selectionInteractionId.trim()) {
      errors.push(
        `${owner.id} selected-entity scope must reference a non-empty selectionInteractionId.`,
      );
      continue;
    }

    const selectionOwner = ownershipById.get(
      selectionScope.selectionInteractionId,
    );
    if (!isSelectionOwner(selectionOwner)) {
      errors.push(
        `${owner.id} selectionInteractionId ${selectionScope.selectionInteractionId} must reference spatial-selection or structured-selection ownership.`,
      );
    }

    const propertyAcceptance = acceptance.find(
      (entry) =>
        entry.interactionId === owner.id && entry.target === owner.target,
    );
    if (
      propertyAcceptance?.selectionScopeCoverage !== "two-entity-isolation"
    ) {
      errors.push(
        `${owner.id} selected-entity property must declare selectionScopeCoverage "two-entity-isolation" on its acceptance row.`,
      );
    }
  }

  for (const entry of acceptance) {
    const owner = entry.interactionId
      ? ownershipById.get(entry.interactionId)
      : undefined;
    const selectedProperty =
      owner &&
      isPropertyOwner(owner) &&
      owner.selectionScope?.mode === "selected-entity";
    const selectedLayerControl =
      layersEnabled && entry.target?.startsWith("selectedLayer.");
    const layerOwnedProperty =
      layersEnabled && entry.layerCoverage === "selected-layer-controls";
    const requiresIsolation =
      selectedProperty || selectedLayerControl || layerOwnedProperty;

    if (
      requiresIsolation &&
      entry.selectionScopeCoverage !== "two-entity-isolation"
    ) {
      errors.push(
        `${entry.id} must declare selectionScopeCoverage "two-entity-isolation" proving edits stay on the selected entity.`,
      );
    }

    if (
      entry.selectionScopeCoverage === "two-entity-isolation" &&
      !requiresIsolation
    ) {
      errors.push(
        `${entry.id} declares two-entity isolation without selected-entity ownership or a selectedLayer.* target.`,
      );
    }

    if (
      selectedLayerControl &&
      entry.layerCoverage !== "selected-layer-controls"
    ) {
      errors.push(
        `${entry.id} targets selectedLayer.* and must declare layerCoverage "selected-layer-controls" together with two-entity isolation.`,
      );
    }
  }

  return errors;
}
