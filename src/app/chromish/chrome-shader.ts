/** Analytic studio: fixed cost, angular softboxes broaden with roughness. */
export const CHROME_STUDIO_WGSL = /* wgsl */ `
fn chromeSoftbox(q: vec3f, center: f32, width: f32, softness: f32) -> f32 {
  let azimuth = atan2(q.z, q.x);
  let distance = abs(atan2(sin(azimuth - center), cos(azimuth - center)));
  return (1.0 - smoothstep(width - softness * 0.25, width + softness, distance))
    * (1.0 - smoothstep(0.62 - softness * 0.2, 0.94, abs(q.y)));
}
fn chromeEnvironment(direction: vec3f, roughness: f32, softness: f32) -> vec3f {
  let q = rotateY(normalize(direction), scene.controls.y);
  let blur = 0.025 + roughness * 1.2 + softness * 0.55;
  let key = chromeSoftbox(q, -1.1, 0.55, blur);
  let strip = chromeSoftbox(q, 1.8, 0.22, blur);
  let side = chromeSoftbox(q, -2.65, 0.35, blur);
  let ceiling = smoothstep(0.7 - blur, 0.86, q.y);
  let floorLight = smoothstep(0.25, 0.9, -q.y) * 0.18;
  let fill = chromeSoftbox(q, 0.2, 0.32, blur + 0.3);
  var light = vec3f(0.09, 0.1, 0.12) + fill * vec3f(0.65, 0.72, 0.8) + key * vec3f(3.5, 3.7, 4.0)
    + strip * vec3f(5.0, 4.7, 4.1) + side * vec3f(2.3, 2.6, 3.0)
    + ceiling * vec3f(1.4) + floorLight;
  if (scene.backgroundColorAndMode.a > 0.5) {
    let envUv = vec2f(atan2(q.z, q.x) / 6.2831853 + 0.5, acos(clamp(q.y, -1.0, 1.0)) / 3.14159265);
    light += pow(textureSampleLevel(backgroundTexture, backgroundSampler, envUv, 0.0).rgb, vec3f(2.2)) * 1.2;
  }
  return max(mix(vec3f(0.35), light, scene.controls.x), vec3f(0.005));
}
`;
