#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectToolcraftPlaywrightTestTitles,
  getToolcraftPlaywrightExactGrepPattern,
  resolveToolcraftPlaywrightTestTitles,
} from "./playwright-test-title-selection.mjs";
import {
  captureToolcraftProofProcess,
  ensureToolcraftChromium,
  getToolcraftBinaryPath,
  runToolcraftProofProcess,
} from "./toolcraft-proof-process.mjs";
import { parseToolcraftFeatureVerificationPlanOutput } from "./toolcraft-feature-verification-plan.mjs";

const modulePath = fileURLToPath(import.meta.url);
const defaultProjectDir = path.resolve(path.dirname(modulePath), "..");

const proofAuthorityEnvironmentNames = Object.freeze([
  "TOOLCRAFT_BROWSER_EXECUTION_LEDGER_DIRECTORY",
  "TOOLCRAFT_BROWSER_EXECUTION_LEDGER_NONCE",
  "TOOLCRAFT_KERNEL_BENCHMARK_REPORT_NONCE",
  "TOOLCRAFT_KERNEL_BENCHMARK_REPORT_PATH",
  "TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE",
  "TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR",
  "TOOLCRAFT_PERFORMANCE_REPORT_NONCE",
  "TOOLCRAFT_PERFORMANCE_REPORT_PATH",
  "TOOLCRAFT_PERFORMANCE_REPORT_SOURCE_HASH",
  "TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH",
  "TOOLCRAFT_TARGETED_PERFORMANCE_PASS_IDS",
  "TOOLCRAFT_TARGETED_PERFORMANCE_PATH_IDS",
  "TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_NONCE",
  "TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_PATH",
  "TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_SOURCE_HASH",
]);

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

function getFeatureVerificationEnvironment(env) {
  const sanitized = { ...env };
  delete sanitized.TOOLCRAFT_FEATURE_VERIFICATION_REQUEST;
  for (const name of proofAuthorityEnvironmentNames) delete sanitized[name];
  return sanitized;
}

export function parseToolcraftFeatureVerificationArguments(arguments_) {
  if (!Array.isArray(arguments_)) {
    throw new Error(
      "Toolcraft feature verification requires one or more acceptance ids or --all.",
    );
  }
  const normalizedArguments =
    arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  if (normalizedArguments.length === 0) {
    throw new Error(
      "Toolcraft feature verification requires one or more acceptance ids or --all.",
    );
  }
  if (
    normalizedArguments.length === 1 &&
    normalizedArguments[0] === "--all"
  ) {
    return Object.freeze({ mode: "all", version: 1 });
  }
  if (
    normalizedArguments.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.length === 0 ||
        argument.trim() !== argument ||
        argument.startsWith("--"),
    )
  ) {
    throw new Error(
      "Toolcraft feature verification accepts only trimmed acceptance ids or the sole --all flag.",
    );
  }
  if (new Set(normalizedArguments).size !== normalizedArguments.length) {
    throw new Error(
      "Toolcraft feature verification acceptance ids must be unique.",
    );
  }
  return Object.freeze({
    acceptanceIds: Object.freeze(
      [...normalizedArguments].sort(compareCodeUnits),
    ),
    mode: "ids",
    version: 1,
  });
}

function createDefaultDependencies() {
  return Object.freeze({
    captureProcess: captureToolcraftProofProcess,
    async ensureChromium({ projectDir }) {
      await ensureToolcraftChromium({
        playwright: await import("@playwright/test"),
        projectDir,
      });
    },
    getBinaryPath: getToolcraftBinaryPath,
    runProcess: runToolcraftProofProcess,
    writeOutput: (source) => process.stdout.write(source),
  });
}

function parsePlaywrightListOutput(output) {
  let report;
  try {
    report = JSON.parse(output);
  } catch (error) {
    throw new Error("Playwright test listing must emit valid JSON.", {
      cause: error,
    });
  }
  return collectToolcraftPlaywrightTestTitles(report);
}

export async function runToolcraftFeatureVerificationCore({
  dependencies = createDefaultDependencies(),
  env = process.env,
  projectDir = defaultProjectDir,
  request,
}) {
  const resolvedProjectDir = path.resolve(projectDir);
  const playwrightBin = dependencies.getBinaryPath(
    resolvedProjectDir,
    "playwright",
  );
  const sanitizedEnv = getFeatureVerificationEnvironment(env);
  const requestSource = JSON.stringify(request);
  const [planOutput, listOutput] = await Promise.all([
    dependencies.captureProcess(
      playwrightBin,
      [
        "test",
        "--list",
        "--reporter=./e2e/toolcraft-feature-verification-reporter.ts",
      ],
      {
        cwd: resolvedProjectDir,
        env: {
          ...sanitizedEnv,
          TOOLCRAFT_FEATURE_VERIFICATION_REQUEST: requestSource,
        },
      },
    ),
    dependencies.captureProcess(
      playwrightBin,
      ["test", "--list", "--reporter=json"],
      { cwd: resolvedProjectDir, env: sanitizedEnv },
    ),
  ]);
  const featurePlan = parseToolcraftFeatureVerificationPlanOutput(planOutput);
  const selections = resolveToolcraftPlaywrightTestTitles(
    parsePlaywrightListOutput(listOutput),
    featurePlan.testNames,
  );

  dependencies.writeOutput(
    `[toolcraft] Focused feature verification: ${featurePlan.acceptanceIds.join(", ")}\n`,
  );
  dependencies.writeOutput(
    `[toolcraft] Browser scenarios: ${featurePlan.testNames.join(" | ")}\n`,
  );
  await dependencies.ensureChromium({ projectDir: resolvedProjectDir });
  await dependencies.runProcess(
    playwrightBin,
    [
      "test",
      "--grep",
      getToolcraftPlaywrightExactGrepPattern(selections),
      "--workers=1",
    ],
    {
      cwd: resolvedProjectDir,
      env: {
        ...sanitizedEnv,
        TOOLCRAFT_BROWSER_SERVER_MODE: "dev",
      },
    },
  );
  return featurePlan;
}

export async function runToolcraftFeatureVerification({
  arguments_ = process.argv.slice(2),
  env = process.env,
  projectDir = defaultProjectDir,
} = {}) {
  return runToolcraftFeatureVerificationCore({
    env,
    projectDir,
    request: parseToolcraftFeatureVerificationArguments(arguments_),
  });
}

async function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return (await realpath(process.argv[1])) === (await realpath(modulePath));
  } catch {
    return path.resolve(process.argv[1]) === modulePath;
  }
}

if (await isDirectExecution()) await runToolcraftFeatureVerification();
