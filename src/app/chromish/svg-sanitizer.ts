export const CHROMISH_MAX_SVG_BYTES = 5 * 1024 * 1024;
export const CHROMISH_MAX_SVG_ELEMENTS = 10_000;
const MAX_EMBEDDED_ASSET_BYTES = 512 * 1024;
const MAX_EMBEDDED_ASSET_TOTAL_BYTES = 1024 * 1024;

export type ChromishSvgErrorCode =
  | "empty-svg"
  | "invalid-svg"
  | "unsafe-svg"
  | "svg-too-large"
  | "svg-too-complex"
  | "unsupported-svg";

export class ChromishSvgError extends Error {
  readonly code: ChromishSvgErrorCode;

  constructor(code: ChromishSvgErrorCode, message: string) {
    super(message);
    this.name = "ChromishSvgError";
    this.code = code;
  }
}

export type SanitizedSvg = Readonly<{
  elementCount: number;
  requiresRasterFallback: boolean;
  source: string;
}>;

const forbiddenElementNames = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
]);

const fallbackElementNames = new Set([
  "text",
  "tspan",
  "image",
  "use",
  "mask",
  "clippath",
  "filter",
  "pattern",
  "style",
]);

export function detectRasterFallbackSyntax(source: string): boolean {
  return (
    /<\s*(?:text|tspan|image|use|mask|clipPath|filter|pattern|style)\b/iu.test(source) ||
    /\b(?:class|filter|mask|clip-path)\s*=/iu.test(source) ||
    /\bstroke\s*=\s*["'](?!\s*(?:none|transparent)\s*["'])/iu.test(source)
  );
}

function estimateBase64Bytes(value: string): number {
  const comma = value.indexOf(",");
  if (comma < 0) return Number.POSITIVE_INFINITY;
  const body = value.slice(comma + 1).replace(/\s/gu, "");
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

function isAllowedDataAsset(value: string): boolean {
  return /^data:image\/(?:png|jpeg|webp|gif);base64,/iu.test(value);
}

function inspectReference(value: string): { embeddedBytes: number; unsafe: boolean } {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#")) return { embeddedBytes: 0, unsafe: false };
  if (isAllowedDataAsset(trimmed)) {
    const embeddedBytes = estimateBase64Bytes(trimmed);
    return {
      embeddedBytes,
      unsafe: !Number.isFinite(embeddedBytes) || embeddedBytes > MAX_EMBEDDED_ASSET_BYTES,
    };
  }
  return { embeddedBytes: 0, unsafe: true };
}

function inspectCssUrls(value: string): { embeddedBytes: number; unsafe: boolean } {
  let embeddedBytes = 0;
  let unsafe = false;
  for (const match of value.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/giu)) {
    const inspected = inspectReference(match[2] ?? "");
    embeddedBytes += inspected.embeddedBytes;
    unsafe ||= inspected.unsafe;
  }
  return { embeddedBytes, unsafe };
}

export function preflightSvgText(source: string): void {
  const byteLength = new TextEncoder().encode(source).byteLength;
  if (byteLength === 0 || source.trim().length === 0) {
    throw new ChromishSvgError("empty-svg", "The SVG file is empty.");
  }
  if (byteLength > CHROMISH_MAX_SVG_BYTES) {
    throw new ChromishSvgError("svg-too-large", "SVG files must be 5 MB or smaller.");
  }
  if (/<!doctype|<!entity/iu.test(source)) {
    throw new ChromishSvgError(
      "unsafe-svg",
      "SVG document types and entity declarations are not allowed.",
    );
  }
  if (/<\s*(?:script|foreignObject|iframe|object|embed|audio|video)\b/iu.test(source)) {
    throw new ChromishSvgError(
      "unsafe-svg",
      "The SVG contains executable or externally hosted content.",
    );
  }
  if (/\son[a-z][\w:-]*\s*=/iu.test(source)) {
    throw new ChromishSvgError("unsafe-svg", "SVG event-handler attributes are not allowed.");
  }
  if (/@import|@font-face/iu.test(source)) {
    throw new ChromishSvgError("unsafe-svg", "External CSS imports and fonts are not allowed.");
  }
}

function getDomParser(): DOMParser {
  if (typeof DOMParser === "undefined") {
    throw new ChromishSvgError(
      "unsupported-svg",
      "SVG conversion requires a browser DOM parser.",
    );
  }
  return new DOMParser();
}

export function sanitizeSvg(source: string): SanitizedSvg {
  preflightSvgText(source);
  const document = getDomParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement.localName.toLowerCase() !== "svg") {
    throw new ChromishSvgError("invalid-svg", "The file is not a well-formed SVG document.");
  }

  const elements = [document.documentElement, ...document.documentElement.querySelectorAll("*")];
  if (elements.length > CHROMISH_MAX_SVG_ELEMENTS) {
    throw new ChromishSvgError(
      "svg-too-complex",
      `SVGs may contain at most ${CHROMISH_MAX_SVG_ELEMENTS.toLocaleString()} elements.`,
    );
  }

  let embeddedAssetBytes = 0;
  let requiresRasterFallback = detectRasterFallbackSyntax(source);

  for (const element of elements) {
    const localName = element.localName.toLowerCase();
    if (forbiddenElementNames.has(localName)) {
      throw new ChromishSvgError("unsafe-svg", `Unsafe <${element.localName}> content is not allowed.`);
    }
    requiresRasterFallback ||= fallbackElementNames.has(localName);

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith("on")) {
        throw new ChromishSvgError("unsafe-svg", "SVG event-handler attributes are not allowed.");
      }
      if (name === "href" || name === "xlink:href" || name === "src") {
        const inspected = inspectReference(value);
        embeddedAssetBytes += inspected.embeddedBytes;
        if (inspected.unsafe) {
          throw new ChromishSvgError("unsafe-svg", "External SVG links and assets are not allowed.");
        }
      }
      if (name === "style" || name === "fill" || name === "stroke" || name === "filter" || name === "mask" || name === "clip-path") {
        const inspected = inspectCssUrls(value);
        embeddedAssetBytes += inspected.embeddedBytes;
        if (inspected.unsafe) {
          throw new ChromishSvgError("unsafe-svg", "External CSS URLs are not allowed.");
        }
      }
      if (name === "style" || name === "class" || name === "filter" || name === "mask" || name === "clip-path") {
        requiresRasterFallback = true;
      }
      if (name === "stroke" && value.trim().toLowerCase() !== "none" && value.trim().toLowerCase() !== "transparent") {
        requiresRasterFallback = true;
      }
    }
  }

  if (embeddedAssetBytes > MAX_EMBEDDED_ASSET_TOTAL_BYTES) {
    throw new ChromishSvgError(
      "svg-too-large",
      "Embedded SVG image assets must total 1 MB or less.",
    );
  }

  return {
    elementCount: elements.length,
    requiresRasterFallback,
    source: new XMLSerializer().serializeToString(document.documentElement),
  };
}
