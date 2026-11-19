import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerMediaCache } from "./lib/mediaCache";

createRoot(document.getElementById("root")!).render(<App />);
registerMediaCache();
