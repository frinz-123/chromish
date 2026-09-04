"use client";

import * as React from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
} from "three";

import type { ToolcraftMediaAsset, ToolcraftState } from "@/toolcraft/runtime";
import {
  readToolcraftOrientationPose,
  useToolcraftMediaPresentationUrls,
  useToolcraftModelOrbitInteraction,
  useToolcraftPipelinePass,
  useToolcraftProductSceneFrame,
  useToolcraftSelector,
  useToolcraftValue,
} from "@/toolcraft/runtime/react";

import { chromishTargets } from "./control-sections";
import { chromishPipelinePasses } from "./renderer-pipeline";
import { setChromishRuntimeSnapshot } from "./runtime-store";
import { buildChromishMesh, type ChromishCpuMesh, type ChromishDetail } from "./svg-mesh";
import {
  ChromishVgpuRenderer,
  createChromishRaycastCamera,
  safeCameraVector,
  type ChromishRenderParameters,
} from "./vgpu-renderer";

function selectSvgAsset(state: ToolcraftState): ToolcraftMediaAsset | null {
  return state.mediaAssets.find((asset) => asset.sourceTarget === chromishTargets.source) ?? null;
}

function selectTimeline(state: ToolcraftState) {
  return {
    currentTimeSeconds: state.timeline.currentTimeSeconds,
    durationSeconds: state.timeline.durationSeconds,
    isPlaying: state.timeline.isPlaying,
  };
}

function timelineEqual(left: ReturnType<typeof selectTimeline>, right: ReturnType<typeof selectTimeline>): boolean {
  return left.currentTimeSeconds === right.currentTimeSeconds && left.durationSeconds === right.durationSeconds && left.isPlaying === right.isPlaying;
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function useVisibleCanvasSize(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  fallbackWidth: number,
  fallbackHeight: number,
): Readonly<{ height: number; width: number }> {
  const [size, setSize] = React.useState({ height: fallbackHeight, width: fallbackWidth });

  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let animationFrame = 0;
    const update = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setSize((current) => {
        if (Math.abs(current.width - rect.width) < 0.01 && Math.abs(current.height - rect.height) < 0.01) return current;
        return { height: rect.height, width: rect.width };
      });
    };
    const watch = () => {
      update();
      animationFrame = requestAnimationFrame(watch);
    };
    animationFrame = requestAnimationFrame(watch);
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [canvasRef, fallbackHeight, fallbackWidth]);

  return size;
}

type MeshLoaderProps = Readonly<{
  asset: Extract<ToolcraftMediaAsset, { assetKind: "file" }>;
  bevel: number;
  depth: number;
  detail: ChromishDetail;
  onError: (error: unknown) => void;
  onMesh: (mesh: ChromishCpuMesh, sourceSvg: string) => void;
  url: string;
}>;

function ChromishMeshLoader({ asset, bevel, depth, detail, onError, onMesh, url }: MeshLoaderProps): null {
  const pass = useToolcraftPipelinePass(
    chromishPipelinePasses.svgExtrusion,
    { bevel, depth, detail, source: `${asset.resourceRef}:${asset.fileName}:${url}` },
    async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not read ${asset.fileName}.`);
      const sourceSvg = await response.text();
      return buildChromishMesh(sourceSvg, { bevel, depth, detail });
    },
  );

  React.useEffect(() => {
    if (pass.status === "success") onMesh(pass.result, pass.result.sourceSvg);
    if (pass.status === "error") onError(pass.error);
  }, [onError, onMesh, pass]);
  return null;
}

function buildRaycastMesh(mesh: ChromishCpuMesh): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
}

export function ChromishCanvas(): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererLifecycleRef = React.useRef(0);
  const rendererPromiseRef = React.useRef<Promise<ChromishVgpuRenderer> | null>(null);
  const rendererRef = React.useRef<ChromishVgpuRenderer | null>(null);
  const raycastMeshRef = React.useRef<Mesh | null>(null);
  const parametersRef = React.useRef<ChromishRenderParameters | null>(null);
  const [renderer, setRenderer] = React.useState<ChromishVgpuRenderer | null>(null);
  const [mesh, setMesh] = React.useState<ChromishCpuMesh | null>(null);
  const [sourceSvg, setSourceSvg] = React.useState("");
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [gpuUnavailable, setGpuUnavailable] = React.useState(false);
  const asset = useToolcraftSelector(selectSvgAsset);
  const assets = React.useMemo(() => asset ? [asset] : [], [asset]);
  const presentationUrls = useToolcraftMediaPresentationUrls(assets);
  const url = asset ? presentationUrls.get(asset.id) : undefined;
  const sceneFrame = useToolcraftProductSceneFrame();
  const timeline = useToolcraftSelector(selectTimeline, timelineEqual);
  const detail = stringValue(useToolcraftValue(chromishTargets.detail), "fine") as ChromishDetail;
  const depth = numeric(useToolcraftValue(chromishTargets.depth), 0.24);
  const bevel = numeric(useToolcraftValue(chromishTargets.bevel), 0.04);
  const material = stringValue(useToolcraftValue(chromishTargets.material), "diamond") as ChromishRenderParameters["material"];
  const primaryColor = stringValue(useToolcraftValue(chromishTargets.primaryColor), "#FF5A4F");
  const secondaryColor = stringValue(useToolcraftValue(chromishTargets.secondaryColor), "#FFD429");
  const roughness = numeric(useToolcraftValue(chromishTargets.roughness), 0.12);
  const reflectionContrast = numeric(useToolcraftValue(chromishTargets.reflectionContrast), 1.25);
  const studioRotation = numeric(useToolcraftValue(chromishTargets.studioRotation), 18);
  const exposure = numeric(useToolcraftValue("chrome.exposure"), 1);
  const direction = stringValue(useToolcraftValue(chromishTargets.direction), "clockwise");
  const startAngle = numeric(useToolcraftValue(chromishTargets.startAngle), -65);
  const background = stringValue(useToolcraftValue(chromishTargets.background), "#F7F7F5");
  const includeBackground = booleanValue(useToolcraftValue(chromishTargets.includeBackground), true);
  const renderScale = numeric(useToolcraftValue("canvas.renderScale"), 2);
  const orbit = readToolcraftOrientationPose(useToolcraftValue(chromishTargets.orbit));
  const width = sceneFrame.rect?.width ?? 960;
  const height = sceneFrame.rect?.height ?? 600;
  const visibleSize = useVisibleCanvasSize(canvasRef, width, height);
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const backingWidth = Math.max(1, Math.round(visibleSize.width * dpr * renderScale));
  const backingHeight = Math.max(1, Math.round(visibleSize.height * dpr * renderScale));
  const loopProgress = timeline.durationSeconds > 0
    ? ((timeline.currentTimeSeconds % timeline.durationSeconds) + timeline.durationSeconds) % timeline.durationSeconds / timeline.durationSeconds
    : 0;
  const directionSign = direction === "counterclockwise" ? -1 : 1;
  const rotationRadians = (startAngle * Math.PI) / 180 + directionSign * loopProgress * Math.PI * 2;
  const parameters = React.useMemo<ChromishRenderParameters>(() => ({
    background,
    cameraPosition: safeCameraVector(orbit.position, [0.15, 0.1, 4.5]),
    cameraUp: safeCameraVector(orbit.up, [0, 1, 0]),
    exposure,
    includeBackground,
    material,
    primaryColor,
    reflectionContrast,
    roughness,
    rotationRadians,
    secondaryColor,
    studioRotationRadians: (studioRotation * Math.PI) / 180,
  }), [background, exposure, includeBackground, material, orbit.position, orbit.up, primaryColor, reflectionContrast, roughness, rotationRadians, secondaryColor, studioRotation]);
  parametersRef.current = parameters;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lifecycle = ++rendererLifecycleRef.current;
    const rendererPromise = rendererPromiseRef.current ??=
      ChromishVgpuRenderer.create(canvas, [backingWidth, backingHeight]);
    void rendererPromise.then(
      (nextRenderer) => {
        if (rendererLifecycleRef.current !== lifecycle) return;
        rendererRef.current = nextRenderer;
        setRenderer(nextRenderer);
      },
      () => {
        if (rendererLifecycleRef.current === lifecycle) setGpuUnavailable(true);
      },
    );
    return () => {
      queueMicrotask(() => {
        if (rendererLifecycleRef.current !== lifecycle) return;
        rendererLifecycleRef.current += 1;
        setChromishRuntimeSnapshot(null);
        void rendererPromise.then((ownedRenderer) => ownedRenderer.dispose(), () => undefined);
        rendererPromiseRef.current = null;
        rendererRef.current = null;
        raycastMeshRef.current?.geometry.dispose();
        (raycastMeshRef.current?.material as MeshBasicMaterial | undefined)?.dispose();
        raycastMeshRef.current = null;
      });
    };
  }, []);

  React.useEffect(() => {
    renderer?.resize(backingWidth, backingHeight);
  }, [backingHeight, backingWidth, renderer]);

  React.useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(
      '[data-toolcraft-control-target="canvas.renderScale"] input[type="range"]',
    );
    if (!input) return;
    input.setAttribute("aria-valuemin", input.min);
    input.setAttribute("aria-valuemax", input.max);
  }, []);

  React.useEffect(() => {
    if (asset) return;
    setMesh(null);
    setSourceSvg("");
    setFeedback(null);
    renderer?.setMesh(null);
    raycastMeshRef.current?.geometry.dispose();
    (raycastMeshRef.current?.material as MeshBasicMaterial | undefined)?.dispose();
    raycastMeshRef.current = null;
    setChromishRuntimeSnapshot(null);
  }, [asset, renderer]);

  const handleMesh = React.useCallback((nextMesh: ChromishCpuMesh, nextSourceSvg: string) => {
    setMesh(nextMesh);
    setSourceSvg(nextSourceSvg);
    setFeedback(null);
    raycastMeshRef.current?.geometry.dispose();
    (raycastMeshRef.current?.material as MeshBasicMaterial | undefined)?.dispose();
    raycastMeshRef.current = buildRaycastMesh(nextMesh);
  }, []);

  const handleError = React.useCallback((error: unknown) => {
    setFeedback(error instanceof Error ? error.message : "The SVG could not be converted.");
  }, []);

  React.useEffect(() => {
    renderer?.setMesh(mesh);
  }, [mesh, renderer]);

  React.useEffect(() => {
    try {
      renderer?.render(parameters);
    } catch {
      setGpuUnavailable(true);
      return;
    }
    if (renderer && mesh && asset) {
      setChromishRuntimeSnapshot({
        directionSign,
        durationSeconds: timeline.durationSeconds,
        fileName: asset.fileName,
        mesh,
        parameters,
        renderer,
        sourceSvg,
        startAngleDegrees: startAngle,
      });
    }
  }, [asset, directionSign, mesh, parameters, renderer, sourceSvg, startAngle, timeline.durationSeconds]);

  const hitTest = React.useCallback((clientX: number, clientY: number): boolean => {
    const canvas = canvasRef.current;
    const cpuMesh = raycastMeshRef.current;
    const current = parametersRef.current;
    if (!canvas || !cpuMesh || !current) return false;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const pointer = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    const camera = createChromishRaycastCamera(rect.width, rect.height, current);
    cpuMesh.rotation.set(0, current.rotationRadians, 0);
    cpuMesh.updateMatrixWorld(true);
    const raycaster = new Raycaster();
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(cpuMesh, false).length > 0;
  }, []);

  const orbitHandlers = useToolcraftModelOrbitInteraction<HTMLCanvasElement>({
    enabled: Boolean(mesh),
    historyLabel: "Chrome object orbit",
    hitTest,
    target: chromishTargets.orbit,
  });

  const fileAsset = asset?.assetKind === "file" ? asset : null;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-toolcraft-chromish-canvas=""
      data-toolcraft-product-output="canvas"
      style={{ backgroundColor: includeBackground ? background : "transparent" }}
    >
      <canvas
        {...orbitHandlers}
        aria-label={`Rotating ${material} SVG preview`}
        className="block h-full w-full touch-none"
        height={backingHeight}
        data-canvas-model-layer="chromish-object"
        data-chromish-backing-height={backingHeight}
        data-chromish-backing-width={backingWidth}
        data-chromish-bevel={bevel}
        data-chromish-camera-position={JSON.stringify(parameters.cameraPosition)}
        data-chromish-camera-up={JSON.stringify(parameters.cameraUp)}
        data-chromish-detail={detail}
        data-chromish-depth={depth}
        data-chromish-direction={direction}
        data-chromish-exposure={exposure}
        data-chromish-include-background={includeBackground ? "true" : "false"}
        data-chromish-material={material}
        data-chromish-mesh-route={mesh?.route ?? "empty"}
        data-chromish-reflection-contrast={reflectionContrast}
        data-chromish-renderer-ready={renderer && !gpuUnavailable ? "true" : "false"}
        data-chromish-rotation={rotationRadians.toFixed(6)}
        data-chromish-roughness={roughness}
        data-chromish-start-angle={startAngle}
        data-chromish-studio-rotation={studioRotation}
        data-chromish-primary-color={primaryColor}
        data-chromish-secondary-color={secondaryColor}
        data-chromish-triangle-count={mesh?.triangleCount ?? 0}
        data-timeline-progress={loopProgress.toFixed(6)}
        data-toolcraft-canvas-render-scale-backing=""
        data-toolcraft-model-orbit-surface="true"
        ref={canvasRef}
        width={backingWidth}
      />
      {fileAsset && url ? (
        <ChromishMeshLoader
          asset={fileAsset}
          bevel={bevel}
          depth={depth}
          detail={detail}
          onError={handleError}
          onMesh={handleMesh}
          url={url}
        />
      ) : null}
      {gpuUnavailable ? (
        <p
          className="absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-sm text-[color:var(--muted-foreground)]"
          data-toolcraft-product-output="text"
          role="status"
        >
          Chromish requires WebGPU. Open it in a current Chromium or Edge browser with WebGPU enabled.
        </p>
      ) : null}
      {feedback ? (
        <p
          className="absolute inset-x-6 bottom-5 m-0 border border-[color:var(--destructive)] bg-[color:var(--background)]/95 px-3 py-2 text-center text-xs text-[color:var(--destructive)] shadow-sm"
          data-chromish-feedback=""
          data-toolcraft-product-output="text"
          role="alert"
        >
          {feedback} The previous valid object remains available.
        </p>
      ) : null}
    </div>
  );
}
