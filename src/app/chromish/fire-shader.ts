export const FIRE_NOISE_WGSL = /* wgsl */ `
fn fireHash(p: vec3f) -> f32 {
  let wrapped = p - floor(p / 16.0) * 16.0;
  return fract(sin(dot(wrapped, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
}
fn fireNoise(p: vec3f) -> f32 {
  let cell = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(fireHash(cell), fireHash(cell + vec3f(1,0,0)), u.x), mix(fireHash(cell + vec3f(0,1,0)), fireHash(cell + vec3f(1,1,0)), u.x), u.y),
    mix(mix(fireHash(cell + vec3f(0,0,1)), fireHash(cell + vec3f(1,0,1)), u.x), mix(fireHash(cell + vec3f(0,1,1)), fireHash(cell + vec3f(1,1,1)), u.x), u.y), u.z);
}
fn fireFbm(p: vec3f) -> f32 {
  return fireNoise(p) * 0.68 + fireNoise(p * 2.0 + vec3f(3, 0, 7)) * 0.32;
}
fn combustionColor(heat: f32) -> vec3f {
  let red = vec3f(1.1, 0.016, 0.0004);
  let orange = vec3f(3.8, 0.32, 0.003);
  let yellow = vec3f(7.0, 2.6, 0.16);
  let white = vec3f(8.5, 5.2, 1.5);
  let warm = mix(red, orange, smoothstep(0.04, 0.48, heat));
  let hot = mix(warm, yellow, smoothstep(0.48, 0.83, heat));
  return mix(hot, white, smoothstep(0.84, 1.0, heat));
}
`;

/** Mesh supplies the tongues; a fixed local gather softens their burning edges. */
export const FIRE_COMPOSITE_WGSL = /* wgsl */ `

fn fireSource(uv: vec2f) -> vec4f {
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec4f(0.0); }
  return textureSampleLevel(sceneTexture, sceneSampler, uv, 0.0);
}
fn composeFire(uv: vec2f, base: vec4f) -> vec4f {
  let fullUv = tone.backgroundTile.xy + uv * tone.backgroundTile.zw;
  let phase = tone.fireInfo.x;
  let aspect = tone.backgroundInfo.x / max(tone.backgroundInfo.y, 1.0);
  let p = vec3f(fullUv.x * aspect * 36.0, fullUv.y * 18.0 + phase * 2.54647909, 0.75);
  let flow = fireFbm(p);
  let curl = sin(fullUv.y * 95.0 + phase * 4.0 + flow * 5.0);
  let offset = vec2f(curl * 0.007 / aspect, (flow - 0.45) * 0.012) / tone.backgroundTile.zw;
  let source = fireSource(uv + offset);
  // Only hot upper material is advected; preserve the recognizable base.
  let hot = smoothstep(0.8, 2.0, max(base.g, source.g));
  let body = mix(base, source, hot * 0.85);
  let radius = vec2f(0.004 / aspect, 0.004) / tone.backgroundTile.zw;
  let a = fireSource(uv + offset + vec2f(radius.x, 0.0));
  let b = fireSource(uv + offset - vec2f(radius.x, 0.0));
  let c = fireSource(uv + offset + vec2f(0.0, radius.y));
  let d = fireSource(uv + offset - vec2f(0.0, radius.y));
  let glow = (a + b + c + d) * 0.25;
  let veil = glow.a * 0.3 * tone.fireInfo.z * (1.0 - body.a);
  let alpha = body.a + veil;
  let color = (body.rgb + glow.rgb * veil / max(glow.a, 0.001)) / max(alpha, 0.001);
  return vec4f(color, alpha);
}
`;
