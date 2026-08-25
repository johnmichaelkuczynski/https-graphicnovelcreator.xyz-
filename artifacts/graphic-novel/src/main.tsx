import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The application root element is missing.");
}

// Only the production root document contains the pre-rendered public landing.
// Hydrate that markup so sign-in controls become interactive without
// sacrificing crawler-visible HTML. Private route shells stay empty and mount
// normally, allowing their authenticated application views to render.
if (import.meta.env.PROD && root.dataset.prerendered === "landing") {
  hydrateRoot(root, <App />);
} else {
  createRoot(root).render(<App />);
}
