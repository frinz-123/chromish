export const OPTICAL_SHADER_WGSL = /* wgsl */ `
@group(0) @binding(3) var exitTexture: texture_2d<f32>;
// A dark studio with real angular softbox shapes, not stripes painted on the mesh.
fn opticalEnvironment(direction: vec3f) -> vec3f {
  let q = rotateY(normalize(direction), scene.controls.y);
  let azimuth = atan2(q.z, q.x);
  let key = (1.0 - smoothstep(0.52, 0.56, abs(atan2(sin(azimuth + 1.1), cos(azimuth + 1.1)))))
    * (1.0 - smoothstep(0.72, 0.77, abs(q.y - 0.12)));
  let strip = (1.0 - smoothstep(0.4, 0.43, abs(atan2(sin(azimuth - 1.85), cos(azimuth - 1.85)))))
    * (1.0 - smoothstep(0.8, 0.85, abs(q.y)));
  let ceiling = smoothstep(0.78, 0.83, q.y);
  let side = (1.0 - smoothstep(0.38, 0.42, abs(atan2(sin(azimuth + 2.65), cos(azimuth + 2.65)))))
    * (1.0 - smoothstep(0.65, 0.72, abs(q.y + 0.1)));
  let rim = pow(max(dot(q, normalize(vec3f(-0.3, -0.2, -1.0))), 0.0), 48.0);
  var light = vec3f(0.018, 0.02, 0.025) + key * vec3f(6.0, 6.0, 6.0)
    + strip * vec3f(7.0, 6.8, 6.3) + side * vec3f(5.5) + ceiling * vec3f(3.0, 3.2, 3.5) + rim * vec3f(0.2, 0.25, 0.4);
  if (scene.backgroundColorAndMode.a > 0.5) {
    let envUv = vec2f(atan2(q.z, q.x) / 6.2831853 + 0.5, acos(clamp(q.y, -1.0, 1.0)) / 3.14159265);
    let photo = textureSampleLevel(backgroundTexture, backgroundSampler, envUv, 0.0).rgb;
    light += pow(photo, vec3f(2.2)) * 0.42;
  }
  return light * scene.controls.x;
}


// Constant work per fragment: no triangle searches, storage reads, or bounce loops.
fn opticalBackdrop(position: vec3f, direction: vec3f, thickness: f32) -> vec3f {
  let distant = position + direction * thickness;
  let clip = scene.viewProjection * vec4f(distant, 1.0);
  var uv = vec2f(clip.x / clip.w * 0.5 + 0.5, 0.5 - clip.y / clip.w * 0.5);
  let outputAspect = scene.backgroundInfo.x / max(scene.backgroundInfo.y, 1.0);
  let imageAspect = scene.backgroundInfo.z / max(scene.backgroundInfo.w, 1.0);
  if (imageAspect > outputAspect) { uv.x = 0.5 + (uv.x - 0.5) * outputAspect / imageAspect; }
  else { uv.y = 0.5 + (uv.y - 0.5) * imageAspect / outputAspect; }
  if (scene.backgroundColorAndMode.a > 0.5) {
    return pow(textureSampleLevel(backgroundTexture, backgroundSampler, clamp(uv, vec2f(0.001), vec2f(0.999)), 0.0).rgb, vec3f(2.2));
  }
  return scene.backgroundColorAndMode.rgb;
}

fn transmittedDirection(incoming: vec3f, normal: vec3f, exitNormal: vec3f, ior: f32) -> vec3f {
  let inside = refract(incoming, normal, 1.0 / ior);
  let outside = refract(inside, -exitNormal, ior);
  // A single analytic internal reflection represents trapped pavilion light.
  return normalize(select(reflect(inside, exitNormal), outside, dot(outside, outside) > 0.0001));
}

fn shadeOptical(input: VertexOutput, diamond: bool) -> vec4f {
  let rotation = mat3x3f(normalize(scene.model[0].xyz), normalize(scene.model[1].xyz), normalize(scene.model[2].xyz));
  let incoming = transpose(rotation) * normalize(input.worldPosition - scene.cameraPosition.xyz);
  var normal = normalize(transpose(rotation) * input.worldNormal);
  if (dot(incoming, normal) > 0.0) { normal = -normal; }
  let ior = scene.materialSettings.x;
  let fresnel = dielectricFresnel(ior, dot(-incoming, normal));
  let pavilion = normalize(vec3f(normal.xy * 0.65, -sign(normal.z + 0.00001) * 0.76));
  let exitSample = textureSampleLevel(exitTexture, backgroundSampler, input.position.xy / (scene.backgroundInfo.xy * scene.backgroundTile.zw), 0.0);
  let fallbackExit = select(-normal, pavilion, diamond);
  var exitNormal = fallbackExit;
  if (exitSample.a > 0.0 && dot(exitSample.xyz, exitSample.xyz) > 0.01) {
    exitNormal = normalize(transpose(rotation) * exitSample.xyz);
    if (dot(exitNormal, incoming) < 0.0) { exitNormal = -exitNormal; }
  }
  let dispersion = scene.materialSettings.y;
  let redRay = transmittedDirection(incoming, normal, exitNormal, max(1.001, ior - dispersion));
  let greenRay = transmittedDirection(incoming, normal, exitNormal, ior);
  let blueRay = transmittedDirection(incoming, normal, exitNormal, ior + dispersion);
  let transmitted = vec3f(opticalEnvironment(rotation * redRay).r, opticalEnvironment(rotation * greenRay).g, opticalEnvironment(rotation * blueRay).b);
  let reflection = opticalEnvironment(rotation * reflect(incoming, normal));
  let thickness = scene.optics.x / max(abs(refract(incoming, normal, 1.0 / ior).z), 0.25);
  let backdrop = opticalBackdrop(input.worldPosition, rotation * greenRay, thickness);
  let transmission = mix(backdrop, transmitted, select(0.18, 0.88, diamond));
  let absorption = exp(-thickness * select(vec3f(0.6, 0.2, 0.09), vec3f(0.35), diamond) * scene.materialSettings.w);
  let through = transmission * absorption;
  return vec4f(reflection * fresnel + mix(reflection, through, scene.materialSettings.z) * (1.0 - fresnel), 1.0);
}
`;
