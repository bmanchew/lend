import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Enable HMR with proper error handling
if (import.meta.hot) {
  import.meta.hot.accept((err) => {
    if (err) {
      console.error('HMR update error:', err);
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);