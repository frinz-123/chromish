export const TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION = 1;

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getExactKeyErrors(value, expected, label) {
  if (!isPlainObject(value)) return [`${label} must be a plain object.`];
  const expectedSet = new Set(expected);
  const ownKeys = Reflect.ownKeys(value);
  const unknown = ownKeys
    .filter((key) => typeof key !== "string" || !expectedSet.has(key))
    .map(String)
    .sort(compareCodeUnits);
  const missing = expected.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  return [
    ...(unknown.length > 0
      ? [`${label} contains unknown fields: ${unknown.join(", ")}.`]
      : []),
    ...(missing.length > 0
      ? [`${label} is missing required fields: ${missing.join(", ")}.`]
      : []),
  ];
}

function validateCanonicalStringArray(value, label) {
  if (!Array.isArray(value)) {
    return [`Toolcraft feature verification plan.${label} must be an array.`];
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return [
      `Toolcraft feature verification plan.${label} contains symbol fields.`,
    ];
  }
  const errors = [];
  if (value.length === 0) {
    errors.push(
      `Toolcraft feature verification plan.${label} must be non-empty.`,
    );
  }
  if (
    !value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.length > 0 &&
        entry.trim() === entry,
    )
  ) {
    errors.push(
      `Toolcraft feature verification plan.${label} must contain trimmed non-empty strings.`,
    );
  }
  if (new Set(value).size !== value.length) {
    errors.push(
      `Toolcraft feature verification plan.${label} must contain unique values.`,
    );
  }
  if (
    value.every((entry) => typeof entry === "string") &&
    value.some((entry, index) => entry !== [...value].sort(compareCodeUnits)[index])
  ) {
    errors.push(
      `Toolcraft feature verification plan.${label} must be sorted by code unit.`,
    );
  }
  return errors;
}

export function validateToolcraftFeatureVerificationPlan(value) {
  const errors = getExactKeyErrors(
    value,
    ["acceptanceIds", "testNames", "version"],
    "Toolcraft feature verification plan",
  );
  if (!isPlainObject(value)) return { errors };

  if (value.version !== TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION) {
    errors.push(
      `Toolcraft feature verification plan.version must be ${TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION}.`,
    );
  }
  errors.push(
    ...validateCanonicalStringArray(value.acceptanceIds, "acceptanceIds"),
    ...validateCanonicalStringArray(value.testNames, "testNames"),
  );
  if (
    Array.isArray(value.acceptanceIds) &&
    Array.isArray(value.testNames) &&
    value.acceptanceIds.length !== value.testNames.length
  ) {
    errors.push(
      "Toolcraft feature verification plan must contain one test name per acceptance id.",
    );
  }
  if (errors.length > 0) return { errors };

  return {
    errors,
    plan: Object.freeze({
      acceptanceIds: Object.freeze([...value.acceptanceIds]),
      testNames: Object.freeze([...value.testNames]),
      version: TOOLCRAFT_FEATURE_VERIFICATION_PLAN_VERSION,
    }),
  };
}

export function parseToolcraftFeatureVerificationPlanOutput(output) {
  if (typeof output !== "string") {
    throw new Error(
      "Toolcraft feature verification reporter must emit exactly one JSON line.",
    );
  }
  const lines = output.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== 1 || lines[0].length === 0) {
    throw new Error(
      "Toolcraft feature verification reporter must emit exactly one JSON line.",
    );
  }

  let value;
  try {
    value = JSON.parse(lines[0]);
  } catch (error) {
    throw new Error(
      "Toolcraft feature verification reporter must emit valid JSON.",
      { cause: error },
    );
  }
  const validation = validateToolcraftFeatureVerificationPlan(value);
  if (validation.errors.length > 0) {
    throw new Error(
      `Invalid Toolcraft feature verification plan:\n${validation.errors.join("\n")}`,
    );
  }
  return validation.plan;
}
