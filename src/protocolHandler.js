// src/protocolHandler.js
// web+mylasa protokolü ile gelen /protocol-handler?r=/r/:routeId
// linklerini alıp, SPA içinde rota modalını açar.

export default function handleProtocol() {
  if (typeof window === "undefined") return;

  // Aynı oturumda birden fazla kez tetiklenmesin
  if (window.__mylasaProtocolHandled) return;
  window.__mylasaProtocolHandled = true;

  try {
    const search = window.location.search || "";
    const params = new URLSearchParams(search);
    const raw = params.get("r") || "";
    if (!raw) {
      window.history.replaceState({}, "", "/");
      return;
    }

    const match = raw.match(/\/r\/([A-Za-z0-9_-]+)/);
    if (!match) {
      window.history.replaceState({}, "", "/");
      return;
    }
    const routeId = match[1];

    const targetPath = `/r/${routeId}`;
    const current = window.location.pathname + window.location.search;
    if (current !== targetPath) {
      window.history.replaceState({ modal: "route", id: routeId }, "", targetPath);
    }

    const ev = new CustomEvent("open-route-modal", {
      detail: { routeId, follow: false }
    });
    window.dispatchEvent(ev);
  } catch (e) {
    try {
      window.history.replaceState({}, "", "/");
    } catch {}
  }
}
