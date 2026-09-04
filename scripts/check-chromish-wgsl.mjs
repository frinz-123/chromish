import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = readFileSync(new URL("../src/app/chromish/vgpu-renderer.ts", import.meta.url), "utf8");
const shaderNames = ["CHROME_SHADER_WGSL", "TONE_MAP_SHADER_WGSL"];
const temporaryRoot = mkdtempSync(join(tmpdir(), "chromish-wgsl-"));

try {
  for (const shaderName of shaderNames) {
    const prefix = "export const " + shaderName + " = /* wgsl */ `";
    const start = source.indexOf(prefix);
    const end = start < 0 ? -1 : source.indexOf("`;", start + prefix.length);
    if (start < 0 || end < 0) throw new Error(`Could not extract ${shaderName}.`);
    const shader = source.slice(start + prefix.length, end);
    const shaderPath = join(temporaryRoot, `${shaderName.toLowerCase()}.wgsl`);
    writeFileSync(shaderPath, shader, "utf8");
    execFileSync(process.execPath, [
      join(process.cwd(), "node_modules/vgpu/bin/vgpu.js"),
      "check",
      shaderPath,
      "--require-validation",
    ], { stdio: "inherit" });
  }
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
