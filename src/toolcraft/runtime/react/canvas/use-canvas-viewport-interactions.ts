"use client";

import * as React from "react";

import { clampToolcraftCanvasZoom } from "../../state/canvas-zoom";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import type { ToolcraftPoint } from "../../state/types";
import {
  createCanvasPinchState,
  getCanvasPointerCenter,
  getCanvasPointerDistance,
  getPinchedCanvasViewport,
  getZoomedCanvasOffset,
  type CanvasPinchState,
} from "./canvas-viewport-geometry";

type CanvasDragState = {
  originX: number;
  originY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

type CanvasGesturePinchState = {
  anchor: ToolcraftPoint;
  startOffset: ToolcraftPoint;
  startZoom: number;
};

type CanvasGestureEvent = Event & {
  clientX?: number;
  clientY?: number;
  scale?: number;
};

const wheelZoomSensitivity = 0.12;
const wheelPinchZoomSensitivity = 0.5;
const wheelCommitIdleMs = 120;

function isEventTargetInsideElement(
  target: EventTarget | null,
  element: HTMLElement,
): boolean {
  return target instanceof Node && element.contains(target);
}

function getNextWheelZoom(
  currentZoom: number,
  event: Pick<WheelEvent, "ctrlKey" | "deltaY" | "metaKey">,
): number {
  const sensitivity = event.ctrlKey || event.metaKey
    ? wheelPinchZoomSensitivity
    : wheelZoomSensitivity;
  const rawDelta = -event.deltaY * sensitivity;
  const zoomDelta = Math.trunc(rawDelta) || Math.sign(rawDelta);

  return clampToolcraftCanvasZoom(currentZoom + zoomDelta);
}

export function useCanvasViewportInteractions({
  draggable,
  store,
}: {
  draggable: boolean;
  store: ToolcraftExternalStore;
}): {
  handlePointerDown: React.PointerEventHandler<HTMLDivElement>;
  handlePointerDownCapture: React.PointerEventHandler<HTMLDivElement>;
  handlePointerMove: React.PointerEventHandler<HTMLDivElement>;
  handlePointerMoveCapture: React.PointerEventHandler<HTMLDivElement>;
  handlePointerUp: React.PointerEventHandler<HTMLDivElement>;
  handlePointerUpCapture: React.PointerEventHandler<HTMLDivElement>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
} {
  const activeTouchPointersRef = React.useRef<Map<number, ToolcraftPoint>>(
    new Map(),
  );
  const dragRef = React.useRef<CanvasDragState | null>(null);
  const gesturePinchRef = React.useRef<CanvasGesturePinchState | null>(null);
  const pinchRef = React.useRef<CanvasPinchState | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const wheelCommitTimerRef = React.useRef<number | undefined>(undefined);
  const commitPendingWheel = React.useCallback((): void => {
    if (wheelCommitTimerRef.current === undefined) {
      return;
    }

    window.clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = undefined;
    store.commitTransient("viewport");
  }, [store]);
  const scheduleWheelCommit = React.useCallback((): void => {
    if (wheelCommitTimerRef.current !== undefined) {
      window.clearTimeout(wheelCommitTimerRef.current);
    }

    wheelCommitTimerRef.current = window.setTimeout(() => {
      wheelCommitTimerRef.current = undefined;
      store.commitTransient("viewport");
    }, wheelCommitIdleMs);
  }, [store]);

  React.useEffect(() => {
    const viewportElement = viewportRef.current;

    if (!viewportElement) {
      return undefined;
    }

    const workspaceElement =
      viewportElement.closest<HTMLElement>(
        '[data-slot="toolcraft-runtime-app"]',
      ) ?? viewportElement;
    const listenerOptions: AddEventListenerOptions = { capture: true, passive: false };
    const isBrowserZoomWheel = (event: WheelEvent): boolean =>
      event.ctrlKey || event.metaKey;
    const handleWheel = (event: WheelEvent): void => {
      const targetIsInsideCanvas = isEventTargetInsideElement(
        event.target,
        viewportElement,
      );
      if (!targetIsInsideCanvas) {
        if (isBrowserZoomWheel(event)) {
          event.preventDefault();
          event.stopPropagation();
        }

        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const { offset, zoom } = store.getState().canvas;

      if (!isBrowserZoomWheel(event)) {
        store.dispatchTransient({
          offset: {
            x: offset.x - event.deltaX,
            y: offset.y - event.deltaY,
          },
          type: "canvas.setOffset",
        });
        scheduleWheelCommit();
        return;
      }

      const nextZoom = getNextWheelZoom(zoom, event);
      scheduleWheelCommit();

      if (nextZoom === zoom) {
        return;
      }

      store.dispatchTransient({
        offset: getZoomedCanvasOffset({
          clientX: event.clientX,
          clientY: event.clientY,
          currentZoom: zoom,
          nextZoom,
          offset,
          viewportElement,
        }),
        type: "canvas.setViewport",
        zoom: nextZoom,
      });
    };

    const handleGestureStart = (event: Event): void => {
      event.preventDefault();

      if (!isEventTargetInsideElement(event.target, viewportElement)) {
        gesturePinchRef.current = null;
        return;
      }

      commitPendingWheel();
      const gestureEvent = event as CanvasGestureEvent;
      const rect = viewportElement.getBoundingClientRect();
      const { offset, zoom } = store.getState().canvas;
      gesturePinchRef.current = {
        anchor: {
          x: gestureEvent.clientX ?? rect.left + rect.width / 2,
          y: gestureEvent.clientY ?? rect.top + rect.height / 2,
        },
        startOffset: offset,
        startZoom: zoom,
      };
    };
    const handleGestureChange = (event: Event): void => {
      event.preventDefault();
      const gesture = gesturePinchRef.current;

      if (!gesture) {
        return;
      }

      const scale = (event as CanvasGestureEvent).scale;

      if (!Number.isFinite(scale) || scale === undefined || scale <= 0) {
        return;
      }

      const zoom = clampToolcraftCanvasZoom(gesture.startZoom * scale);
      store.dispatchTransient({
        offset: getZoomedCanvasOffset({
          clientX: gesture.anchor.x,
          clientY: gesture.anchor.y,
          currentZoom: gesture.startZoom,
          nextZoom: zoom,
          offset: gesture.startOffset,
          viewportElement,
        }),
        type: "canvas.setViewport",
        zoom,
      });
    };
    const handleGestureEnd = (event: Event): void => {
      event.preventDefault();

      if (!gesturePinchRef.current) {
        return;
      }

      gesturePinchRef.current = null;
      store.commitTransient("viewport");
    };

    workspaceElement.addEventListener("wheel", handleWheel, listenerOptions);
    workspaceElement.addEventListener(
      "gesturestart",
      handleGestureStart,
      listenerOptions,
    );
    workspaceElement.addEventListener(
      "gesturechange",
      handleGestureChange,
      listenerOptions,
    );
    workspaceElement.addEventListener(
      "gestureend",
      handleGestureEnd,
      listenerOptions,
    );

    return () => {
      workspaceElement.removeEventListener(
        "wheel",
        handleWheel,
        listenerOptions,
      );
      workspaceElement.removeEventListener("gesturestart", handleGestureStart);
      workspaceElement.removeEventListener("gesturechange", handleGestureChange);
      workspaceElement.removeEventListener("gestureend", handleGestureEnd);

      const hasPendingWheel = wheelCommitTimerRef.current !== undefined;
      const hasActivePointerGesture =
        dragRef.current !== null ||
        gesturePinchRef.current !== null ||
        pinchRef.current !== null ||
        activeTouchPointersRef.current.size > 0;

      if (wheelCommitTimerRef.current !== undefined) {
        window.clearTimeout(wheelCommitTimerRef.current);
        wheelCommitTimerRef.current = undefined;
      }

      if (hasPendingWheel || hasActivePointerGesture) {
        activeTouchPointersRef.current.clear();
        dragRef.current = null;
        gesturePinchRef.current = null;
        pinchRef.current = null;
        store.commitTransient("viewport");
      }
    };
  }, [commitPendingWheel, scheduleWheelCommit, store]);

  const handlePointerDownCapture: React.PointerEventHandler<HTMLDivElement> =
    React.useCallback(
      (event) => {
        if (event.pointerType !== "touch") {
          return;
        }

        activeTouchPointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });

        if (activeTouchPointersRef.current.size < 2) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        commitPendingWheel();

        if (typeof event.currentTarget.setPointerCapture === "function") {
          for (const pointerId of activeTouchPointersRef.current.keys()) {
            event.currentTarget.setPointerCapture(pointerId);
          }
        }

        const { offset, zoom } = store.getState().canvas;
        dragRef.current = null;
        pinchRef.current = createCanvasPinchState(
          activeTouchPointersRef.current,
          offset,
          zoom,
        );
      },
      [commitPendingWheel, store],
    );

  const handlePointerMoveCapture: React.PointerEventHandler<HTMLDivElement> =
    React.useCallback(
      (event) => {
        if (
          event.pointerType !== "touch" ||
          !activeTouchPointersRef.current.has(event.pointerId)
        ) {
          return;
        }

        activeTouchPointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });

        const pinch = pinchRef.current;

        if (!pinch) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const first = activeTouchPointersRef.current.get(pinch.pointerIds[0]);
        const second = activeTouchPointersRef.current.get(pinch.pointerIds[1]);

        if (!first || !second) {
          return;
        }

        const firstPointer = { pointerId: pinch.pointerIds[0], ...first };
        const secondPointer = { pointerId: pinch.pointerIds[1], ...second };
        const currentDistance = getCanvasPointerDistance(
          firstPointer,
          secondPointer,
        );

        if (currentDistance <= 0) {
          return;
        }

        store.dispatchTransient({
          ...getPinchedCanvasViewport({
            currentCenter: getCanvasPointerCenter(firstPointer, secondPointer),
            currentDistance,
            pinch,
            viewportElement: event.currentTarget,
          }),
          type: "canvas.setViewport",
        });
      },
      [store],
    );

  const handlePointerUpCapture: React.PointerEventHandler<HTMLDivElement> =
    React.useCallback(
      (event) => {
        if (
          event.pointerType !== "touch" ||
          !activeTouchPointersRef.current.has(event.pointerId)
        ) {
          return;
        }

        if (
          typeof event.currentTarget.hasPointerCapture === "function" &&
          event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        activeTouchPointersRef.current.delete(event.pointerId);

        if (!pinchRef.current) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const { offset, zoom } = store.getState().canvas;
        pinchRef.current = createCanvasPinchState(
          activeTouchPointersRef.current,
          offset,
          zoom,
        );

        if (pinchRef.current) {
          return;
        }

        const remainingTouch = activeTouchPointersRef.current.entries().next();

        if (!remainingTouch.done && draggable) {
          const [pointerId, point] = remainingTouch.value;
          dragRef.current = {
            originX: offset.x,
            originY: offset.y,
            pointerId,
            startX: point.x,
            startY: point.y,
          };
          return;
        }

        for (const pointerId of activeTouchPointersRef.current.keys()) {
          if (
            typeof event.currentTarget.hasPointerCapture === "function" &&
            event.currentTarget.hasPointerCapture(pointerId)
          ) {
            event.currentTarget.releasePointerCapture(pointerId);
          }
        }

        activeTouchPointersRef.current.clear();
        dragRef.current = null;
        store.commitTransient("viewport");
      },
      [draggable, store],
    );

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = React.useCallback(
    (event) => {
      if (
        !draggable ||
        (event.pointerType !== "touch" && event.button !== 0)
      ) {
        return;
      }

      event.preventDefault();
      commitPendingWheel();

      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      const { offset } = store.getState().canvas;

      dragRef.current = {
        originX: offset.x,
        originY: offset.y,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [commitPendingWheel, draggable, store],
  );

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = React.useCallback(
    (event) => {
      const drag = dragRef.current;

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      store.dispatchTransient({
        offset: {
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY,
        },
        type: "canvas.setOffset",
      });
    },
    [store],
  );

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = React.useCallback(
    (event) => {
      if (dragRef.current?.pointerId !== event.pointerId) {
        return;
      }

      if (
        typeof event.currentTarget.hasPointerCapture === "function" &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      dragRef.current = null;
      store.commitTransient("viewport");
    },
    [store],
  );

  return {
    handlePointerDown,
    handlePointerDownCapture,
    handlePointerMove,
    handlePointerMoveCapture,
    handlePointerUp,
    handlePointerUpCapture,
    viewportRef,
  };
}
