import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "@fontsource-variable/geist";
import "./index.css";
import { ThemeProvider } from "@/providers/ThemeProvider";

const chunkRecoveryKey = "sigap-chunk-recovery";
const recoverFromStaleChunk = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason || "");
  const staleChunk = /Failed to fetch dynamically imported module|Importing a module script failed|module script.*MIME type|Loading chunk .* failed/i.test(message);
  if (!staleChunk) return;

  const lastRecovery = Number(sessionStorage.getItem(chunkRecoveryKey) || 0);
  if (Date.now() - lastRecovery < 30_000) return;
  sessionStorage.setItem(chunkRecoveryKey, String(Date.now()));
  window.location.reload();
};

window.addEventListener("unhandledrejection", event => recoverFromStaleChunk(event.reason));
window.addEventListener("error", event => {
  const target = event.target;
  if (target instanceof HTMLScriptElement && target.src.includes("/assets/")) {
    recoverFromStaleChunk(new Error("Importing a module script failed"));
    return;
  }
  recoverFromStaleChunk(event.error || event.message);
}, true);

createRoot(document.getElementById("root")!).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
    storageKey="sigap-theme"
  >
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ThemeProvider>
);
