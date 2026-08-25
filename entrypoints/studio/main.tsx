import React from "react";
import ReactDOM from "react-dom/client";
import { StudioApp } from "./studio-app";
import "./studio.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StudioApp />
  </React.StrictMode>,
);
