import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ComposerResizeOptions {
  defaultHeight: number;
  maxHeight: number;
  minHeight: number;
}

export function useComposerResize({ defaultHeight, maxHeight, minHeight }: ComposerResizeOptions) {
  const [height, setHeight] = useState(defaultHeight);
  const cleanupRef = useRef<(() => void) | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => () => cleanupRef.current?.(), []);

  const startResize = useCallback((startY: number) => {
    if (draggingRef.current) {
      return;
    }

    cleanupRef.current?.();
    draggingRef.current = true;
    const startHeight = height;

    const handleMove = (moveEvent: MouseEvent | PointerEvent) => {
      const distance = startY - moveEvent.clientY;
      setHeight(clamp(startHeight + distance, minHeight, maxHeight));
    };

    const handleEnd = () => {
      draggingRef.current = false;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      cleanupRef.current = null;
    };

    cleanupRef.current = handleEnd;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  }, [height, maxHeight, minHeight]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    startResize(event.clientY);
  }, [startResize]);

  const handleMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    startResize(event.clientY);
  }, [startResize]);

  return {
    handleMouseDown,
    height,
    handlePointerDown,
  };
}

export function ComposerResizeHandle({
  className,
  onMouseDown,
  onPointerDown,
}: {
  className?: string;
  onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label="调整输入框高度"
      title="拖动上边框调整输入框高度"
      className={cn(
        "absolute inset-x-0 top-0 z-10 h-4 -translate-y-1/2 cursor-ns-resize rounded-t-2xl bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onMouseDown={onMouseDown}
      onPointerDown={onPointerDown}
    />
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
