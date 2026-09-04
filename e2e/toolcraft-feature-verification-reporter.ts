import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
} from "@playwright/test/reporter";

import {
  createToolcraftFeatureVerificationSelection,
  appAcceptance,
  appControlSectionInventory,
} from "../src/app/app-acceptance";
import { appSchema } from "../src/app/app-schema";

export const TOOLCRAFT_FEATURE_VERIFICATION_REQUEST_ENV =
  "TOOLCRAFT_FEATURE_VERIFICATION_REQUEST";

type ToolcraftFeatureVerificationRequest =
  | Readonly<{
      acceptanceIds: readonly string[];
      mode: "ids";
      version: 1;
    }>
  | Readonly<{
      mode: "all";
      version: 1;
    }>;

type ToolcraftFeatureVerificationReporterState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ error: unknown; kind: "preparation-failed" }>
  | Readonly<{
      kind: "ready";
      plan: ReturnType<typeof createToolcraftFeatureVerificationSelection>;
    }>;

type ToolcraftFeatureVerificationReporterOptions = Readonly<{
  createSelection?: typeof createToolcraftFeatureVerificationSelection;
  requestSource?: string;
  writeError?: (source: string) => void;
  writeOutput?: (source: string) => void;
}>;

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): void {
  const expectedSet = new Set(expected);
  const unknown = Reflect.ownKeys(value)
    .filter((key) => typeof key !== "string" || !expectedSet.has(key))
    .map(String)
    .sort(compareCodeUnits);
  const missing = expected.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      [
        ...(unknown.length > 0
          ? [`unknown fields: ${unknown.join(", ")}`]
          : []),
        ...(missing.length > 0
          ? [`missing fields: ${missing.join(", ")}`]
          : []),
      ].join("; "),
    );
  }
}

export function parseToolcraftFeatureVerificationRequest(
  source: string | undefined,
): ToolcraftFeatureVerificationRequest {
  if (!source) {
    throw new Error(
      `${TOOLCRAFT_FEATURE_VERIFICATION_REQUEST_ENV} must contain one versioned JSON request.`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `${TOOLCRAFT_FEATURE_VERIFICATION_REQUEST_ENV} must contain valid JSON.`,
      { cause: error },
    );
  }
  if (!isPlainObject(value)) {
    throw new Error(
      `${TOOLCRAFT_FEATURE_VERIFICATION_REQUEST_ENV} must contain a plain object.`,
    );
  }
  if (value.mode === "all") {
    requireExactKeys(value, ["mode", "version"]);
    if (value.version !== 1) {
      throw new Error("Toolcraft feature verification request.version must be 1.");
    }
    return Object.freeze({ mode: "all", version: 1 });
  }
  if (value.mode !== "ids") {
    throw new Error(
      "Toolcraft feature verification request.mode must be ids or all.",
    );
  }
  requireExactKeys(value, ["acceptanceIds", "mode", "version"]);
  if (value.version !== 1) {
    throw new Error("Toolcraft feature verification request.version must be 1.");
  }
  if (
    !Array.isArray(value.acceptanceIds) ||
    value.acceptanceIds.length === 0 ||
    !value.acceptanceIds.every(
      (id) => typeof id === "string" && id.length > 0 && id.trim() === id,
    )
  ) {
    throw new Error(
      "Toolcraft feature verification request.acceptanceIds must be a non-empty array of trimmed strings.",
    );
  }
  if (new Set(value.acceptanceIds).size !== value.acceptanceIds.length) {
    throw new Error(
      "Toolcraft feature verification request.acceptanceIds must be unique.",
    );
  }
  return Object.freeze({
    acceptanceIds: Object.freeze([...value.acceptanceIds]),
    mode: "ids",
    version: 1,
  });
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause === undefined ? "" : `\nCaused by: ${describeError(error.cause)}`;
  return `${error.stack ?? `${error.name}: ${error.message}`}${cause}`;
}

function assertSelectedTitlesExistExactlyOnce(
  selectedTitles: readonly string[],
  suite: Suite,
): void {
  const availableTitles = suite.allTests().map(({ title }) => title);
  for (const selectedTitle of selectedTitles) {
    const count = availableTitles.filter((title) => title === selectedTitle).length;
    if (count !== 1) {
      throw new Error(
        `Selected browser test "${selectedTitle}" must occur exactly once in the Playwright suite; found ${count}.`,
      );
    }
  }
}

export default class ToolcraftFeatureVerificationReporter implements Reporter {
  private readonly createSelection: typeof createToolcraftFeatureVerificationSelection;
  private readonly requestSource: string | undefined;
  private state: ToolcraftFeatureVerificationReporterState = { kind: "idle" };
  private readonly writeError: (source: string) => void;
  private readonly writeOutput: (source: string) => void;

  constructor(options: ToolcraftFeatureVerificationReporterOptions = {}) {
    this.createSelection =
      options.createSelection ?? createToolcraftFeatureVerificationSelection;
    this.requestSource =
      options.requestSource ?? process.env[TOOLCRAFT_FEATURE_VERIFICATION_REQUEST_ENV];
    this.writeError = options.writeError ?? ((source) => process.stderr.write(source));
    this.writeOutput = options.writeOutput ?? ((source) => process.stdout.write(source));
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    try {
      const request = parseToolcraftFeatureVerificationRequest(this.requestSource);
      const plan = this.createSelection({
        acceptance: appAcceptance,
        ...(request.mode === "all"
          ? { all: true }
          : { acceptanceIds: request.acceptanceIds, all: false }),
        schema: appSchema,
        sectionInventory: appControlSectionInventory,
      });
      assertSelectedTitlesExistExactlyOnce(plan.testNames, suite);
      this.state = { kind: "ready", plan };
    } catch (error) {
      this.state = { error, kind: "preparation-failed" };
    }
  }

  async onEnd(_result: FullResult): Promise<{ status: "failed" } | void> {
    switch (this.state.kind) {
      case "idle":
        return this.reportFailure(
          new Error(
            "Toolcraft feature verification reporter did not receive a complete onBegin lifecycle.",
          ),
        );
      case "preparation-failed":
        return this.reportFailure(this.state.error);
      case "ready":
        this.writeOutput(`${JSON.stringify(this.state.plan)}\n`);
        return;
    }
  }

  private reportFailure(error: unknown): { status: "failed" } {
    this.writeError(
      `Toolcraft feature verification collection failed:\n${describeError(error)}\n`,
    );
    return { status: "failed" };
  }

  printsToStdio(): boolean {
    return true;
  }
}
