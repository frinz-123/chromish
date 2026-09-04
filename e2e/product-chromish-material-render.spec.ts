import fs from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "./toolcraft-product-test";
import { withGpuPage } from "./product-chromish-test-support";

test("native material rendering: fire loop and guarded export tiles", async ({ page }) => {
  test.setTimeout(180_000);
  await withGpuPage(page, async (gpuPage) => {
    const errors: string[] = [];
    gpuPage.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const result = await gpuPage.evaluate(`(async () => {
      const { ChromishVgpuRenderer } = await import('/src/app/chromish/vgpu-renderer.ts');
      const { buildChromishMesh } = await import('/src/app/chromish/svg-mesh.ts');
      const canvas = document.createElement('canvas');
      canvas.width = 1100; canvas.height = 600;
      document.body.append(canvas);
      const renderer = await ChromishVgpuRenderer.create(canvas, [1100, 600]);
      const { FIRE_DEFORMATION_WGSL, fireDeformedPoint } = await import('/src/app/chromish/fire-mesh.ts');
      const device=renderer.gpu.gpu;
      const probe=device.createBuffer({size:256,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
      const read=device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      const module=device.createShaderModule({code:FIRE_DEFORMATION_WGSL+' @group(0) @binding(0) var<storage,read_write> points: array<vec4f>; @compute @workgroup_size(16) fn main(@builtin(global_invocation_id) id: vec3u) { let x=-1.0+f32(id.x)/8.0; let p=vec3f(x,1,0); points[id.x]=vec4f(p+(fireDeformedPosition(p,1.7,-1,1)-p)*vec3f(1.5,1.8,1.5),1); }'});
      const pipeline=device.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});
      const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:probe}}]});
      const encoder=device.createCommandEncoder();const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();encoder.copyBufferToBuffer(probe,0,read,0,256);device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);const points=new Float32Array(read.getMappedRange().slice(0));read.unmap();read.destroy();probe.destroy();
      let deformationError=0;
      for(let i=0;i<16;i++)fireDeformedPoint(-1+i/8,1,0,1.7,-1,1,[1.8,1.5]).forEach((value,axis)=>{deformationError=Math.max(deformationError,Math.abs(value-points[i*4+axis]));});
      const mesh = await buildChromishMesh('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120"><text x="10" y="100" font-size="110" font-weight="900" font-family="sans-serif">MUY</text></svg>', { bevel: 0.035, depth: 0.22, detail: 'balanced' });
      renderer.setMesh(mesh); renderer.resize(1100, 600);
      const settings = { background: '#050509', backgroundImageSize: [1,1], cameraPosition: [0,0,4.5], cameraUp: [0,1,0], exposure: 1, includeBackground: true, includeBackgroundImage: false, loopPhaseRadians: 0, material: 'fire', primaryColor: '#FF7900', reflectionContrast: 1.4, roughness: 0.12, rotationRadians: 0.15, secondaryColor: '#FFD429', studioRotationRadians: 0.31 };
      settings.materialSettings = [1.8,1.5,1.1,1.4];
      const output = document.createElement('canvas'); output.width = 1100; output.height = 600;
      const context = output.getContext('2d', { willReadFrequently: true });
      // Warm the pipelines, then copy each submitted swapchain image in the
      // same task: WebGPU clears it after browser presentation.
      await renderer.renderToContext(context, settings, 1100, 600);
      const capture = async phase => {
        settings.loopPhaseRadians = phase;
        renderer.render(settings);
        context.drawImage(canvas, 0, 0);
        return context.getImageData(0,0,output.width,output.height).data;
      };
      const start = await capture(0);
      const reference = output.toDataURL();
      const end = await capture(Math.PI * 2);
      const middle = await capture(1.7);
      const middleImage = output.toDataURL();
      settings.rotationRadians=0.8;
      await capture(1.7);
      const angledImage=output.toDataURL();
      settings.rotationRadians=0.15;
      // Put real emitting geometry across both 1024px tile boundaries.
      for (const part of [mesh,mesh.fire]) {
        for (let i=0;i<part.positions.length;i+=3) { part.positions[i]+=1; part.positions[i+1]-=1; }
        part.bounds={min:[part.bounds.min[0]+1,part.bounds.min[1]-1,part.bounds.min[2]],max:[part.bounds.max[0]+1,part.bounds.max[1]-1,part.bounds.max[2]]};
      }
      renderer.setMesh(mesh); renderer.resize(1100,1100);
      output.width=1100; output.height=1100;
      await renderer.renderToContext(context, settings, 1100, 1100);
      const tileStart = await capture(0);
      settings.loopPhaseRadians = 0;
      await renderer.renderToContext(context, settings, 1100, 1100);
      const exported = context.getImageData(0,0,1100,1100).data;
      const difference = (a,b) => { let sum=0, changed=0; for(let i=0;i<a.length;i+=4) { const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);sum+=d; if(d>30)changed++; } return { mean: sum/(a.length/4*3), changed }; };
      renderer.dispose(); canvas.remove();
      return { reference, middleImage, angledImage, deformationError, triangles:mesh.fire.triangleCount, seam: difference(start,end), animation: difference(start,middle), export: difference(tileStart,exported) };
    })()`);
    await fs.mkdir(".toolcraft/browser-artifacts", { recursive: true });
    await fs.writeFile(".toolcraft/browser-artifacts/fire-wordmark.png", Buffer.from(result.reference.split(",")[1], "base64"));
    await fs.writeFile(".toolcraft/browser-artifacts/fire-wordmark-middle.png", Buffer.from(result.middleImage.split(",")[1], "base64"));
    await fs.writeFile(".toolcraft/browser-artifacts/fire-wordmark-angled.png", Buffer.from(result.angledImage.split(",")[1], "base64"));
    expect(result.seam.mean).toBeLessThan(1);
    expect(result.deformationError).toBeLessThan(0.0001);
    expect(result.triangles).toBeGreaterThan(1000);
    expect(result.triangles).toBeLessThanOrEqual(100_000);
    expect(result.animation.changed).toBeGreaterThan(1000);
    expect(result.export.mean).toBeLessThan(2);
    expect(errors).toEqual([]);
  });
});
