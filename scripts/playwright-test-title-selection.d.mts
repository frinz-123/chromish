export type ToolcraftDeliveryCatalogAcceptance = Readonly<{
  acceptanceId: string;
  contractHash: string;
  domainId: string;
  file: string;
  testName: string;
}>;

export type ToolcraftDeliveryCatalogPerformance = Readonly<{
  passIds: readonly string[];
  pathId: string;
  testName: string;
}>;

export type ToolcraftDeliveryCatalog = Readonly<{
  acceptance: readonly ToolcraftDeliveryCatalogAcceptance[];
  performance: readonly ToolcraftDeliveryCatalogPerformance[];
  version: 2;
}>;

export type ToolcraftDeliveryCatalogValidation = Readonly<{
  catalog?: ToolcraftDeliveryCatalog;
  errors: readonly string[];
}>;

export function validateToolcraftDeliveryCatalog(
  value: unknown,
): ToolcraftDeliveryCatalogValidation;

export function createToolcraftDeliveryCatalog(
  input: Readonly<Record<string, unknown>>,
): ToolcraftDeliveryCatalog;

export function collectToolcraftPlaywrightTestTitles(
  report: unknown,
): readonly Readonly<{ file: string; testName: string }>[];

export function resolveToolcraftPlaywrightTestTitles(
  availableTitles: readonly unknown[],
  requestedTitles: readonly string[],
): readonly unknown[];

export function getToolcraftPlaywrightExactGrepPattern(
  selections: readonly unknown[],
): string;
