import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION,
  parseToolcraftFeatureVerificationPlanOutput,
  validateToolcraftFeatureVerificationPlan,
} from "./toolcraft-feature-verification-plan.mjs";

const validPlan = () => ({
  acceptanceIds: ["lighting.intensity", "material.layer"],
  testNames: ["browser: lighting.intensity", "browser: material.layer"],
  version: 1,
});

test("normalizes a canonical deeply frozen feature verification plan", () => {
  const validation = validateToolcraftFeatureVerificationPlan(validPlan());

  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.plan, validPlan());
  assert.equal(TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION, 1);
  assert.equal(Object.isFrozen(validation.plan), true);
  assert.equal(Object.isFrozen(validation.plan.acceptanceIds), true);
  assert.equal(Object.isFrozen(validation.plan.testNames), true);
});

test("rejects malformed top-level plan shapes", () => {
  for (const [value, pattern] of [
    [null, /must be a plain object/iu],
    [Object.create({ version: 1 }), /must be a plain object/iu],
    [{ ...validPlan(), extra: true }, /unknown fields: extra/iu],
    [{ acceptanceIds: [], testNames: [] }, /missing required fields: version/iu],
    [{ ...validPlan(), version: 2 }, /version must be 1/iu],
  ]) {
    assert.match(
      validateToolcraftFeatureVerificationPlan(value).errors.join("\n"),
      pattern,
    );
  }
});

test("rejects empty, untrimmed, duplicate, and noncanonical arrays", () => {
  const symbolArray = ["material.layer"];
  symbolArray[Symbol("hidden")] = true;
  for (const [value, pattern] of [
    [{ ...validPlan(), acceptanceIds: [] }, /acceptanceIds must be non-empty/iu],
    [{ ...validPlan(), testNames: [] }, /testNames must be non-empty/iu],
    [
      { ...validPlan(), acceptanceIds: ["material.layer", "material.layer"] },
      /acceptanceIds must contain unique/iu,
    ],
    [
      { ...validPlan(), testNames: ["browser: layer", "browser: layer"] },
      /testNames must contain unique/iu,
    ],
    [
      { ...validPlan(), acceptanceIds: [" material.layer"] },
      /acceptanceIds must contain trimmed/iu,
    ],
    [
      { ...validPlan(), testNames: ["browser: layer "] },
      /testNames must contain trimmed/iu,
    ],
    [
      { ...validPlan(), acceptanceIds: ["material.layer", "lighting.intensity"] },
      /acceptanceIds must be sorted/iu,
    ],
    [{ ...validPlan(), acceptanceIds: symbolArray }, /symbol fields/iu],
  ]) {
    assert.match(
      validateToolcraftFeatureVerificationPlan(value).errors.join("\n"),
      pattern,
    );
  }
});

test("parses exactly one JSON plan line", () => {
  assert.deepEqual(
    parseToolcraftFeatureVerificationPlanOutput(`${JSON.stringify(validPlan())}\n`),
    validPlan(),
  );
  for (const [output, pattern] of [
    ["", /exactly one JSON line/iu],
    ["not-json\n", /valid JSON/iu],
    [
      `${JSON.stringify(validPlan())}\n${JSON.stringify(validPlan())}\n`,
      /exactly one JSON line/iu,
    ],
    [JSON.stringify({ ...validPlan(), version: 2 }), /version must be 1/iu],
  ]) {
    assert.throws(
      () => parseToolcraftFeatureVerificationPlanOutput(output),
      pattern,
    );
  }
});
