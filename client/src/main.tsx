import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Enable HMR
if (import.meta.hot) {
  import.meta.hot.accept();
}

createRoot(document.getElementById("root")!).render(<App />);