import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { useUiStore } from "@/stores/uiStore";
import log from "electron-log/renderer";

import "./index.css";

const logger = log.scope("Renderer");

/**
 * Simple container that hosts the WebContentView from main process.
 * Only shows a red border around the rendered webpage.
 */
function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setContainerRef, setContainerBounds } = useUiStore();
  const [domStatus, setDomStatus] = useState<string>("Not initialized");

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

  // Test DOM Service integration
  useEffect(() => {
    const testDOMService = async () => {
      try {
        if (window.ipcRenderer) {
          logger.debug("Testing DOM Service integration...");

          // Initialize DOM Service
          const initResult = await window.ipcRenderer.invoke("dom:initialize");
          logger.info("DOM Service initialized:", initResult);
          setDomStatus("Initialized");

          // Get status
          const status = await window.ipcRenderer.invoke("dom:getStatus");
          logger.info("DOM Service status:", status);
          setDomStatus(
            `Status: ${status.isAttached ? "Attached" : "Not attached"}`
          );

          // Get DOM tree (this might take a moment)
          const domTree = await window.ipcRenderer.invoke("dom:getDOMTree");
          logger.info("DOM Tree received:", domTree);
          setDomStatus(
            `DOM Tree loaded with ${JSON.stringify(domTree).length} chars`
          );
        }
      } catch (error) {
        logger.error("DOM Service test failed:", error);
        setDomStatus(`Error: ${error}`);
      }
    };

    // Wait a bit for the app to fully load before testing
    const timer = setTimeout(testDOMService, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 border-8 border-red-500 bg-gray-100"
      style={{ zIndex: 1 }}
    >
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 z-10">
        <h3 className="text-sm font-semibold mb-2">DOM Service Status:</h3>
        <p className="text-xs text-gray-600">{domStatus}</p>
      </div>
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
