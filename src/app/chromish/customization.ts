export type ChromishMaterial = "chrome" | "diamond" | "plastic" | "glass" | "fire" | "playdough";
type Knob = Readonly<{ key: string; label: string; description: string; min: number; max: number; step: number; defaultValue: number }>;
const knob = (key: string, label: string, description: string, min: number, max: number, defaultValue: number, step = 0.05): Knob => ({ key, label, description, min, max, defaultValue, step });

/** Order is the vec4 ABI shared by preview, picking and exported shader kits. */
export const materialKnobs: Record<ChromishMaterial, readonly [Knob, Knob, Knob, Knob]> = {
  chrome: [
    knob("reflectivity", "Reflectivity", "Strength of the reflected studio and uploaded environment.", 0.2, 2, 1),
    knob("softness", "Light softness", "Broadens the edges of reflected softboxes without blurring the silhouette.", 0, 1, 0.15),
    knob("brushing", "Brushed finish", "Directional micro-grooves break up the mirror reflection.", 0, 1, 0),
    knob("edge", "Edge highlights", "Grazing-angle silver highlights along curved and beveled edges.", 0, 2, 0.7),
  ],
  diamond: [
    knob("ior", "Refraction index", "Bends light through the cut facets; diamond is about 2.42.", 1.5, 2.8, 2.42, 0.01),
    knob("dispersion", "Dispersion", "Separates red, green and blue rays at facet edges.", 0, 0.16, 0.065, 0.005),
    knob("transmission", "Transmission", "Balances light through the gem against its reflected studio.", 0, 1, 1),
    knob("absorption", "Absorption", "Darkens longer light paths through the stone, strengthening depth.", 0, 4, 0.1),
  ],
  glass: [
    knob("ior", "Refraction index", "Controls bending through the glass; ordinary glass is about 1.52.", 1.05, 2.2, 1.52, 0.01),
    knob("dispersion", "Dispersion", "Adds prismatic color separation around refracted edges.", 0, 0.12, 0.01, 0.005),
    knob("transmission", "Transmission", "Balances the visible background against reflected light.", 0, 1, 1),
    knob("absorption", "Absorption", "Adds thickness-dependent blue-green absorption inside the glass.", 0, 4, 0.2),
  ],
  plastic: [
    knob("coat", "Clear coat", "Adds a white glossy studio reflection above the colored plastic.", 0, 1, 0.25),
    knob("specular", "Highlight strength", "Intensity of the accent-colored specular highlight.", 0, 3, 1),
    knob("wrap", "Light wrap", "Softens shadow transitions for a translucent molded-plastic feel.", 0, 1, 0.15),
    knob("sheen", "Edge sheen", "Accent-colored sheen at grazing viewing angles.", 0, 2, 0.35),
  ],
  fire: [
    knob("height", "Flame height", "Stretches the upper mesh into tongues of flame; the base stays anchored.", 0, 2, 1),
    knob("curl", "Turbulence", "Sideways and depth-wise curl of the flame mesh.", 0, 2, 1),
    knob("heat", "Heat", "Moves the burning surface from deep orange toward a yellow-white core.", 0.4, 1.8, 1),
    knob("glow", "Edge glow", "Intensity of the small soft halo around the flames.", 0, 2, 1),
  ],
  playdough: [
    knob("grain", "Surface grain", "Fine mottling gives the clay a handmade surface.", 0, 1, 0.2),
    knob("wrap", "Light wrap", "Spreads illumination around the clay's rounded contours.", 0, 1, 0.45),
    knob("sheen", "Soft sheen", "Broad soft reflections from a smooth or freshly kneaded surface.", 0, 2, 0.35),
    knob("textureScale", "Grain size", "Changes the scale of the clay mottling; visible when Surface grain is above zero.", 0.3, 3, 1),
  ],
};
export const materialTitles: Record<ChromishMaterial, string> = { chrome: "Chrome surface", diamond: "Diamond optics", glass: "Glass optics", plastic: "Plastic surface", fire: "Combustion", playdough: "Clay surface" };
export const materialNames = Object.keys(materialKnobs) as ChromishMaterial[];
export const materialKnobTarget = (material: ChromishMaterial, key: string) => `material.${material}.${key}`;
export const compositionKnobs = [
  knob("scale", "Object scale", "Scales the object around its center without changing the source geometry.", 0.4, 1.8, 1),
  knob("fov", "Field of view", "A narrow lens flattens perspective; a wide lens exaggerates depth and leaves more surrounding space.", 20, 65, 33, 1),
  knob("saturation", "Saturation", "Grades the rendered object only, leaving the uploaded background unchanged.", 0, 2, 1),
] as const;
export const customizationTargets = [...materialNames.flatMap((material) => materialKnobs[material].map(({ key }) => materialKnobTarget(material, key))), ...compositionKnobs.map(({ key }) => `composition.${key}`)];
export type MaterialSettings = readonly [number, number, number, number];
export function defaultMaterialSettings(material: ChromishMaterial): MaterialSettings {
  return materialKnobs[material].map(({ defaultValue }) => defaultValue) as unknown as MaterialSettings;
}
function readKnob(values: Readonly<Record<string, unknown>>, target: string, item: Knob): number {
  const value = values[target];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(item.min, Math.min(item.max, value)) : item.defaultValue;
}
export function readCustomization(values: Readonly<Record<string, unknown>>, material: ChromishMaterial) {
  return {
    materialSettings: materialKnobs[material].map((item) => readKnob(values, materialKnobTarget(material, item.key), item)) as unknown as MaterialSettings,
    objectScale: readKnob(values, "composition.scale", compositionKnobs[0]),
    fieldOfView: readKnob(values, "composition.fov", compositionKnobs[1]),
    saturation: readKnob(values, "composition.saturation", compositionKnobs[2]),
  };
}
