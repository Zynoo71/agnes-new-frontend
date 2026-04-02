import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initDb } from "./db";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
const render = () =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

initDb().then(render).catch((err) => {
  console.error("Failed to init db:", err);
  render(); // render app anyway, db functions will no-op
});
