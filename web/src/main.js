import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
const root = document.getElementById("root");
if (!root)
    throw new Error("missing #root in index.html");
createRoot(root).render(_jsx(StrictMode, { children: _jsx(App, {}) }));
