import { useUiStore } from "@/stores/uiStore";

function ControlPanel() {
  const {
    // Existing DOM interaction state
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

    // Drag interaction state
    dragSourceId,
    dragTarget,
    isDragging,
    lastDragResult,
    setDragSourceId,
    setDragTarget,
    dragElement,

    // New detection and LLM state
    isDetectingChanges,
    lastDetectionResult,
    isGeneratingLLM,
    lastLLMRepresentation,
    llmGenerationError,
    detectChanges,
    generateLLMRepresentation,

    // DOM baseline initialization state
    isInitializingBaseline,
    lastInitializationResult,
    initializeDomBaseline,
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

  const handleDrag = async () => {
    const sourceNodeId = parseInt(dragSourceId.trim());
    if (isNaN(sourceNodeId)) {
      alert("Please enter a valid source element ID");
      return;
    }

    if (!dragTarget.trim()) {
      alert("Please enter a target (element ID or x,y coordinates)");
      return;
    }

    // Parse target - check if it's coordinates or element ID
    let targetOptions: { target: number | { x: number; y: number } };
    const targetTrimmed = dragTarget.trim();

    // Check if target is in "x,y" format
    const coordinateMatch = targetTrimmed.match(/^(\d+),\s*(\d+)$/);
    if (coordinateMatch) {
      // Target is coordinates
      targetOptions = {
        target: {
          x: parseInt(coordinateMatch[1]),
          y: parseInt(coordinateMatch[2])
        }
      };
    } else {
      // Target is element ID
      const targetNodeId = parseInt(targetTrimmed);
      if (isNaN(targetNodeId)) {
        alert("Target must be a valid element ID or x,y coordinates");
        return;
      }
      targetOptions = {
        target: targetNodeId
      };
    }

    await dragElement(sourceNodeId, targetOptions);
  };

  // New event handlers
  const handleDetectChanges = async () => {
    try {
      await detectChanges();
    } catch (error) {
      console.error("Failed to detect changes:", error);
    }
  };

  const handleInitializeBaseline = async () => {
    try {
      await initializeDomBaseline();
    } catch (error) {
      console.error("Failed to initialize DOM baseline:", error);
    }
  };

  const handleGenerateLLM = async () => {
    try {
      await generateLLMRepresentation();
    } catch (error) {
      console.error("Failed to generate LLM representation:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* DOM Detection and Analysis Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          DOM Detection and Analysis
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {/* DOM Operations */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-700 mb-3">
              DOM Operations
            </h3>

            <div className="grid grid-cols-1 gap-4">
              {/* Reset DOM Tree Button */}
              <div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleInitializeBaseline}
                    disabled={isInitializingBaseline}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {isInitializingBaseline ? "resetting..." : "reset dom tree"}
                  </button>
                  {lastInitializationResult && (
                    <div className={`text-sm ${lastInitializationResult.success ? "text-green-600" : "text-red-600"}`}>
                      {lastInitializationResult.success
                        ? `${lastInitializationResult.message} (${lastInitializationResult.stats?.interactiveElements || 0} elements)`
                        : lastInitializationResult.error}
                    </div>
                  )}
                </div>
              </div>

              {/* Detect Changes Button */}
              <div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDetectChanges}
                    disabled={isDetectingChanges}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {isDetectingChanges ? "detecting..." : "detect changes"}
                  </button>
                  {lastDetectionResult && (
                    <div className="text-sm text-gray-600">
                      {lastDetectionResult.success
                        ? lastDetectionResult.hasChanges
                          ? `Found ${lastDetectionResult.newElementsCount} new elements`
                          : "No changes detected"
                        : "Detection failed"}
                  </div>
                  )}
                </div>
                {lastDetectionResult && !lastDetectionResult.success && lastDetectionResult.error && (
                  <div className="mt-2 text-sm text-red-600">
                    Error: {lastDetectionResult.error}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LLM Representation */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-700 mb-3">
              LLM Representation
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={handleGenerateLLM}
                disabled={isGeneratingLLM}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors"
              >
                {isGeneratingLLM ? "generating..." : "generate LLM view"}
              </button>
            </div>

            {lastLLMRepresentation && (
              <div className="mt-3">
                <div className="text-sm font-medium text-gray-700 mb-2">
                  DOM Tree Representation:
                </div>
                <div className="bg-gray-50 border border-gray-300 rounded p-3 max-h-96 overflow-y-auto font-mono text-sm">
                  <pre className="whitespace-pre-wrap">{lastLLMRepresentation}</pre>
                </div>
              </div>
            )}

            {llmGenerationError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-800 rounded">
                Error: {llmGenerationError}
              </div>
            )}
          </div>
        </div>
      </div>

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

          {/* Drag Operation */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-700 mb-3">
              Drag Element
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Source ID"
                value={dragSourceId}
                onChange={(e) => setDragSourceId(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Target (ID or x,y)"
                value={dragTarget}
                onChange={(e) => setDragTarget(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleDrag}
                disabled={isDragging}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isDragging ? "dragging..." : "drag"}
              </button>
            </div>
            {lastDragResult && (
              <div className="mt-3 p-3 bg-gray-100 rounded">
                <div className="text-sm">
                  <span className="font-medium">Status: </span>
                  <span className={lastDragResult.success ? "text-green-600" : "text-red-600"}>
                    {lastDragResult.success ? "Success" : "Failed"}
                  </span>
                </div>
                {lastDragResult.error && (
                  <div className="text-sm text-red-600 mt-1">
                    <span className="font-medium">Error: </span>
                    {lastDragResult.error}
                  </div>
                )}
                {lastDragResult.sourceCoordinates && lastDragResult.targetCoordinates && (
                  <div className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">From: </span>
                    ({Math.round(lastDragResult.sourceCoordinates.x)}, {Math.round(lastDragResult.sourceCoordinates.y)})
                    <span className="font-medium ml-2">To: </span>
                    ({Math.round(lastDragResult.targetCoordinates.x)}, {Math.round(lastDragResult.targetCoordinates.y)})
                  </div>
                )}
              </div>
            )}
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

          {lastDragResult && (
            <div
              className={`p-3 rounded-lg border ${
                lastDragResult.success
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              <div className="font-medium">
                Drag: {lastDragResult.success ? "Success" : "Failed"}
              </div>
              {lastDragResult.error && (
                <div className="text-sm mt-1">
                  Error: {lastDragResult.error}
                </div>
              )}
              {lastDragResult.sourceCoordinates && lastDragResult.targetCoordinates && (
                <div className="text-sm mt-1">
                  From: ({Math.round(lastDragResult.sourceCoordinates.x)},{" "}
                  {Math.round(lastDragResult.sourceCoordinates.y)}) → To: (
                  {Math.round(lastDragResult.targetCoordinates.x)},{" "}
                  {Math.round(lastDragResult.targetCoordinates.y)})
                </div>
              )}
              {lastDragResult.method && (
                <div className="text-sm mt-1">
                  Method: {lastDragResult.method}
                </div>
              )}
              {lastDragResult.duration && (
                <div className="text-sm mt-1">
                  Duration: {lastDragResult.duration}ms
                </div>
              )}
            </div>
          )}

          {!lastClickResult &&
            !lastFillResult &&
            !lastSelectResult &&
            !lastHoverResult &&
            !lastDragResult && (
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
