import { expect, type Download, type Locator, type Page } from "@playwright/test";
import { chromium } from "playwright";

import { getToolcraftApplicabilityRequirementId, type ToolcraftControlApplicabilityCase } from "../src/app/app-acceptance";
import { expectToolcraftControlApplicabilityState } from "./browser-control-applicability-evidence";
import { createToolcraftBrowserProofSession, type ToolcraftBrowserProofSession } from "./browser-proof-session";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { inspectToolcraftVideoDownload } from "./video-artifact-inspection";

export const vectorSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160">
  <g transform="translate(4 2)">
    <path fill="#000" fill-rule="evenodd" d="M20 20H176V138H20Z M45 58V100H85V58Z"/>
    <path fill="#000" d="M128 45C150 45 168 63 168 85S150 125 128 125Z"/>
    <circle cx="100" cy="80" r="12" fill="#000"/>
  </g>
</svg>`;
export const rasterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160">
  <rect x="24" y="24" width="152" height="112" rx="22" fill="none" stroke="#000" stroke-width="18"/>
  <text x="100" y="100" text-anchor="middle" font-size="54" font-family="sans-serif">C</text>
</svg>`;
export const unsafeSvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="20" height="20"/></svg>`;
export const canvasSelector = "[data-toolcraft-chromish-canvas] canvas";
export const backgroundRgba = [237, 237, 233, 255] as const;

export function expectedProductPixel(pixels: Uint8ClampedArray) {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const distance = Math.hypot(
      pixels[offset]! - backgroundRgba[0],
      pixels[offset + 1]! - backgroundRgba[1],
      pixels[offset + 2]! - backgroundRgba[2],
      pixels[offset + 3]! - backgroundRgba[3],
    );
    if (distance > 32) {
      const index = offset / 4;
      return {
        rgba: Array.from(pixels.subarray(offset, offset + 4)) as [number, number, number, number],
        xRatio: (index % 64) / 64,
        yRatio: Math.floor(index / 64) / 64,
      };
    }
  }
  throw new Error("Decoded Chromish artifact contains no chrome product pixel.");
}

export async function openChromish(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("[data-toolcraft-chromish-canvas]")).toBeVisible();
}

export async function uploadSvg(page: Page, source = vectorSvg, name = "compound-mark.svg"): Promise<void> {
  await page.locator('[data-toolcraft-control-target="media.svgSource"] input[type="file"]').setInputFiles({
    buffer: Buffer.from(source),
    mimeType: "image/svg+xml",
    name,
  });
}

export async function uploadVectorSvg(page: Page): Promise<void> {
  await uploadSvg(page);
  const canvas = page.locator(canvasSelector);
  await expect(canvas).toHaveAttribute("data-chromish-mesh-route", "vector", { timeout: 20_000 });
  await expect.poll(async () => Number(await canvas.getAttribute("data-chromish-triangle-count"))).toBeGreaterThan(0);
}

export function control(page: Page, target: string): Locator {
  return page.locator(`[data-toolcraft-control-target="${target}"]`);
}

export async function changeSlider(page: Page, target: string): Promise<void> {
  const slider = control(page, target).getByRole("slider");
  const before = await slider.inputValue();
  await slider.press("ArrowRight");
  await expect.poll(() => slider.inputValue()).not.toBe(before);
}

export async function setColor(page: Page, target: string, value: string): Promise<void> {
  const input = control(page, target).locator('input[type="text"]');
  await input.fill(value);
  await input.press("Enter");
  await input.blur();
  await expect(input).toHaveValue(value.toUpperCase());
}

export async function chooseSegment(page: Page, target: string, label: string): Promise<void> {
  const option = control(page, target).getByRole("button", { name: label, exact: true });
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "true");
}

export async function chooseSelect(page: Page, target: string, label: string): Promise<void> {
  const combobox = control(page, target).getByRole("combobox");
  await combobox.click();
  const option = page.locator('[role="option"]').filter({ hasText: new RegExp(`^${label}$`, "u") });
  await expect(option).toBeVisible();
  await option.click();
  await expect(combobox).toContainText(label);
}

export async function chooseSelectInField(field: Locator, page: Page, label: string): Promise<void> {
  await field.getByRole("combobox").click();
  await page.locator('[role="option"]').filter({ hasText: new RegExp(`^${label}$`, "u") }).click();
}

export async function setSwitch(page: Page, target: string, checked: boolean): Promise<void> {
  const input = control(page, target).getByRole("switch");
  if ((await input.getAttribute("aria-checked")) !== String(checked)) await input.click();
  await expect(input).toHaveAttribute("aria-checked", String(checked));
}

export async function setCanvasSize(page: Page, width: number, height: number): Promise<void> {
  for (const [target, value] of [["canvas.size.width", width], ["canvas.size.height", height]] as const) {
    const input = control(page, target).locator("input");
    await input.fill(String(value));
    await input.press("Enter");
  }
}

export async function setTimelineDuration(page: Page, duration = "1s"): Promise<void> {
  await setSwitch(page, "panels.timeline.extended", true);
  await page.getByRole("button", { name: "Edit timeline duration" }).click();
  const editor = page.getByRole("textbox", { name: "timeline duration" });
  await editor.fill(duration);
  await editor.press("Enter");
  await expect(page.getByRole("slider", { name: "Playback position" })).toHaveAttribute(
    "aria-valuemax",
    String(Number.parseFloat(duration)),
  );
}

export async function pauseTimeline(page: Page): Promise<void> {
  const pause = page.getByRole("button", { name: "Pause playback" });
  if (await pause.isVisible()) await pause.click();
}

export async function downloadFrom(page: Page, buttonName: string | RegExp): Promise<Download> {
  const pending = page.waitForEvent("download", { timeout: 160_000 });
  await page.getByRole("button", { name: buttonName, exact: typeof buttonName === "string" }).click();
  return pending;
}

export async function withGpuPage<T>(hostPage: Page, run: (page: Page) => Promise<T>): Promise<T> {
  await openChromish(hostPage);
  const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader"], headless: true });
  const page = await browser.newPage({ acceptDownloads: true, viewport: { height: 720, width: 1280 } });
  try {
    await page.addInitScript(() => {
      Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
    });
    await page.goto(hostPage.url());
    await expect(page.locator("[data-toolcraft-chromish-canvas]")).toBeVisible();
    return await run(page as Page);
  } finally {
    await browser.close();
  }
}

export async function prepareGpuPage(page: Page): Promise<void> {
  await uploadVectorSvg(page);
  await waitForGpuCanvasReady(page);
  await pauseTimeline(page);
  await page.waitForTimeout(100);
}

export async function waitForGpuCanvasReady(page: Page): Promise<void> {
  await expect(page.locator(canvasSelector)).toHaveAttribute("data-chromish-renderer-ready", "true", { timeout: 25_000 });
  await expect.poll(async () => Number(await page.locator(canvasSelector).getAttribute("data-chromish-triangle-count"))).toBeGreaterThan(0);
}

export function oneSecondSchedule() {
  return Array.from({ length: 30 }, (_, index) => ({ durationSeconds: 1 / 30, index, timeSeconds: index / 30 }));
}

export async function inspectImage(page: Page, format: "png" | "jpg" = "png") {
  const download = await downloadFrom(page, "Export PNG");
  return inspectToolcraftImageDownload({ backgroundRgba, download, page });
}

export async function inspectImageFromDownload(page: Page, download: Download) {
  return inspectToolcraftImageDownload({ backgroundRgba, download, page });
}

export async function inspectOneSecondVideo(page: Page) {
  await setTimelineDuration(page);
  const download = await downloadFrom(page, "Export Video");
  return inspectToolcraftVideoDownload({ backgroundRgba, download, page, schedule: oneSecondSchedule() });
}

export async function inspectVideoFromDownload(page: Page, download: Download) {
  return inspectToolcraftVideoDownload({ backgroundRgba, download, page, schedule: oneSecondSchedule() });
}

export async function createProofSession(page: Page): Promise<ToolcraftBrowserProofSession> {
  return createToolcraftBrowserProofSession(page);
}

export async function proveControlChange(
  page: Page,
  target: string,
  requirementId: string,
  run: (field: Locator, currentPage: Page) => Promise<void>,
): Promise<ToolcraftBrowserProofSession> {
  const session = await createProofSession(page);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction(target, run),
    {
      requirementId,
      selector: `[data-toolcraft-control-target="${target}"] [data-slot="field"]`,
      stabilityIntervalMs: 20,
      stabilitySamples: 2,
      timeoutMs: 10_000,
    },
  );
  return session;
}

export function applicabilityCases(target: string): readonly ToolcraftControlApplicabilityCase[] {
  const materialVisibility: Record<string, readonly string[]> = {
    "chrome.exposure": ["chrome", "diamond", "plastic", "glass", "fire", "playdough"],
    "chrome.reflectionContrast": ["chrome", "diamond", "glass"],
    "chrome.roughness": ["chrome", "plastic", "playdough"],
    "chrome.studioRotation": ["chrome", "diamond", "glass"],
    "material.primaryColor": ["chrome", "plastic", "fire", "playdough"],
    "material.secondaryColor": ["plastic", "fire"],
  };
  const visibleMaterials = materialVisibility[target];
  if (visibleMaterials) {
    return [
      ["Chrome", "chrome"],
      ["Diamond", "diamond"],
      ["Shiny plastic", "plastic"],
      ["Glass", "glass"],
      ["Fire", "fire"],
      ["Playdough", "playdough"],
    ].map(([selectorOptionLabel, selectorValue]) => ({
      expectation: visibleMaterials.includes(selectorValue!) ? "visible" as const : "hidden" as const,
      selectorControlType: "select" as const,
      selectorLabel: "Finish",
      selectorOptionLabel: selectorOptionLabel!,
      selectorTarget: "material.type",
      selectorValue: selectorValue!,
      target,
    }));
  }
  const specifications: Record<string, readonly [string, "segmented" | "select" | "switch", readonly [string, boolean | string][]]> = {
    "appearance.background": ["export.includeBackground", "switch", [["Include", false], ["Include", true]]],
    "export.image.format": ["export.image.resolution", "select", [["2K", "2k"], ["4K", "4k"], ["8K", "8k"]]],
    "export.image.resolution": ["export.image.format", "select", [["PNG", "png"], ["JPG", "jpg"]]],
    "export.video.format": ["export.video.resolution", "select", [["Current", "current"], ["4K", "4k"]]],
    "export.video.resolution": ["export.video.format", "select", [["MP4", "mp4"], ["WebM", "webm"]]],
    "motion.startAngle": ["motion.direction", "select", [["Clockwise", "clockwise"], ["Counterclockwise", "counterclockwise"]]],
  };
  const specification = specifications[target];
  if (!specification) return [];
  const [selectorTarget, selectorControlType, values] = specification;
  return values.map(([selectorOptionLabel, selectorValue]) => ({
    expectation: "visible",
    selectorControlType,
    selectorLabel: selectorOptionLabel,
    selectorOptionLabel,
    selectorTarget,
    selectorValue,
    target,
  }));
}

export function applicabilityRequirementId(base: string, applicabilityCase: ToolcraftControlApplicabilityCase): string {
  return getToolcraftApplicabilityRequirementId(base, applicabilityCase);
}

export async function selectApplicabilityCase(
  session: ToolcraftBrowserProofSession,
  applicabilityCase: ToolcraftControlApplicabilityCase,
  baseRequirementId: string,
): Promise<void> {
  const action = session.controlAction(applicabilityCase.selectorTarget, async (field, page) => {
    const label = applicabilityCase.selectorOptionLabel;
    if (applicabilityCase.selectorControlType === "switch") {
      const toggle = field.getByRole("switch");
      if ((await toggle.getAttribute("aria-checked")) !== String(applicabilityCase.selectorValue)) await toggle.click();
    } else if (applicabilityCase.selectorControlType === "segmented" && label) {
      await field.getByRole("button", { name: label, exact: true }).click();
    } else if (applicabilityCase.selectorControlType === "select" && label) {
      await chooseSelectInField(field, page, label);
    } else {
      throw new Error(`Unsupported Chromish applicability selector ${applicabilityCase.selectorControlType}`);
    }
  });
  await expectToolcraftControlApplicabilityState(session, action, applicabilityCase, { baseRequirementId });
}

export async function proveApplicabilityControlChange(
  page: Page,
  target: string,
  baseRequirementId: string,
  applicabilityCase: ToolcraftControlApplicabilityCase,
  run: (field: Locator, currentPage: Page) => Promise<void>,
): Promise<void> {
  const session = await createProofSession(page);
  await selectApplicabilityCase(session, applicabilityCase, baseRequirementId);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction(target, run),
    {
      requirementId: applicabilityRequirementId(baseRequirementId, applicabilityCase),
      selector: target === "appearance.background"
        ? `[data-toolcraft-control-target="${target}"] input[type="text"]`
        : `[data-toolcraft-control-target="${target}"] [data-slot="field"]`,
      stabilityIntervalMs: 20,
      stabilitySamples: 2,
      timeoutMs: 10_000,
    },
  );
}
