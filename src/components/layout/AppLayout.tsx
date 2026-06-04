import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { StatusBar } from "@/components/layout/StatusBar";

const sidebarDefaultWidth = 236;
const sidebarMinWidth = 208;
const sidebarMaxWidth = 360;
const sidebarWidthStorageKey = "hermes.sidebar.width.v1";

interface LayoutStyle extends CSSProperties {
  "--hermes-sidebar-width": string;
}

export function AppLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const layoutStyle: LayoutStyle = {
    "--hermes-sidebar-width": `${sidebarWidth}px`,
  };

  useEffect(() => {
    writeStoredSidebarWidth(sidebarWidth);
  }, [sidebarWidth]);

  const handleSidebarResizeStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function stopResize() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
      setSidebarWidth(nextWidth);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }, [sidebarWidth]);

  return (
    <div className="flex h-full min-w-[960px] bg-background text-foreground" style={layoutStyle}>
      <AppSidebar
        maxWidth={sidebarMaxWidth}
        minWidth={sidebarMinWidth}
        onResizePointerDown={handleSidebarResizeStart}
        width={sidebarWidth}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-[14px] border-l border-t border-black/10 bg-card">
        <StatusBar />
        <Outlet />
      </main>
    </div>
  );
}

function clampSidebarWidth(width: number) {
  return Math.min(sidebarMaxWidth, Math.max(sidebarMinWidth, Math.round(width)));
}

function readStoredSidebarWidth() {
  try {
    const storedValue = window.localStorage.getItem(sidebarWidthStorageKey);
    const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : sidebarDefaultWidth;

    return Number.isFinite(parsedValue) ? clampSidebarWidth(parsedValue) : sidebarDefaultWidth;
  } catch (error) {
    console.error("Failed to read sidebar width.", error);
    return sidebarDefaultWidth;
  }
}

function writeStoredSidebarWidth(width: number) {
  try {
    window.localStorage.setItem(sidebarWidthStorageKey, String(width));
  } catch (error) {
    console.error("Failed to persist sidebar width.", error);
  }
}
