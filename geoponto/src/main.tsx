import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./lib/registerServiceWorker";

registerServiceWorker();

// Recupera de chunks antigos após um novo deploy: quando um import()
// dinâmico falha (o HTML em cache aponta para um hash de chunk que não
// existe mais), forçamos um reload único para pegar o index.html novo.
const RELOAD_FLAG = "__chunk_reloaded__";
const isChunkLoadError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );

const handleChunkError = (message: string) => {
  if (!isChunkLoadError(message)) return;
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage indisponível — segue para reload direto
  }
  window.location.reload();
};

window.addEventListener("error", (event) => {
  handleChunkError(event.message ?? "");
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message =
    typeof reason === "string" ? reason : reason?.message ?? String(reason ?? "");
  handleChunkError(message);
});

// Limpa a flag após um carregamento bem-sucedido para permitir novos recoveries.
window.addEventListener("load", () => {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* noop */
  }
});

createRoot(document.getElementById("root")!).render(<App />);
