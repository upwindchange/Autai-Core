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
  const {
    setContainerRef,
    setContainerBounds,
    clickId,
    fillId,
    fillText,
    selectId,
    selectValues,
    isClicking,
    isFilling,
    isSelecting,
    lastClickResult,
    lastFillResult,
    lastSelectResult,
    setClickId,
    setFillId,
    setFillText,
    setSelectId,
    setSelectValues,
    clickElement,
    fillElement,
    selectElement
  } = useUiStore();

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

  // Event handlers
  const handleClick = async () => {
    const nodeId = parseInt(clickId.trim());
    if (isNaN(nodeId)) {
      alert("Please enter a valid backend node ID");
      return;
    }
    await clickElement(nodeId);
  };

  const handleFill = async () => {
    const nodeId = parseInt(fillId.trim());
    if (isNaN(nodeId)) {
      alert("Please enter a valid backend node ID");
      return;
    }
    if (!fillText.trim()) {
      alert("Please enter text to fill");
      return;
    }
    await fillElement(nodeId, { value: fillText.trim() });
  };

  const handleSelect = async () => {
    const nodeId = parseInt(selectId.trim());
    if (isNaN(nodeId)) {
      alert("Please enter a valid backend node ID");
      return;
    }
    if (!selectValues.trim()) {
      alert("Please enter values to select");
      return;
    }

    // Parse comma-separated values or single value
    const values = selectValues.split(',').map(v => v.trim()).filter(v => v.length > 0);
    if (values.length === 0) {
      alert("Please enter at least one valid value to select");
      return;
    }

    await selectElement(nodeId, { values });
  };

  return (
    <div
      className="fixed inset-0 flex flex-col bg-gray-100"
      style={{ zIndex: 1 }}
    >
      {/* Control Panel */}
      <div
        className="bg-white border-b border-gray-300 p-4 shadow-md"
        style={{ zIndex: 10 }}
      >
        <div className="space-y-3">
          {/* Row 1: Click button + ID input */}
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="ID"
              value={clickId}
              onChange={(e) => setClickId(e.target.value)}
              className="w-20 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleClick}
              disabled={isClicking}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isClicking ? "clicking..." : "click"}
            </button>
          </div>

          {/* Row 2: Filled text + ID input */}
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="ID"
              value={fillId}
              onChange={(e) => setFillId(e.target.value)}
              className="w-20 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="filled text"
              value={fillText}
              onChange={(e) => setFillText(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleFill}
              disabled={isFilling}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isFilling ? "filling..." : "fill"}
            </button>
          </div>

          {/* Row 3: Select option(s) + ID input */}
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="ID"
              value={selectId}
              onChange={(e) => setSelectId(e.target.value)}
              className="w-20 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="select values (comma-separated)"
              value={selectValues}
              onChange={(e) => setSelectValues(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSelect}
              disabled={isSelecting}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSelecting ? "selecting..." : "select"}
            </button>
          </div>

          {/* Result feedback */}
          <div className="text-sm">
            {lastClickResult && (
              <div className={`mb-2 p-2 rounded ${lastClickResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                Click: {lastClickResult.success ? 'Success' : 'Failed'}
                {lastClickResult.error && ` - ${lastClickResult.error}`}
                {lastClickResult.coordinates && ` at (${Math.round(lastClickResult.coordinates.x)}, ${Math.round(lastClickResult.coordinates.y)})`}
              </div>
            )}
            {lastFillResult && (
              <div className={`p-2 rounded ${lastFillResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                Fill: {lastFillResult.success ? 'Success' : 'Failed'}
                {lastFillResult.error && ` - ${lastFillResult.error}`}
                {lastFillResult.charactersTyped && ` - ${lastFillResult.charactersTyped} chars typed`}
              </div>
            )}
            {lastSelectResult && (
              <div className={`p-2 rounded ${lastSelectResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                Select: {lastSelectResult.success ? 'Success' : 'Failed'}
                {lastSelectResult.error && ` - ${lastSelectResult.error}`}
                {lastSelectResult.optionsSelected !== undefined && ` - ${lastSelectResult.optionsSelected} option${lastSelectResult.optionsSelected === 1 ? '' : 's'} selected`}
                {lastSelectResult.matchedValues && lastSelectResult.matchedValues.length > 0 && ` - [${lastSelectResult.matchedValues.join(', ')}]`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Container Area */}
      <div className="flex-1 border-8 border-red-500">
        <div ref={containerRef} className="w-full h-full" />
      </div>
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
