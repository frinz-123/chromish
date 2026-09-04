import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOLCRAFT_DELIVERY_PLAN_VERSION,
  createToolcraftDeliveryPlan,
  createToolcraftDeliveryPlanHash,
  getToolcraftDeliveryDiagnosticTier,
} from "./toolcraft-delivery-plan.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  hash,
  initialSteps,
  planningInputs,
  requestAuthority,
} from "./toolcraft-delivery-plan-test-helpers.mjs";

test("creates only the fixed complete initial functional plan", () => {
  const inputs = planningInputs({ initial: true });
  const plan = createToolcraftDeliveryPlan(inputs);

  assert.equal(TOOLCRAFT_DELIVERY_PLAN_VERSION, 6);
  assert.deepEqual(plan, {
    basis: { kind: "initial" },
    functionalProofModelHash: createToolcraftFunctionalProofModelHash(
      inputs.currentFunctionalProofModel,
    ),
    kind: "functional",
    lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
    manifestHash: hash("a"),
    sourceHash: inputs.currentInventory.sourceHash,
    steps: initialSteps,
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.match(createToolcraftDeliveryPlanHash(plan), /^[a-f0-9]{64}$/u);
  assert.equal(getToolcraftDeliveryDiagnosticTier(plan), 4);
});

test("proven products cannot construct later functional delivery plans", () => {
  assert.throws(
    () => createToolcraftDeliveryPlan(planningInputs({ authority: null })),
    /does not create later functional delivery plans/iu,
  );
});

test("first delivery rejects performance authority", () => {
  assert.throws(
    () => createToolcraftDeliveryPlan(planningInputs({
      authority: requestAuthority,
      initial: true,
    })),
    /first delivery must be functional/iu,
  );
});
