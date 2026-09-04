/** Cheap rasterized exit-surface approximation, not a per-pixel mesh search. */
export const OPTICAL_EXIT_SHADER_WGSL = /* wgsl */ `
struct ExitScene { viewProjection: mat4x4f, model: mat4x4f, tile: vec4f, cameraPosition: vec4f }
@group(0) @binding(0) var<uniform> exitScene: ExitScene;
struct ExitVertex {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) world: vec3f,
}
@vertex fn vs_main(@location(0) position: vec3f, @location(1) normal: vec3f) -> ExitVertex {
  let world = exitScene.model * vec4f(position, 1.0);
  let clip = exitScene.viewProjection * world;
  var output: ExitVertex;
  output.position = vec4f((clip.xy / clip.w - exitScene.tile.xy) / exitScene.tile.zw * clip.w, clip.z, clip.w);
  output.normal = (exitScene.model * vec4f(normal, 0.0)).xyz;
  output.world = world.xyz;
  return output;
}
@fragment fn fs_main(input: ExitVertex) -> @location(0) vec4f {
  return vec4f(normalize(input.normal), distance(input.world, exitScene.cameraPosition.xyz));
}
`;
