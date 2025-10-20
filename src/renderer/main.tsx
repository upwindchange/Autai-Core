import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { useUiStore } from "@/stores/uiStore";

import "./index.css";

/**
 * Simple container that hosts the WebContentView from main process.
 * Only shows a red border around the rendered webpage.
 */
function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setContainerRef, setContainerBounds } = useUiStore();

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    setContainerRef(containerRef.current);

    // Set up resize observer to track container bounds
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const bounds = {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        setContainerBounds(bounds);
      }
    });

    resizeObserver.observe(containerRef.current);

    // Set initial bounds
    const rect = containerRef.current.getBoundingClientRect();
    const initialBounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    setContainerBounds(initialBounds);

    return () => {
      resizeObserver.disconnect();
      setContainerRef(null);
    };
  }, [setContainerRef, setContainerBounds]);

  
  return (
    <div
      className="fixed inset-0 border-8 border-red-500 bg-gray-100"
      style={{ zIndex: 1 }}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

// Remove loading screen and render app
postMessage({ payload: "removeLoading" }, "*");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
