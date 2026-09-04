import { OPTICAL_SHADER_WGSL } from "./optical-shader";
import { FIRE_NOISE_WGSL } from "./fire-shader";
import { FIRE_DEFORMATION_WGSL } from "./fire-mesh";
import { CHROME_STUDIO_WGSL } from "./chrome-shader";

export const CHROME_SHADER_WGSL = /* wgsl */ `
struct SceneUniforms {
  viewProjection: mat4x4f,
  model: mat4x4f,
  tintRoughness: vec4f,
  secondaryColor: vec4f,
  controls: vec4f,
  materialSettings: vec4f,
  optics: vec4f,
  backgroundColorAndMode: vec4f,
  backgroundInfo: vec4f,
  backgroundTile: vec4f,
  cameraPosition: vec4f,
  tile: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var backgroundTexture: texture_2d<f32>;
@group(0) @binding(2) var backgroundSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) worldNormal: vec3f,
  @location(2) objectPosition: vec3f,
}

${FIRE_NOISE_WGSL}

${FIRE_DEFORMATION_WGSL}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
) -> VertexOutput {
  var deformed = position;
  if (scene.controls.z > 3.5 && scene.controls.z < 4.5) {
    deformed = fireDeformedPosition(position, scene.controls.w, scene.optics.y, scene.optics.z);
    deformed = position + (deformed - position) * vec3f(scene.materialSettings.y, scene.materialSettings.x, scene.materialSettings.y);
  }
  let world = scene.model * vec4f(deformed, 1.0);
  let clip = scene.viewProjection * world;
  let fullNdc = clip.xy / clip.w;
  let localNdc = (fullNdc - scene.tile.xy) / scene.tile.zw;
  var output: VertexOutput;
  output.position = vec4f(localNdc * clip.w, clip.z, clip.w);
  output.worldPosition = world.xyz;
  output.worldNormal = normalize((scene.model * vec4f(normal, 0.0)).xyz);
  output.objectPosition = position;
  return output;
}

fn rotateY(value: vec3f, angle: f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return vec3f(c * value.x + s * value.z, value.y, -s * value.x + c * value.z);
}

${CHROME_STUDIO_WGSL}

fn dielectricFresnel(ior: f32, facing: f32) -> f32 {
  let f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  return f0 + (1.0 - f0) * pow(1.0 - clamp(facing, 0.0, 1.0), 5.0);
}

${OPTICAL_SHADER_WGSL}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let n = normalize(input.worldNormal);
  let v = normalize(scene.cameraPosition.xyz - input.worldPosition);
  let reflected = reflect(-v, n);
  let roughness = scene.tintRoughness.w;
  let settings = scene.materialSettings;
  let tint = scene.tintRoughness.xyz;
  let accent = scene.secondaryColor.xyz;
  let material = scene.controls.z;
  let time = scene.controls.w;
  let fresnel = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  if (material < 0.5) {
    let grainPhase = input.objectPosition.y * 180.0;
    let groove = sin(grainPhase) / (1.0 + fwidth(grainPhase) * 2.0);
    let brushedNormal = normalize(n + vec3f(0.0, groove * settings.z * 0.24, 0.0));
    let environment = chromeEnvironment(reflect(-v, brushedNormal), roughness, settings.y);
    let conductor = mix(tint * 0.88, vec3f(1.0), fresnel);
    return vec4f(environment * conductor * settings.x + fresnel * tint * settings.w, 1.0);
  }
  if (material < 1.5) { return shadeOptical(input, true); }
  if (material < 2.5) {
    let light = normalize(vec3f(-0.45, 0.75, 0.6));
    let diffuse = 0.18 + clamp((dot(n, light) + settings.z) / (1.0 + settings.z), 0.0, 1.0) * 0.82;
    let highlight = pow(max(dot(reflect(-light, n), v), 0.0), mix(96.0, 18.0, roughness));
    let coat = opticalEnvironment(reflected) * (0.04 + fresnel * 0.5) * settings.x;
    return vec4f(tint * diffuse + accent * highlight * 1.8 * settings.y + fresnel * accent * settings.w + coat, 1.0);
  }
  if (material < 3.5) { return shadeOptical(input, false); }
  if (material < 4.5) {
    let p = vec3f(input.objectPosition.x * 4.2, -input.objectPosition.y * 1.5 + time * 2.54647909, input.objectPosition.z * 4.2);
    let flow = fireFbm(p);
    let height = smoothstep(scene.optics.y, scene.optics.z, input.objectPosition.y);
    let heat = clamp((0.24 + height * 0.58 + (flow - 0.5) * 0.8) * settings.z, 0.0, 1.0);
    let color = combustionColor(heat);
    let bodyTint = mix(vec3f(0.7), tint, 0.3);
    let coreTint = mix(vec3f(1.0), accent, 0.18);
    return vec4f(color * mix(bodyTint, coreTint, smoothstep(0.45, 0.85, heat)), 1.0);
  }
  let light = normalize(vec3f(-0.35, 0.8, 0.45));
  let wrap = clamp((dot(n, light) + settings.y) / (1.0 + settings.y), 0.0, 1.0);
  let grain = fireNoise(input.objectPosition * (18.0 / settings.w));
  let surface = 1.0 - settings.x * (0.15 + grain * 0.5);
  let softSpecular = pow(max(dot(reflect(-light, n), v), 0.0), 12.0) * (1.0 - roughness);
  return vec4f(tint * (0.42 + wrap * 0.72) * surface + softSpecular * vec3f(settings.z) + fresnel * tint * 0.2, 1.0);
}
`;
