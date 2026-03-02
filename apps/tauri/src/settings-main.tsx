import React from "react";
import ReactDOM from "react-dom/client";
import "@/lib/i18n";
import { SettingsApp } from "./SettingsApp";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>
);
