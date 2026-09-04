import {
  isToolcraftBuiltInControlType,
  type ToolcraftBuiltInControlType,
} from "../contracts/component-contracts";
import type { ToolcraftControlSchema } from "../schema/types";
import { decodeToolcraftOrientationPose } from "./orientation-pose";

export type ToolcraftControlValueDecodeResult =
  | Readonly<{ accepted: true; value: unknown }>
  | Readonly<{ accepted: false }>;

export type ToolcraftControlValueDescriptor = Readonly<
  Pick<
    ToolcraftControlSchema,
    | "defaultValue"
    | "itemControl"
    | "itemControls"
    | "items"
    | "max"
    | "min"
    | "options"
    | "type"
  >
>;

type ToolcraftControlValueCodec = (
  control: ToolcraftControlValueDescriptor,
  candidate: unknown,
) => ToolcraftControlValueDecodeResult;

export type ToolcraftControlValueCodecDecision =
  | Readonly<{
      codec: ToolcraftControlValueCodec;
      implicitDefault?: (control: ToolcraftControlValueDescriptor) => unknown;
      kind: "codec";
    }>
  | Readonly<{
      codec: ToolcraftControlValueCodec;
      kind: "conditional-codec";
      ownsValue: (control: ToolcraftControlValueDescriptor) => boolean;
    }>
  | Readonly<{ kind: "runtime-owned" }>
  | Readonly<{ kind: "no-value" }>;

type JsonRecord = Record<string, unknown>;

function accept(value: unknown): ToolcraftControlValueDecodeResult {
  return { accepted: true, value };
}

function reject(): ToolcraftControlValueDecodeResult {
  return { accepted: false };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function cloneToolcraftJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneToolcraftJsonValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        cloneToolcraftJsonValue(entry),
      ]),
    );
  }
  return value;
}

export function areToolcraftControlValuesEqual(
  left: unknown,
  right: unknown,
): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) =>
        areToolcraftControlValuesEqual(entry, right[index]),
      )
    );
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        areToolcraftControlValuesEqual(left[key], right[key]),
    )
  );
}

function normalizeToolcraftHexColor(value: string): string | null {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(value.trim());
  if (!match?.[1]) {
    return null;
  }
  const hex = match[1];
  return `#${
    hex.length === 3
      ? [...hex].map((character) => `${character}${character}`).join("")
      : hex
  }`.toUpperCase();
}

function decodeBoolean(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  return typeof candidate === "boolean" ? accept(candidate) : reject();
}

function decodeBoundedNumber(
  control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  return isFiniteNumber(candidate) &&
    (control.min === undefined || candidate >= control.min) &&
    (control.max === undefined || candidate <= control.max)
    ? accept(candidate)
    : reject();
}

function decodeString(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  return typeof candidate === "string" ? accept(candidate) : reject();
}

const anchorGridValues = new Set([
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

function decodeAnchorGrid(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  return typeof candidate === "string" && anchorGridValues.has(candidate)
    ? accept(candidate)
    : reject();
}

function decodeOption(
  control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  return typeof candidate === "string" &&
    (control.options ?? []).some((option) => option.value === candidate)
    ? accept(candidate)
    : reject();
}

function decodeImagePicker(
  control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  return typeof candidate === "string" &&
    (control.items ?? []).some((item) => item.value === candidate)
    ? accept(candidate)
    : reject();
}

function decodeColor(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  const raw =
    typeof candidate === "string"
      ? candidate
      : isRecord(candidate) && typeof candidate.hex === "string"
        ? candidate.hex
        : "";
  const value = normalizeToolcraftHexColor(raw);
  return value === null ? reject() : accept(value);
}

function decodeColorOpacity(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  const record = typeof candidate === "string" ? { hex: candidate } : candidate;
  if (!isRecord(record) || typeof record.hex !== "string") {
    return reject();
  }
  const hex = normalizeToolcraftHexColor(record.hex);
  const opacity = record.opacity ?? 100;
  return hex !== null &&
    isFiniteNumber(opacity) &&
    opacity >= 0 &&
    opacity <= 100
    ? accept({ hex, opacity })
    : reject();
}

function decodeStringPair(
  candidate: unknown,
  first: string,
  second: string,
): ToolcraftControlValueDecodeResult {
  return isRecord(candidate) &&
    typeof candidate[first] === "string" &&
    typeof candidate[second] === "string"
    ? accept({ [first]: candidate[first], [second]: candidate[second] })
    : reject();
}

function decodeRangeInput(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  return decodeStringPair(candidate, "start", "end");
}

function decodeVector(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  if (!isRecord(candidate)) {
    return reject();
  }
  const decodeComponent = (value: unknown): number | null => {
    const numberValue =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : Number.NaN;
    return Number.isFinite(numberValue) ? numberValue : null;
  };
  const x = decodeComponent(candidate.x);
  const y = decodeComponent(candidate.y);
  return x === null || y === null ? reject() : accept({ x, y });
}

function decodeRangeSlider(
  control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    return reject();
  }
  for (const value of candidate) {
    if (
      !isFiniteNumber(value) ||
      (control.min !== undefined && value < control.min) ||
      (control.max !== undefined && value > control.max)
    ) {
      return reject();
    }
  }
  return accept([...candidate]);
}

function decodePalette(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  return isRecord(candidate) &&
    typeof candidate.family === "string" &&
    candidate.family.length > 0 &&
    typeof candidate.shade === "string" &&
    candidate.shade.length > 0
    ? accept({ family: candidate.family, shade: candidate.shade })
    : reject();
}

const gradientTypes = new Set(["linear", "radial", "angular", "diamond"]);

function decodeGradient(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  if (
    !isRecord(candidate) ||
    !isFiniteNumber(candidate.angle) ||
    typeof candidate.gradientType !== "string" ||
    !gradientTypes.has(candidate.gradientType) ||
    !Array.isArray(candidate.stops) ||
    candidate.stops.length < 2
  ) {
    return reject();
  }
  const stops: JsonRecord[] = [];
  for (const stop of candidate.stops) {
    if (
      !isRecord(stop) ||
      typeof stop.color !== "string" ||
      typeof stop.position !== "string"
    ) {
      return reject();
    }
    const color = normalizeToolcraftHexColor(stop.color);
    const opacity = stop.opacity;
    if (
      color === null ||
      (opacity !== undefined &&
        (!isFiniteNumber(opacity) || opacity < 0 || opacity > 100))
    ) {
      return reject();
    }
    stops.push({
      color,
      ...(opacity === undefined ? {} : { opacity }),
      position: stop.position,
    });
  }
  return accept({
    angle: candidate.angle,
    gradientType: candidate.gradientType,
    stops,
  });
}

const letterSpacings = new Set([
  "tight",
  "tighter",
  "normal",
  "wide",
  "wider",
  "widest",
]);
const lineHeights = new Set([
  "loose",
  "none",
  "normal",
  "relaxed",
  "snug",
  "tight",
]);
const textCases = new Set([
  "capitalize",
  "lowercase",
  "original",
  "titleCase",
  "uppercase",
]);

function decodeFontPicker(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  const record = typeof candidate === "string" ? { fontId: candidate } : candidate;
  if (
    !isRecord(record) ||
    typeof record.fontId !== "string" ||
    record.fontId.length === 0
  ) {
    return reject();
  }
  const color = normalizeToolcraftHexColor(
    typeof record.color === "string" ? record.color : "#FFFFFF",
  );
  const fontSize = record.fontSize ?? 16;
  const fontWeight = record.fontWeight ?? "400";
  const letterSpacing = record.letterSpacing ?? "normal";
  const lineHeight = record.lineHeight ?? "normal";
  const opacity = record.opacity ?? 100;
  const textCase = record.textCase ?? "original";
  if (
    color === null ||
    !isFiniteNumber(fontSize) ||
    fontSize < 1 ||
    typeof fontWeight !== "string" ||
    typeof letterSpacing !== "string" ||
    !letterSpacings.has(letterSpacing) ||
    typeof lineHeight !== "string" ||
    !lineHeights.has(lineHeight) ||
    !isFiniteNumber(opacity) ||
    opacity < 0 ||
    opacity > 100 ||
    typeof textCase !== "string" ||
    !textCases.has(textCase)
  ) {
    return reject();
  }
  return accept({
    color,
    fontId: record.fontId,
    fontSize,
    fontWeight,
    letterSpacing,
    lineHeight,
    opacity,
    textCase,
  });
}

const colorChannels = ["R", "G", "B"] as const;
const defaultChannelMixerValue = {
  B: { B: 100, G: 0, R: 0 },
  G: { B: 0, G: 100, R: 0 },
  R: { B: 0, G: 0, R: 100 },
};

function decodeChannelMixer(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  if (!isRecord(candidate)) {
    return reject();
  }
  const value: JsonRecord = {};
  for (const output of colorChannels) {
    const row = candidate[output];
    if (!isRecord(row)) {
      return reject();
    }
    const nextRow: JsonRecord = {};
    for (const input of colorChannels) {
      if (!isFiniteNumber(row[input])) {
        return reject();
      }
      nextRow[input] = row[input];
    }
    value[output] = nextRow;
  }
  return accept(value);
}

const curveChannels = ["RGB", "R", "G", "B"] as const;
const defaultCurvePoints = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 1 },
];
const defaultCurvesValue = {
  activeChannel: "RGB",
  points: Object.fromEntries(
    curveChannels.map((channel) => [channel, defaultCurvePoints]),
  ),
  selectedPointIndex: 1,
};

function decodeCurves(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  if (
    !isRecord(candidate) ||
    typeof candidate.activeChannel !== "string" ||
    !curveChannels.includes(
      candidate.activeChannel as (typeof curveChannels)[number],
    ) ||
    !isRecord(candidate.points)
  ) {
    return reject();
  }
  const points: JsonRecord = {};
  for (const [channel, entries] of Object.entries(candidate.points)) {
    if (
      !curveChannels.includes(channel as (typeof curveChannels)[number]) ||
      !Array.isArray(entries) ||
      entries.length < 2
    ) {
      return reject();
    }
    const nextPoints: JsonRecord[] = [];
    for (const point of entries) {
      if (
        !isRecord(point) ||
        !isFiniteNumber(point.x) ||
        !isFiniteNumber(point.y)
      ) {
        return reject();
      }
      nextPoints.push({ x: point.x, y: point.y });
    }
    points[channel] = nextPoints;
  }
  if (!Object.hasOwn(points, candidate.activeChannel)) {
    return reject();
  }
  const selectedPointIndex = candidate.selectedPointIndex;
  if (
    selectedPointIndex !== undefined &&
    (typeof selectedPointIndex !== "number" ||
      !Number.isInteger(selectedPointIndex) ||
      selectedPointIndex < 0)
  ) {
    return reject();
  }
  return accept({
    activeChannel: candidate.activeChannel,
    points,
    ...(selectedPointIndex === undefined ? {} : { selectedPointIndex }),
  });
}

function decodeOrientationPose(
  _control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  const value = decodeToolcraftOrientationPose(candidate);
  return value === null ? reject() : accept(value);
}

function decodeCollectionItem(
  control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  const decoded = decodeToolcraftBuiltInControlValue(control, candidate);
  return decoded ?? reject();
}

function decodeCollection(
  control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  if (!Array.isArray(candidate)) {
    return reject();
  }
  if (control.itemControl) {
    const items: unknown[] = [];
    for (const item of candidate) {
      const decoded = decodeCollectionItem(control.itemControl, item);
      if (!decoded.accepted) {
        return reject();
      }
      items.push(decoded.value);
    }
    return accept(items);
  }
  if (control.itemControls) {
    const items: JsonRecord[] = [];
    for (const item of candidate) {
      if (!isRecord(item)) {
        return reject();
      }
      const clonedItem = cloneToolcraftJsonValue(item);
      if (!isRecord(clonedItem)) {
        return reject();
      }
      const nextItem: JsonRecord = clonedItem;
      for (const [field, fieldControl] of Object.entries(control.itemControls)) {
        const fieldCandidate = Object.hasOwn(item, field)
          ? item[field]
          : fieldControl.defaultValue;
        const decoded = decodeCollectionItem(fieldControl, fieldCandidate);
        if (!decoded.accepted) {
          return reject();
        }
        nextItem[field] = decoded.value;
      }
      items.push(nextItem);
    }
    return accept(items);
  }
  return reject();
}

function decodeFileDropItemSettings(
  control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult {
  if (!Array.isArray(candidate) || !control.itemControls) {
    return reject();
  }
  const items: JsonRecord[] = [];
  for (const item of candidate) {
    if (!isRecord(item) || typeof item.mediaId !== "string" || !item.mediaId) {
      return reject();
    }
    const nextItem: JsonRecord = { mediaId: item.mediaId };
    for (const [field, fieldControl] of Object.entries(control.itemControls)) {
      const fieldCandidate = Object.hasOwn(item, field)
        ? item[field]
        : fieldControl.defaultValue;
      const decoded = decodeCollectionItem(fieldControl, fieldCandidate);
      if (!decoded.accepted) {
        return reject();
      }
      nextItem[field] = decoded.value;
    }
    items.push(nextItem);
  }
  return accept(items);
}

function hasFileDropItemSettings(
  control: ToolcraftControlValueDescriptor,
): boolean {
  return Boolean(
    control.itemControls && Object.keys(control.itemControls).length > 0,
  );
}

export const TOOLCRAFT_CONTROL_VALUE_CODEC_REGISTRY = {
  actions: { kind: "no-value" },
  anchorGrid: { codec: decodeAnchorGrid, kind: "codec" },
  aspectRatio: { kind: "runtime-owned" },
  channelMixer: {
    codec: decodeChannelMixer,
    implicitDefault: () => defaultChannelMixerValue,
    kind: "codec",
  },
  checkbox: { codec: decodeBoolean, kind: "codec" },
  code: { codec: decodeString, kind: "codec" },
  collectionActions: { codec: decodeCollection, kind: "codec" },
  color: { codec: decodeColor, kind: "codec" },
  colorOpacity: { codec: decodeColorOpacity, kind: "codec" },
  curves: {
    codec: decodeCurves,
    implicitDefault: () => defaultCurvesValue,
    kind: "codec",
  },
  fileDrop: {
    codec: decodeFileDropItemSettings,
    kind: "conditional-codec",
    ownsValue: hasFileDropItemSettings,
  },
  fontPicker: { codec: decodeFontPicker, kind: "codec" },
  gradient: { codec: decodeGradient, kind: "codec" },
  imagePicker: { codec: decodeImagePicker, kind: "codec" },
  orientationGizmo: { codec: decodeOrientationPose, kind: "codec" },
  palette: { codec: decodePalette, kind: "codec" },
  panelActions: { kind: "no-value" },
  rangeInput: { codec: decodeRangeInput, kind: "codec" },
  rangeSlider: { codec: decodeRangeSlider, kind: "codec" },
  segmented: { codec: decodeOption, kind: "codec" },
  select: { codec: decodeOption, kind: "codec" },
  settingsTransfer: { kind: "no-value" },
  slider: {
    codec: decodeBoundedNumber,
    implicitDefault: (control: ToolcraftControlValueDescriptor) =>
      control.min ?? 0,
    kind: "codec",
  },
  sourceCollection: { codec: decodeCollection, kind: "codec" },
  switch: { codec: decodeBoolean, kind: "codec" },
  tabs: { codec: decodeOption, kind: "codec" },
  text: { codec: decodeString, kind: "codec" },
  vector: { codec: decodeVector, kind: "codec" },
} as const satisfies Record<
  ToolcraftBuiltInControlType,
  ToolcraftControlValueCodecDecision
>;

export function decodeToolcraftBuiltInControlValue(
  control: ToolcraftControlValueDescriptor,
  candidate: unknown,
): ToolcraftControlValueDecodeResult | null {
  if (!isToolcraftBuiltInControlType(control.type)) {
    return null;
  }
  const decision: ToolcraftControlValueCodecDecision =
    TOOLCRAFT_CONTROL_VALUE_CODEC_REGISTRY[control.type];
  if (decision.kind === "codec") {
    return decision.codec(control, candidate);
  }
  if (decision.kind === "conditional-codec") {
    return decision.ownsValue(control)
      ? decision.codec(control, candidate)
      : reject();
  }
  return reject();
}

export function decodeToolcraftBuiltInControlDefault(
  control: ToolcraftControlValueDescriptor,
): ToolcraftControlValueDecodeResult | null {
  if (!isToolcraftBuiltInControlType(control.type)) {
    return null;
  }
  const decision: ToolcraftControlValueCodecDecision =
    TOOLCRAFT_CONTROL_VALUE_CODEC_REGISTRY[control.type];
  if (
    decision.kind === "codec" &&
    control.defaultValue === undefined &&
    decision.implicitDefault !== undefined
  ) {
    return decision.codec(control, decision.implicitDefault(control));
  }
  return decodeToolcraftBuiltInControlValue(control, control.defaultValue);
}
