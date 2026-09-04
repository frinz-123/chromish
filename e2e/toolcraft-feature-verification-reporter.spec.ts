import { expect, test } from "@playwright/test";
import type { FullConfig, FullResult, Suite } from "@playwright/test/reporter";

import ToolcraftFeatureVerificationReporter, {
  parseToolcraftFeatureVerificationRequest,
} from "./toolcraft-feature-verification-reporter";

const selectedPlan = Object.freeze({
  acceptanceIds: Object.freeze(["material.layer"]),
  testNames: Object.freeze(["browser: material.layer"]),
  version: 1 as const,
});

function createSuite(testNames: readonly string[]): Suite {
  return {
    allTests: () => testNames.map((title) => ({ title })),
  } as unknown as Suite;
}

const config = {} as FullConfig;
const result = { status: "passed" } as FullResult;

test("feature reporter parses only the exact versioned request shapes", () => {
  expect(
    parseToolcraftFeatureVerificationRequest(
      '{"acceptanceIds":["material.layer"],"mode":"ids","version":1}',
    ),
  ).toEqual({ acceptanceIds: ["material.layer"], mode: "ids", version: 1 });
  expect(
    parseToolcraftFeatureVerificationRequest('{"mode":"all","version":1}'),
  ).toEqual({ mode: "all", version: 1 });

  for (const value of [
    undefined,
    "not-json",
    '{"mode":"all","version":2}',
    '{"mode":"all","version":1,"acceptanceIds":[]}',
    '{"acceptanceIds":[],"mode":"ids","version":1}',
    '{"acceptanceIds":["material.layer","material.layer"],"mode":"ids","version":1}',
    '{"acceptanceIds":[" material.layer"],"mode":"ids","version":1}',
    '{"acceptanceIds":["material.layer"],"mode":"ids","version":1,"extra":true}',
  ]) {
    expect(() => parseToolcraftFeatureVerificationRequest(value)).toThrow();
  }
});

test("feature reporter selects current app semantics and emits exactly one plan line", async () => {
  const output: string[] = [];
  const selectionInputs: unknown[] = [];
  const reporter = new ToolcraftFeatureVerificationReporter({
    createSelection: (input) => {
      selectionInputs.push(input);
      return selectedPlan;
    },
    requestSource:
      '{"acceptanceIds":["material.layer"],"mode":"ids","version":1}',
    writeError: (source) => {
      throw new Error(`Unexpected reporter error: ${source}`);
    },
    writeOutput: (source) => output.push(source),
  });

  reporter.onBegin(config, createSuite(selectedPlan.testNames));
  await expect(reporter.onEnd(result)).resolves.toBeUndefined();
  expect(selectionInputs).toHaveLength(1);
  expect(selectionInputs[0]).toMatchObject({
    acceptanceIds: ["material.layer"],
    all: false,
  });
  expect(output).toEqual([`${JSON.stringify(selectedPlan)}\n`]);
});

test("feature reporter maps all mode without internal acceptance ids", async () => {
  const inputs: unknown[] = [];
  const reporter = new ToolcraftFeatureVerificationReporter({
    createSelection: (input) => {
      inputs.push(input);
      return selectedPlan;
    },
    requestSource: '{"mode":"all","version":1}',
    writeError: () => {},
    writeOutput: () => {},
  });

  reporter.onBegin(config, createSuite(selectedPlan.testNames));
  await expect(reporter.onEnd(result)).resolves.toBeUndefined();
  expect(inputs[0]).toMatchObject({ all: true });
  expect(inputs[0]).not.toHaveProperty("acceptanceIds");
});

test("feature reporter fails closed for absent and ambiguous selected tests", async () => {
  for (const titles of [[], [...selectedPlan.testNames, ...selectedPlan.testNames]]) {
    const errors: string[] = [];
    const output: string[] = [];
    const reporter = new ToolcraftFeatureVerificationReporter({
      createSelection: () => selectedPlan,
      requestSource: '{"mode":"all","version":1}',
      writeError: (source) => errors.push(source),
      writeOutput: (source) => output.push(source),
    });

    reporter.onBegin(config, createSuite(titles));
    await expect(reporter.onEnd(result)).resolves.toEqual({ status: "failed" });
    expect(output).toEqual([]);
    expect(errors.join("\n")).toMatch(/exactly once/iu);
  }
});

test("feature reporter suppresses output after malformed input or preparation failure", async () => {
  for (const fixture of [
    {
      createSelection: () => selectedPlan,
      requestSource: "not-json",
      suite: createSuite(selectedPlan.testNames),
    },
    {
      createSelection: () => {
        throw new Error("unknown acceptance id");
      },
      requestSource: '{"mode":"all","version":1}',
      suite: createSuite(selectedPlan.testNames),
    },
  ]) {
    const errors: string[] = [];
    const output: string[] = [];
    const reporter = new ToolcraftFeatureVerificationReporter({
      ...fixture,
      writeError: (source) => errors.push(source),
      writeOutput: (source) => output.push(source),
    });

    reporter.onBegin(config, fixture.suite);
    await expect(reporter.onEnd(result)).resolves.toEqual({ status: "failed" });
    expect(output).toEqual([]);
    expect(errors).toHaveLength(1);
  }
});

test("feature reporter fails when onEnd runs without onBegin", async () => {
  const errors: string[] = [];
  const reporter = new ToolcraftFeatureVerificationReporter({
    requestSource: '{"mode":"all","version":1}',
    writeError: (source) => errors.push(source),
    writeOutput: () => {},
  });

  await expect(reporter.onEnd(result)).resolves.toEqual({ status: "failed" });
  expect(errors.join("\n")).toMatch(/complete onBegin lifecycle/iu);
});
