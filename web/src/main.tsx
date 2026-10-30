import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { api } from "./api";
import { applyStoredTheme } from "./theme";

applyStoredTheme();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
