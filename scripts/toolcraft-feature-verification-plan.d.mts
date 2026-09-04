export const TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION: 1;

export type ToolcraftFeatureVerificationPlan = Readonly<{
  acceptanceIds: readonly string[];
  testNames: readonly string[];
  version: 1;
}>;

export type ToolcraftFeatureVerificationPlanValidation = Readonly<{
  errors: readonly string[];
  plan?: ToolcraftFeatureVerificationPlan;
}>;

export function validateToolcraftFeatureVerificationPlan(
  value: unknown,
): ToolcraftFeatureVerificationPlanValidation;

export function parseToolcraftFeatureVerificationPlanOutput(
  output: unknown,
): ToolcraftFeatureVerificationPlan;
