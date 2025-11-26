import React from "react";
import { useUiStore } from "@/stores/uiStore";

function ControlPanel() {
  const {
    clickId,
    fillId,
    fillText,
    selectId,
    selectValues,
    hoverId,
    isClicking,
    isFilling,
    isSelecting,
    isHovering,
    lastClickResult,
    lastFillResult,
    lastSelectResult,
    lastHoverResult,
    setClickId,
    setFillId,
    setFillText,
    setSelectId,
    setSelectValues,
    setHoverId,
    clickElement,
    fillElement,
    selectElement,
    hoverElement,
  } = useUiStore();

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
    const values = selectValues
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    if (values.length === 0) {
      alert("Please enter at least one valid value to select");
      return;
    }

    await selectElement(nodeId, { values });
  };

  const handleHover = async () => {
    const nodeId = parseInt(hoverId.trim());
    if (isNaN(nodeId)) {
      alert("Please enter a valid backend node ID");
      return;
    }
    await hoverElement(nodeId);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          DOM Interactions
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {/* Click Operation */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-700 mb-3">
              Click Element
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Element ID"
                value={clickId}
                onChange={(e) => setClickId(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleClick}
                disabled={isClicking}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isClicking ? "clicking..." : "click"}
              </button>
            </div>
          </div>

          {/* Fill Operation */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-700 mb-3">
              Fill Element
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Element ID"
                value={fillId}
                onChange={(e) => setFillId(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Text to fill"
                value={fillText}
                onChange={(e) => setFillText(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleFill}
                disabled={isFilling}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isFilling ? "filling..." : "fill"}
              </button>
            </div>
          </div>

          {/* Select Operation */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-700 mb-3">
              Select Options
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Element ID"
                value={selectId}
                onChange={(e) => setSelectId(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Select values (comma-separated)"
                value={selectValues}
                onChange={(e) => setSelectValues(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSelect}
                disabled={isSelecting}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isSelecting ? "selecting..." : "select"}
              </button>
            </div>
          </div>

          {/* Hover Operation */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-700 mb-3">
              Hover Element
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Element ID"
                value={hoverId}
                onChange={(e) => setHoverId(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleHover}
                disabled={isHovering}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isHovering ? "hovering..." : "hover"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Operation Results
        </h2>
        <div className="space-y-3">
          {lastClickResult && (
            <div
              className={`p-3 rounded-lg border ${
                lastClickResult.success
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              <div className="font-medium">
                Click: {lastClickResult.success ? "Success" : "Failed"}
              </div>
              {lastClickResult.error && (
                <div className="text-sm mt-1">
                  Error: {lastClickResult.error}
                </div>
              )}
              {lastClickResult.coordinates && (
                <div className="text-sm mt-1">
                  Position: ({Math.round(lastClickResult.coordinates.x)},{" "}
                  {Math.round(lastClickResult.coordinates.y)})
                </div>
              )}
            </div>
          )}

          {lastFillResult && (
            <div
              className={`p-3 rounded-lg border ${
                lastFillResult.success
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              <div className="font-medium">
                Fill: {lastFillResult.success ? "Success" : "Failed"}
              </div>
              {lastFillResult.error && (
                <div className="text-sm mt-1">
                  Error: {lastFillResult.error}
                </div>
              )}
              {lastFillResult.charactersTyped && (
                <div className="text-sm mt-1">
                  Characters typed: {lastFillResult.charactersTyped}
                </div>
              )}
            </div>
          )}

          {lastSelectResult && (
            <div
              className={`p-3 rounded-lg border ${
                lastSelectResult.success
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              <div className="font-medium">
                Select: {lastSelectResult.success ? "Success" : "Failed"}
              </div>
              {lastSelectResult.error && (
                <div className="text-sm mt-1">
                  Error: {lastSelectResult.error}
                </div>
              )}
              {lastSelectResult.optionsSelected !== undefined && (
                <div className="text-sm mt-1">
                  Options selected: {lastSelectResult.optionsSelected}
                </div>
              )}
              {lastSelectResult.matchedValues &&
                lastSelectResult.matchedValues.length > 0 && (
                  <div className="text-sm mt-1">
                    Matched values: [{lastSelectResult.matchedValues.join(", ")}
                    ]
                  </div>
                )}
            </div>
          )}

          {lastHoverResult && (
            <div
              className={`p-3 rounded-lg border ${
                lastHoverResult.success
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              <div className="font-medium">
                Hover: {lastHoverResult.success ? "Success" : "Failed"}
              </div>
              {lastHoverResult.error && (
                <div className="text-sm mt-1">
                  Error: {lastHoverResult.error}
                </div>
              )}
              {lastHoverResult.coordinates && (
                <div className="text-sm mt-1">
                  Position: ({Math.round(lastHoverResult.coordinates.x)},{" "}
                  {Math.round(lastHoverResult.coordinates.y)})
                </div>
              )}
              {lastHoverResult.method && (
                <div className="text-sm mt-1">
                  Method: {lastHoverResult.method}
                </div>
              )}
            </div>
          )}

          {!lastClickResult &&
            !lastFillResult &&
            !lastSelectResult &&
            !lastHoverResult && (
              <div className="text-gray-500 text-center py-4">
                No operations performed yet
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default ControlPanel;
