// src/utils/routeCoverEvents.js
// EMİR-3: Route cover optimistic propagation (UI hızlandırma).
// - emitRouteCoverUpdated({ routeId, cover, ts? })
// - onRouteCoverUpdated((payload) => ...) -> unsubscribe
// - applyRouteCoverPatchToRoute / applyRouteCoverPatchToList : state patch helper (kopya kod olmasın)

const EVENT_NAME = "route-cover-updated";

function getRouteIdLoose(route) {
  try {
    if (!route) return null;
    return (
      (route.id && String(route.id)) ||
      (route.routeId && String(route.routeId)) ||
      (route._id && String(route._id)) ||
      null
    );
  } catch {
    return null;
  }
}

function normalizeCoverLoose(cover) {
  const kindRaw = cover?.kind ? String(cover.kind) : "default";
  const kind =
    kindRaw === "picked" || kindRaw === "auto" || kindRaw === "default"
      ? kindRaw
      : "default";

  const url = cover?.url ? String(cover.url) : "";
  const out = { kind, url };

  if (cover?.stopId) out.stopId = String(cover.stopId);
  if (cover?.mediaId) out.mediaId = String(cover.mediaId);

  return out;
}

/**
 * Publish: RouteDetail / başka yerlerde kapak değiştiğinde çağır.
 * Bu sadece UI hızlandırma; asıl doğruluk Firestore snapshot.
 */
export function emitRouteCoverUpdated({ routeId, cover, ts } = {}) {
  if (typeof window === "undefined") return;
  if (!routeId) return;

  const payload = {
    routeId: String(routeId),
    cover: normalizeCoverLoose(cover || {}),
    ts: typeof ts === "number" ? ts : Date.now(),
  };

  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
  } catch {
    // eski browser fallback (çok nadir)
    try {
      const ev = document.createEvent("CustomEvent");
      ev.initCustomEvent(EVENT_NAME, false, false, payload);
      window.dispatchEvent(ev);
    } catch {}
  }
}

/**
 * Subscribe: route kapak güncellemesini dinle.
 * return unsubscribe
 */
export function onRouteCoverUpdated(handler) {
  if (typeof window === "undefined") return () => {};
  if (typeof handler !== "function") return () => {};

  const listener = (e) => {
    const d = e?.detail;
    if (!d || !d.routeId || !d.cover) return;
    handler(d);
  };

  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

/**
 * Tek route objesini patch’ler. Re-render tetiklemek için yeni referans döndürür.
 * Eğer routeId eşleşmezse aynı objeyi döndürür (perf).
 */
export function applyRouteCoverPatchToRoute(route, payload) {
  try {
    if (!route || !payload?.routeId || !payload?.cover) return route;

    const id = getRouteIdLoose(route);
    if (!id || id !== String(payload.routeId)) return route;

    const nextCover = normalizeCoverLoose(payload.cover);

    // Eşitse gereksiz re-render yapma
    const cur = route.cover || {};
    const same =
      String(cur.kind || "") === String(nextCover.kind || "") &&
      String(cur.url || "") === String(nextCover.url || "") &&
      String(cur.stopId || "") === String(nextCover.stopId || "") &&
      String(cur.mediaId || "") === String(nextCover.mediaId || "");

    if (same) return route;

    return {
      ...route,
      cover: {
        ...(route.cover || {}),
        ...nextCover,
        ...(payload.ts ? { _optimisticTs: payload.ts } : {}),
      },
    };
  } catch {
    return route;
  }
}

/**
 * Route listesi (array) patch: Sadece ilgili routeId item’ını günceller.
 * Hiç değişiklik yoksa aynı array referansını döndürür. (perf + EMİR-6)
 */
export function applyRouteCoverPatchToList(list, payload) {
  try {
    if (!Array.isArray(list) || !payload?.routeId || !payload?.cover) return list;

    const rid = String(payload.routeId);

    // sadece hedef route’u bul
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const id = getRouteIdLoose(it);
      if (id && id === rid) {
        idx = i;
        break;
      }
    }

    if (idx === -1) return list;

    const cur = list[idx];
    const patched = applyRouteCoverPatchToRoute(cur, payload);
    if (patched === cur) return list;

    const next = list.slice();
    next[idx] = patched;
    return next;
  } catch {
    return list;
  }
}
