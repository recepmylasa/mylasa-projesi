// src/analytics/shareEvents.js
// Uygulama içinden "Uygulamada Aç" telemetri eventlerini göndermek için helper.
// Endpoint: /t/share-open  → firebase.json'da logShareEvent'e rewrite edilmesi bekleniyor.

const LOG_ENDPOINT = "/t/share-open";

function send(payload) {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(LOG_ENDPOINT, body);
    } else {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", LOG_ENDPOINT, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(body);
    }
  } catch (e) {
    // sessiz düş
  }
}

function basePayload(routeId) {
  return {
    routeId: routeId || "",
    ua: (typeof navigator !== "undefined" && navigator.userAgent) || "",
    ts: Date.now(),
  };
}

export function trackSharePageView(routeId) {
  const payload = {
    ...basePayload(routeId),
    evt: "share_page_view",
  };
  send(payload);
}

export function trackShareOpenClick({ mode, routeId }) {
  const payload = {
    ...basePayload(routeId),
    evt: "share_open_click",
    mode: mode || null,
  };
  send(payload);
}

export function trackOpenResult({ result, routeId }) {
  const payload = {
    ...basePayload(routeId),
    evt: "open_result",
    mode: result || null,
  };
  send(payload);
}
