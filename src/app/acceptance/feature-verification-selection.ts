import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import { getToolcraftControlApplicabilityCases } from "./control-applicability-cases";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
} from "./types";

export type ToolcraftFeatureVerificationSelection = Readonly<{
  acceptanceIds: readonly string[];
  testNames: readonly string[];
  version: 1;
}>;

type ToolcraftFeatureVerificationSelectionInput = Readonly<{
  acceptance: readonly ToolcraftComponentAcceptance[];
  acceptanceIds?: readonly string[];
  all?: boolean;
  schema: Pick<ResolvedToolcraftAppSchema, "panels">;
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
}>;

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function indexBrowserAcceptance(
  acceptance: readonly ToolcraftComponentAcceptance[],
): Map<string, ToolcraftComponentAcceptance> {
  const byId = new Map<string, ToolcraftComponentAcceptance>();

  for (const entry of acceptance) {
    if (!entry.browser || !entry.browserTestName.trim()) continue;
    if (byId.has(entry.id)) {
      throw new Error(
        `Toolcraft feature verification found duplicate browser acceptance id "${entry.id}".`,
      );
    }
    byId.set(entry.id, entry);
  }

  return byId;
}

function getSeedIds({
  acceptanceIds,
  all,
  browserAcceptance,
}: {
  acceptanceIds: readonly string[] | undefined;
  all: boolean | undefined;
  browserAcceptance: ReadonlyMap<string, ToolcraftComponentAcceptance>;
}): string[] {
  if (all && acceptanceIds !== undefined) {
    throw new Error(
      "Toolcraft feature verification accepts all mode or acceptance ids, not both.",
    );
  }
  if (all) return [...browserAcceptance.keys()];
  if (!acceptanceIds || acceptanceIds.length === 0) {
    throw new Error(
      "Toolcraft feature verification requires acceptance ids or all mode.",
    );
  }
  if (new Set(acceptanceIds).size !== acceptanceIds.length) {
    const duplicate = acceptanceIds.find(
      (id, index) => acceptanceIds.indexOf(id) !== index,
    );
    throw new Error(
      `Toolcraft feature verification received duplicate acceptance id "${duplicate}".`,
    );
  }
  for (const id of acceptanceIds) {
    if (!browserAcceptance.has(id)) {
      throw new Error(
        `Toolcraft feature verification received unknown browser acceptance id "${id}".`,
      );
    }
  }
  return [...acceptanceIds];
}

function indexDependentsBySelectorTarget({
  browserAcceptance,
  schema,
  sectionInventory,
}: {
  browserAcceptance: ReadonlyMap<string, ToolcraftComponentAcceptance>;
  schema: Pick<ResolvedToolcraftAppSchema, "panels">;
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
}): Map<string, Set<string>> {
  const dependents = new Map<string, Set<string>>();

  for (const entry of browserAcceptance.values()) {
    if (entry.kind !== "control" || !entry.target) continue;
    const selectorTargets = new Set(
      getToolcraftControlApplicabilityCases({
        schema,
        sectionInventory,
        target: entry.target,
      }).map(({ selectorTarget }) => selectorTarget),
    );
    for (const selectorTarget of selectorTargets) {
      const ids = dependents.get(selectorTarget) ?? new Set<string>();
      ids.add(entry.id);
      dependents.set(selectorTarget, ids);
    }
  }

  return dependents;
}

export function createToolcraftFeatureVerificationSelection(
  input: ToolcraftFeatureVerificationSelectionInput,
): ToolcraftFeatureVerificationSelection {
  const browserAcceptance = indexBrowserAcceptance(input.acceptance);
  if (browserAcceptance.size === 0) {
    throw new Error(
      "Toolcraft feature verification requires at least one browser acceptance row.",
    );
  }
  const selectedIds = new Set(
    getSeedIds({
      acceptanceIds: input.acceptanceIds,
      all: input.all,
      browserAcceptance,
    }),
  );
  const dependentsBySelectorTarget = indexDependentsBySelectorTarget({
    browserAcceptance,
    schema: input.schema,
    sectionInventory: input.sectionInventory,
  });
  const queue = [...selectedIds];

  for (let index = 0; index < queue.length; index += 1) {
    const selected = browserAcceptance.get(queue[index]!);
    if (selected?.kind !== "control" || !selected.target) continue;
    for (const dependentId of
      dependentsBySelectorTarget.get(selected.target) ?? []) {
      if (selectedIds.has(dependentId)) continue;
      selectedIds.add(dependentId);
      queue.push(dependentId);
    }
  }

  const acceptanceIds = Object.freeze([...selectedIds].sort(compareCodeUnits));
  const testNames = acceptanceIds.map(
    (id) => browserAcceptance.get(id)!.browserTestName,
  );
  if (new Set(testNames).size !== testNames.length) {
    throw new Error(
      "Toolcraft feature verification requires one unique browser test name per selected acceptance id.",
    );
  }

  return Object.freeze({
    acceptanceIds,
    testNames: Object.freeze([...testNames].sort(compareCodeUnits)),
    version: 1,
  });
}
