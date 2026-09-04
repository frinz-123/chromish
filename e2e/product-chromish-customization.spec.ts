import fs from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "./toolcraft-product-test";
import { customizationTargets, materialKnobs, materialKnobTarget, materialNames } from "../src/app/chromish/customization";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { canvasSelector, chooseSelect, control, createProofSession, observeChromishCanvasRaster, prepareGpuPage, waitForGpuCanvasReady, withGpuPage } from "./product-chromish-test-support";

const labels = { chrome: "Chrome", diamond: "Diamond", glass: "Glass", plastic: "Shiny plastic", fire: "Fire", playdough: "Playdough" };

for (const target of customizationTargets) {
  test(`browser: chromish ${target}`, async ({ page }) => {
    test.setTimeout(120_000);
    await withGpuPage(page, async gpuPage => {
      await gpuPage.setViewportSize({ width: 1920, height: 1080 });
      const session = await createProofSession(gpuPage);
      await prepareGpuPage(gpuPage);
      const material = /^material\.([^.]+)\./u.exec(target)?.[1] as keyof typeof labels | undefined;
      if (material) await chooseSelect(gpuPage, "material.type", labels[material]);
      const drag = async () => {
        const field = control(gpuPage, target);
        const slider = field.getByRole("slider");
        const thumb = field.locator('[data-slot="slider-thumb"]');
        await thumb.scrollIntoViewIfNeeded();
        const box = (await field.locator('[data-slot="slider-track"]').boundingBox())!;
        const thumbBox = (await thumb.boundingBox())!;
        const before = await slider.inputValue();
        const min = Number(await slider.getAttribute("min"));
        const max = Number(await slider.getAttribute("max"));
        const destination = (Number(before) - min) / (max - min) > 0.7 ? 0.2 : 0.85;
        await gpuPage.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
        await gpuPage.mouse.down();
        await gpuPage.mouse.move(box.x + box.width * destination, box.y + box.height / 2, { steps: 6 });
        // Both value and canvas are observed with the pointer still down.
        await expect(slider).not.toHaveValue(before);
      };
      await expectToolcraftProductObservableToChange(session, session.controlAction(target, drag), { requirementId: target, selector: canvasSelector, stabilitySamples: 2, stabilityIntervalMs: 30 });
      await gpuPage.mouse.up();
    });
  });
}

test("material controls: all six visibility branches and independent values survive reload", async ({ page }) => {
  test.setTimeout(240_000);
  await withGpuPage(page, async gpuPage => {
    await gpuPage.setViewportSize({ width: 1920, height: 1080 });
    await prepareGpuPage(gpuPage);
    for (const material of materialNames) {
      await chooseSelect(gpuPage, "material.type", labels[material]);
      for (const other of materialNames) for (const item of materialKnobs[other]) {
        const field = control(gpuPage, materialKnobTarget(other, item.key));
        if (other === material) await expect(field).toHaveCount(1);
        else await expect(field).toHaveCount(0);
      }
      // Keep transmission until last so absorption is tested while light still
      // passes through the object. The wider viewport excludes floating UI.
      const knobs = [...materialKnobs[material]].sort((a, b) => Number(a.key === "transmission") - Number(b.key === "transmission"));
      for (const item of knobs) {
        const slider = control(gpuPage, materialKnobTarget(material, item.key)).getByRole("slider");
        await expectToolcraftProductObservableToChange(gpuPage, () => slider.press(item.defaultValue === item.max ? "Home" : "End"), { selector: canvasSelector, stabilitySamples: 2, stabilityIntervalMs: 30 });
        await expect(slider).toHaveValue(String(item.defaultValue === item.max ? item.min : item.max));
      }
    }
    for (const target of ["composition.scale", "composition.fov", "composition.saturation"]) await expectToolcraftProductObservableToChange(gpuPage, () => control(gpuPage, target).getByRole("slider").press("End"), { selector: canvasSelector, stabilitySamples: 2, stabilityIntervalMs: 30 });
    // Runtime persistence owns the write; a genuine reload verifies its result.
    await expect(gpuPage.locator('[data-toolcraft-persistence-status]')).toHaveAttribute("data-toolcraft-persistence-status", "success");
    const beforeReload = await observeChromishCanvasRaster(gpuPage, 128);
    const beforeParameters = await gpuPage.evaluate("(async()=>{const {getChromishRuntimeSnapshot}=await import('/src/app/chromish/runtime-store.ts');return getChromishRuntimeSnapshot()?.parameters;})()");
    await fs.mkdir(".toolcraft/browser-artifacts", { recursive: true });
    await gpuPage.locator(canvasSelector).screenshot({ path: ".toolcraft/browser-artifacts/customization-before-reload.png" });
    await gpuPage.reload();
    await waitForGpuCanvasReady(gpuPage);
    await expect(gpuPage.locator(canvasSelector)).toHaveAttribute("data-chromish-mesh-route", "vector");
    const afterParameters = await gpuPage.evaluate("(async()=>{const {getChromishRuntimeSnapshot}=await import('/src/app/chromish/runtime-store.ts');return getChromishRuntimeSnapshot()?.parameters;})()");
    await fs.writeFile(".toolcraft/browser-artifacts/customization-reload.json", JSON.stringify({ beforeParameters, afterParameters }, null, 2));
    await gpuPage.locator(canvasSelector).screenshot({ path: ".toolcraft/browser-artifacts/customization-after-reload.png" });
    expect(afterParameters).toEqual(beforeParameters);
    await expect.poll(async () => (await observeChromishCanvasRaster(gpuPage, 128)).hash).toBe(beforeReload.hash);
    for (const [target, value] of [["composition.scale", "1.8"], ["composition.fov", "65"], ["composition.saturation", "2"]]) await expect(control(gpuPage, target!).getByRole("slider")).toHaveValue(value!);
    for (const material of materialNames) {
      await chooseSelect(gpuPage, "material.type", labels[material]);
      for (const item of materialKnobs[material]) await expect(control(gpuPage, materialKnobTarget(material, item.key)).getByRole("slider")).toHaveValue(String(item.defaultValue === item.max ? item.min : item.max));
    }
  });
});

test("native customization: every knob changes pixels and Chrome has shaped reflections", async ({ page }) => {
  test.setTimeout(120_000);
  await withGpuPage(page, async gpuPage => {
    const errors: string[] = [];
    gpuPage.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const result = await gpuPage.evaluate(`(async () => {
      const { ChromishVgpuRenderer } = await import('/src/app/chromish/vgpu-renderer.ts');
      const { buildChromishMesh } = await import('/src/app/chromish/svg-mesh.ts');
      const { materialNames, materialKnobs, defaultMaterialSettings } = await import('/src/app/chromish/customization.ts');
      const mesh = await buildChromishMesh('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><path d="M100 8L175 65L152 195L100 230L48 195L25 65Z"/></svg>', { depth: 0.5, bevel: 0.1, detail: 'fine' });
      const canvas = document.createElement('canvas'); document.body.append(canvas);
      const renderer = await ChromishVgpuRenderer.create(canvas, [512,512]); renderer.setMesh(mesh);
      const { CHROME_STUDIO_WGSL } = await import('/src/app/chromish/chrome-shader.ts');
      const helper=CHROME_STUDIO_WGSL.slice(0,CHROME_STUDIO_WGSL.indexOf('fn chromeEnvironment'));
      const device=renderer.gpu.gpu;
      const buffer=device.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
      const read=device.createBuffer({size:16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      const module=device.createShaderModule({code:helper+' @group(0) @binding(0) var<storage,read_write> values: array<f32>; @compute @workgroup_size(4) fn main(@builtin(global_invocation_id) id:vec3u){values[id.x]=chromeSoftbox(vec3f(0.6,0,0.8),0.2,0.32,0.1+f32(id.x)*0.3);}'});
      const pipeline=device.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});
      const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer}}]});
      const encoder=device.createCommandEncoder();const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();encoder.copyBufferToBuffer(buffer,0,read,0,16);device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);const softboxValues=Array.from(new Float32Array(read.getMappedRange().slice(0)));read.unmap();read.destroy();buffer.destroy();
      const output = document.createElement('canvas'); output.width=512; output.height=512;
      const context=output.getContext('2d', {willReadFrequently:true});
      const settings = { background:'#050509', backgroundImageSize:[1,1], cameraPosition:[0.2,0.25,4.5], cameraUp:[0,1,0], exposure:1, includeBackground:true, includeBackgroundImage:false, loopPhaseRadians:1.7, material:'chrome', primaryColor:'#E6ECEF', reflectionContrast:1.3, roughness:0.12, rotationRadians:0.5, secondaryColor:'#FFD429', studioRotationRadians:0.31 };
      const render = async () => { await renderer.renderToContext(context, settings,512,512); return context.getImageData(0,0,512,512).data; };
      const diff=(a,b)=>{let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>3)changed++;return changed;};
      const coverage=(pixels)=>{let n=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>30)n++;return n;};
      const changes=[]; let image;
      for(const material of materialNames) {
        settings.material=material; settings.materialSettings=defaultMaterialSettings(material);
        const baseline=await render(); if(material==='chrome')image=output.toDataURL();
        for(let i=0;i<4;i++) {
          const item=materialKnobs[material][i];
          settings.materialSettings=[...defaultMaterialSettings(material)];
          settings.materialSettings[i]=item.defaultValue===item.max?item.min:item.max;
          changes.push({target:'material.'+material+'.'+item.key,changed:diff(baseline,await render())});
        }
      }
      settings.material='chrome';settings.materialSettings=defaultMaterialSettings('chrome');
      const baseline=await render();
      const framing={baseline:coverage(baseline)};
      for(const [key,value] of [['objectScale',1.6],['fieldOfView',60],['saturation',0]]) {
        settings[key]=value;const pixels=await render();framing[key]=coverage(pixels);changes.push({target:key,changed:diff(baseline,pixels)});delete settings[key];
      }
      settings.roughness=0.45;const roughnessChange=diff(baseline,await render());
      renderer.dispose();canvas.remove();return {changes,image,softboxValues,framing,roughnessChange};
    })()`);
    await fs.mkdir(".toolcraft/browser-artifacts", { recursive: true });
    await fs.writeFile(".toolcraft/browser-artifacts/chrome-studio.png", Buffer.from(result.image.split(",")[1], "base64"));
    for (const item of result.changes) expect(item.changed, item.target).toBeGreaterThan(20);
    expect(result.changes).toHaveLength(27);
    expect(result.framing.objectScale).toBeGreaterThan(result.framing.baseline * 1.5);
    expect(result.framing.fieldOfView).toBeLessThan(result.framing.baseline * 0.6);
    expect(result.roughnessChange).toBeGreaterThan(100);
    result.softboxValues.forEach((value: number, i: number) => {
      const softness = 0.1 + i * 0.3;
      const t = Math.max(0, Math.min(1, (Math.atan2(0.8, 0.6) - 0.2 - (0.32 - softness * 0.25)) / (softness * 1.25)));
      expect(value).toBeCloseTo(1 - t * t * (3 - 2 * t), 5);
    });
    expect(errors).toEqual([]);
  });
});
