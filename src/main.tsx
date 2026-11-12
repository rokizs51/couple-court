import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/fraunces/latin-800.css";
import "@fontsource/fraunces/latin-600-italic.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "./styles/tokens.css";
import "./styles.css";
import "./styles/vote.css";

registerSW({ immediate: true });
createRoot(document.getElementById("root")!).render(<App />);
