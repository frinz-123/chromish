import assert from "node:assert/strict";
import test from "node:test";

import {
  parseToolcraftFeatureVerificationArguments,
  runToolcraftFeatureVerificationCore,
} from "./run-feature-verification.mjs";

const plan = Object.freeze({
  acceptanceIds: Object.freeze(["material.layer"]),
  testNames: Object.freeze(["browser: material.layer"]),
  version: 1,
});

const listReport = JSON.stringify({
  errors: [],
  suites: [
    {
      specs: [
        {
          tags: [],
          tests: [{ projectName: "" }],
          title: "browser: material.layer",
        },
      ],
      suites: [],
      title: "",
    },
  ],
});

function createDependencies(overrides = {}) {
  const calls = {
    capture: [],
    chromium: [],
    output: [],
    run: [],
  };
  let captureIndex = 0;
  const dependencies = {
    captureProcess: async (command, arguments_, options) => {
      calls.capture.push({ arguments_, command, options });
      captureIndex += 1;
      return captureIndex === 1 ? `${JSON.stringify(plan)}\n` : listReport;
    },
    ensureChromium: async (input) => {
      calls.chromium.push(input);
    },
    getBinaryPath: (projectDir, binary) => `${projectDir}/node_modules/.bin/${binary}`,
    runProcess: async (command, arguments_, options) => {
      calls.run.push({ arguments_, command, options });
    },
    writeOutput: (source) => calls.output.push(source),
    ...overrides,
  };
  return { calls, dependencies };
}

test("parses explicit ids and all mode while rejecting ambiguous CLI input", () => {
  assert.deepEqual(
    parseToolcraftFeatureVerificationArguments(["material.layer", "lighting.intensity"]),
    {
      acceptanceIds: ["lighting.intensity", "material.layer"],
      mode: "ids",
      version: 1,
    },
  );
  assert.deepEqual(
    parseToolcraftFeatureVerificationArguments(["--", "material.layer"]),
    { acceptanceIds: ["material.layer"], mode: "ids", version: 1 },
  );
  assert.deepEqual(parseToolcraftFeatureVerificationArguments(["--all"]), {
    mode: "all",
    version: 1,
  });
  assert.deepEqual(parseToolcraftFeatureVerificationArguments(["--", "--all"]), {
    mode: "all",
    version: 1,
  });

  for (const arguments_ of [
    [],
    ["--"],
    ["--unknown"],
    ["--", "--unknown"],
    ["material.layer", "material.layer"],
    ["--all", "material.layer"],
    ["--", "--all", "material.layer"],
    [" material.layer"],
  ]) {
    assert.throws(
      () => parseToolcraftFeatureVerificationArguments(arguments_),
      /feature verification/iu,
    );
  }
});

test("collects the semantic plan and title catalog concurrently", async () => {
  let captureCount = 0;
  let releaseFirst;
  const firstCapture = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const { calls, dependencies } = createDependencies({
    captureProcess: async (command, arguments_, options) => {
      calls.capture.push({ arguments_, command, options });
      captureCount += 1;
      if (captureCount === 1) return firstCapture;
      releaseFirst(`${JSON.stringify(plan)}\n`);
      return listReport;
    },
  });

  await runToolcraftFeatureVerificationCore({
    dependencies,
    projectDir: "/app",
    request: parseToolcraftFeatureVerificationArguments(["material.layer"]),
  });

  assert.equal(captureCount, 2);
  assert.match(
    calls.capture[0].options.env.TOOLCRAFT_FEATURE_VERIFICATION_REQUEST,
    /material\.layer/iu,
  );
  assert.equal(
    calls.capture[1].options.env.TOOLCRAFT_FEATURE_VERIFICATION_REQUEST,
    undefined,
  );
});

test("fails invalid collection before Chromium or browser execution", async () => {
  for (const outputs of [
    ["not-json\n", listReport],
    [
      `${JSON.stringify(plan)}\n`,
      JSON.stringify({
        errors: [],
        suites: [
          {
            specs: [
              {
                tags: [],
                tests: [{ projectName: "first" }, { projectName: "second" }],
                title: "browser: material.layer",
              },
            ],
            suites: [],
            title: "",
          },
        ],
      }),
    ],
  ]) {
    let index = 0;
    const { calls, dependencies } = createDependencies({
      captureProcess: async () => outputs[index++],
    });
    await assert.rejects(
      runToolcraftFeatureVerificationCore({
        dependencies,
        projectDir: "/app",
        request: parseToolcraftFeatureVerificationArguments(["material.layer"]),
      }),
    );
    assert.equal(calls.chromium.length, 0);
    assert.equal(calls.run.length, 0);
  }
});

test("runs only exact selected Playwright titles with one worker", async () => {
  const { calls, dependencies } = createDependencies();
  const result = await runToolcraftFeatureVerificationCore({
    dependencies,
    projectDir: "/app",
    request: parseToolcraftFeatureVerificationArguments(["material.layer"]),
  });

  assert.deepEqual(result, plan);
  assert.equal(calls.chromium.length, 1);
  assert.equal(calls.run.length, 1);
  assert.equal(calls.run[0].command, "/app/node_modules/.bin/playwright");
  assert.equal(calls.run[0].arguments_[0], "test");
  assert.equal(calls.run[0].arguments_.at(-1), "--workers=1");
  const grepIndex = calls.run[0].arguments_.indexOf("--grep");
  assert.notEqual(grepIndex, -1);
  assert.match(calls.run[0].arguments_[grepIndex + 1], /material/iu);
  assert.equal(calls.run[0].options.env.TOOLCRAFT_BROWSER_SERVER_MODE, "dev");
  assert.match(calls.output.join(""), /material\.layer/iu);
});

test("removes inherited proof authority from collection and execution", async () => {
  const inheritedAuthority = {
    TOOLCRAFT_BROWSER_EXECUTION_LEDGER_DIRECTORY: "/ledger",
    TOOLCRAFT_BROWSER_EXECUTION_LEDGER_NONCE: "nonce",
    TOOLCRAFT_KERNEL_BENCHMARK_REPORT_NONCE: "kernel-nonce",
    TOOLCRAFT_KERNEL_BENCHMARK_REPORT_PATH: "/kernel",
    TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE: "full-certification",
    TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR: "maximum",
    TOOLCRAFT_PERFORMANCE_REPORT_NONCE: "performance-nonce",
    TOOLCRAFT_PERFORMANCE_REPORT_PATH: "/performance",
    TOOLCRAFT_PERFORMANCE_REPORT_SOURCE_HASH: "a".repeat(64),
    TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH: "b".repeat(64),
    TOOLCRAFT_TARGETED_PERFORMANCE_PASS_IDS: '["scene"]',
    TOOLCRAFT_TARGETED_PERFORMANCE_PATH_IDS: '["path"]',
    TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_NONCE: "targeted-nonce",
    TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_PATH: "/targeted",
    TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_SOURCE_HASH: "c".repeat(64),
  };
  const env = { KEEP_ME: "yes", ...inheritedAuthority };
  const { calls, dependencies } = createDependencies();

  await runToolcraftFeatureVerificationCore({
    dependencies,
    env,
    projectDir: "/app",
    request: parseToolcraftFeatureVerificationArguments(["material.layer"]),
  });

  for (const call of [...calls.capture, ...calls.run]) {
    assert.equal(call.options.env.KEEP_ME, "yes");
    for (const name of Object.keys(inheritedAuthority)) {
      assert.equal(call.options.env[name], undefined, name);
    }
  }
  assert.deepEqual(env, { KEEP_ME: "yes", ...inheritedAuthority });
});
