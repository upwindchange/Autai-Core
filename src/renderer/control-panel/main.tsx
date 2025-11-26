import React from "react";
import ReactDOM from "react-dom/client";
import ControlPanel from "./components/ControlPanel";
import "../index.css";

// Remove loading screen and render app
postMessage({ payload: "removeLoading" }, "*");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ControlPanel />
  </React.StrictMode>
);