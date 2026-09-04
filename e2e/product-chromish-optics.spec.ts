import fs from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "./toolcraft-product-test";
import { withGpuPage } from "./product-chromish-test-support";

test("native optics: cut geometry, changing reflections and clean GPU output", async ({ page }) => {
  test.setTimeout(120_000);
  await withGpuPage(page, async gpuPage => {
    const errors: string[] = [];
    gpuPage.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const result = await gpuPage.evaluate(`(async () => {
      const { ChromishVgpuRenderer } = await import('/src/app/chromish/vgpu-renderer.ts');
      const { buildChromishMesh } = await import('/src/app/chromish/svg-mesh.ts');
      const { OPTICAL_SHADER_WGSL } = await import('/src/app/chromish/optical-shader.ts');
      const mesh = await buildChromishMesh('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><path d="M100 8L175 65L152 195L100 230L48 195L25 65Z"/></svg>', { depth: 0.65, bevel: 0.12, detail: 'fine' });
      const canvas = document.createElement('canvas'); document.body.append(canvas);
      const renderer = await ChromishVgpuRenderer.create(canvas, [600,600]); renderer.setMesh(mesh);
      // Extract the exact shipped transmission function and compare a parallel
      // glass slab against its analytic result: exiting direction == incoming.
      const device=renderer.gpu.gpu;
      const helper=OPTICAL_SHADER_WGSL.slice(OPTICAL_SHADER_WGSL.indexOf('fn transmittedDirection'), OPTICAL_SHADER_WGSL.indexOf('fn shadeOptical'));
      const probe=device.createBuffer({size:32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
      const read=device.createBuffer({size:32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      const shader=device.createShaderModule({code:helper+' @group(0) @binding(0) var<storage,read_write> result: array<vec4f>; @compute @workgroup_size(1) fn main() { result[0]=vec4f(transmittedDirection(vec3f(0.6,0,-0.8),vec3f(0,0,1),vec3f(0,0,-1),1.52),1); result[1]=vec4f(transmittedDirection(vec3f(0,0,-1),vec3f(0,0,1),vec3f(0,0,-1),1.52),1); }'});
      const pipeline=device.createComputePipeline({layout:'auto',compute:{module:shader,entryPoint:'main'}});
      const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:probe}}]});
      const encoder=device.createCommandEncoder(); const pass=encoder.beginComputePass(); pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();encoder.copyBufferToBuffer(probe,0,read,0,32);device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);const directions=Array.from(new Float32Array(read.getMappedRange().slice(0)));read.unmap();read.destroy();probe.destroy();
      const output = document.createElement('canvas'); output.width=600; output.height=600;
      const context=output.getContext('2d', {willReadFrequently:true});
      const settings = { background:'#050509', backgroundImageSize:[1,1], cameraPosition:[0.2,0.25,4.5], cameraUp:[0,1,0], exposure:1, includeBackground:true, includeBackgroundImage:false, loopPhaseRadians:0, material:'diamond', primaryColor:'#E6ECEF', reflectionContrast:1.3, roughness:0.12, rotationRadians:0.5, secondaryColor:'#FFD429', studioRotationRadians:0.31 };
      const frames=[];
      for(const material of ['diamond','glass']) {
        settings.material=material;
        await renderer.renderToContext(context, settings, 600,600);
        const first=context.getImageData(0,0,600,600).data;
        const image=output.toDataURL();
        settings.studioRotationRadians+=0.8;
        await renderer.renderToContext(context, settings,600,600);
        const second=context.getImageData(0,0,600,600).data;
        let changed=0,bright=0;
        for(let i=0;i<first.length;i+=4) { if(first[i]>180 && first[i+1]>180 && first[i+2]>180) bright++; if(Math.abs(first[i]-second[i])+Math.abs(first[i+1]-second[i+1])+Math.abs(first[i+2]-second[i+2])>30)changed++; }
        frames.push({material,image,changed,bright});
      }
      renderer.dispose();canvas.remove();
      return {frames, directions, triangles:mesh.gem.triangleCount};
    })()`);
    await fs.mkdir(".toolcraft/browser-artifacts", { recursive: true });
    for (const frame of result.frames) {
      await fs.writeFile(`.toolcraft/browser-artifacts/${frame.material}-cut-realtime.png`, Buffer.from(frame.image.split(",")[1], "base64"));
      expect(frame.changed).toBeGreaterThan(500);
      expect(frame.bright).toBeGreaterThan(100);
    }
    expect(result.triangles).toBeGreaterThan(30);
    [0.6,0,-0.8,1,0,0,-1,1].forEach((expected, index) => expect(result.directions[index]).toBeCloseTo(expected, 5));
    expect(errors).toEqual([]);
  });
});
