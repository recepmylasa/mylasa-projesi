// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreview.js
import React, { useEffect, useMemo, useRef } from "react";

// ✅ Backward-safe import: named export yoksa bile build patlamasın
import * as routeDetailUtils from "../routeDetailUtils";

/* -------------------- Robust Lat/Lng Extractor (GeoPoint / LatLng / nested / array) -------------------- */
function toNum(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function inRangeLatLng(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function extractFromLatLngMethods(obj) {
  try {
    if (!obj) return null;
    if (typeof obj.lat === "function" && typeof obj.lng === "function") {
      const la = toNum(obj.lat());
      const ln = toNum(obj.lng());
      if (la == null || ln == null) return null;
      if (!inRangeLatLng(la, ln)) return null;
      return { lat: la, lng: ln };
    }
  } catch {}
  return null;
}

function extractFromGeoPoint(obj) {
  try {
    if (!obj) return null;
    // Firestore GeoPoint: { latitude, longitude }
    const la = toNum(obj.latitude);
    const ln = toNum(obj.longitude);
    if (la == null || ln == null) return null;
    if (!inRangeLatLng(la, ln)) return null;
    return { lat: la, lng: ln };
  } catch {}
  return null;
}

function extractFromPlain(obj) {
  try {
    if (!obj || typeof obj !== "object") return null;

    // direct {lat,lng}
    const la0 = toNum(obj.lat);
    const ln0 = toNum(obj.lng);
    if (la0 != null && ln0 != null && inRangeLatLng(la0, ln0)) return { lat: la0, lng: ln0 };

    // alt keys {latitude, longitude}
    const la1 = toNum(obj.latitude);
    const ln1 = toNum(obj.longitude);
    if (la1 != null && ln1 != null && inRangeLatLng(la1, ln1)) return { lat: la1, lng: ln1 };

    // nested candidates
    const nestedKeys = ["position", "location", "loc", "geo", "coords", "coordinate", "latLng", "point", "center"];
    for (const k of nestedKeys) {
      const v = obj[k];
      if (!v) continue;
      const got = extractFromLatLngMethods(v) || extractFromGeoPoint(v) || extractFromPlain(v);
      if (got) return got;
    }

    // sometimes {lat: {lat,lng}} etc.
    if (obj.lat && typeof obj.lat === "object") {
      const got = extractFromLatLngMethods(obj.lat) || extractFromGeoPoint(obj.lat) || extractFromPlain(obj.lat);
      if (got) return got;
    }
  } catch {}
  return null;
}

function extractLatLngAny(v) {
  try {
    if (!v) return null;

    // [lat,lng] or [lng,lat]
    if (Array.isArray(v) && v.length >= 2) {
      const a = toNum(v[0]);
      const b = toNum(v[1]);
      if (a == null || b == null) return null;

      const asLatLng = inRangeLatLng(a, b) ? { lat: a, lng: b } : null;
      const asLngLat = inRangeLatLng(b, a) ? { lat: b, lng: a } : null;

      return asLatLng || asLngLat || null;
    }

    // google.maps.LatLng-like
    const m = extractFromLatLngMethods(v);
    if (m) return m;

    // Firestore GeoPoint
    const g = extractFromGeoPoint(v);
    if (g) return g;

    // plain / nested objects
    const p = extractFromPlain(v);
    if (p) return p;

    return null;
  } catch {
    return null;
  }
}
/* ------------------------------------------------------------------------------------------------------- */

/**
 * getLL(a,b) → {lat,lng} | null
 * - routeDetailUtils.getValidLatLngSafe varsa onu kullanır (en güvenlisi)
 * - yoksa internal extractor + getValidLatLng (varsa) ile doğrular
 */
const getLL = (a, b) => {
  try {
    // 1) varsa en güvenlisi
    if (typeof routeDetailUtils.getValidLatLngSafe === "function") {
      const out = routeDetailUtils.getValidLatLngSafe(a, b);
      const la = toNum(out?.lat);
      const ln = toNum(out?.lng);
      return inRangeLatLng(la, ln) ? { lat: la, lng: ln } : null;
    }

    // 2) internal normalize
    let ll = null;

    if (b !== undefined) {
      const la = toNum(a);
      const ln = toNum(b);
      if (la != null && ln != null && inRangeLatLng(la, ln)) ll = { lat: la, lng: ln };
    } else {
      ll = extractLatLngAny(a);
    }

    if (!ll) return null;

    // 3) util validate (varsa)
    if (typeof routeDetailUtils.getValidLatLng === "function") {
      const v = routeDetailUtils.getValidLatLng(ll.lat, ll.lng);
      if (v && toNum(v.lat) != null && toNum(v.lng) != null) {
        const la = toNum(v.lat);
        const ln = toNum(v.lng);
        return inRangeLatLng(la, ln) ? { lat: la, lng: ln } : null;
      }
    }

    return ll;
  } catch {
    return null;
  }
};

/**
 * mapRef bazen React ref (mapRef.current), bazen direkt Map instance gelebiliyor.
 * Bu helper ikisini de tekleştirir.
 */
function getMapInstance(mapRefLike) {
  try {
    if (!mapRefLike) return null;
    const m = mapRefLike?.current ? mapRefLike.current : mapRefLike;
    if (!m) return null;
    if (typeof m.setCenter === "function" && typeof m.fitBounds === "function") return m;
    return null;
  } catch {
    return null;
  }
}

function key5Any(v) {
  const ll = getLL(v);
  if (!ll) return null;
  const la = Number(ll.lat);
  const ln = Number(ll.lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return `${la.toFixed(5)},${ln.toFixed(5)}`;
}

function buildStopsSignature(stops) {
  const arr = Array.isArray(stops) ? stops : [];
  const parts = arr
    .map((s) => {
      const id = s?.id != null ? String(s.id) : s?.stopId != null ? String(s.stopId) : "";
      const k = key5Any(s) || "x";
      return `${id}@${k}`;
    })
    .sort((a, b) => a.localeCompare(b));
  return parts.join("|");
}

function buildPathSignature(path) {
  const arr = Array.isArray(path) ? path : [];
  const pts = [];
  let minLat = Infinity,
    minLng = Infinity,
    maxLat = -Infinity,
    maxLng = -Infinity;

  for (const p of arr) {
    const ll = getLL(p);
    if (!ll) continue;
    const la = Number(ll.lat);
    const ln = Number(ll.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
    pts.push({ lat: la, lng: ln });
    if (la < minLat) minLat = la;
    if (ln < minLng) minLng = ln;
    if (la > maxLat) maxLat = la;
    if (ln > maxLng) maxLng = ln;
  }

  if (!pts.length) return "";

  const first = pts[0];
  const last = pts[pts.length - 1];
  const mid = pts[Math.floor(pts.length / 2)];

  const bbox = `${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)}`;
  const ends = `${first.lat.toFixed(5)},${first.lng.toFixed(5)}|${last.lat.toFixed(5)},${last.lng.toFixed(5)}`;
  const sample = `${mid.lat.toFixed(5)},${mid.lng.toFixed(5)}`;

  return `${pts.length}|${bbox}|${ends}|${sample}`;
}

function buildFitSignature(path, stops) {
  const keys = [];
  let minLat = Infinity,
    minLng = Infinity,
    maxLat = -Infinity,
    maxLng = -Infinity;

  const addAny = (v) => {
    const ll = getLL(v);
    if (!ll) return;
    const la = Number(ll.lat);
    const ln = Number(ll.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;

    const k = `${la.toFixed(5)},${ln.toFixed(5)}`;
    keys.push(k);

    if (la < minLat) minLat = la;
    if (ln < minLng) minLng = ln;
    if (la > maxLat) maxLat = la;
    if (ln > maxLng) maxLng = ln;
  };

  (Array.isArray(path) ? path : []).forEach((p) => addAny(p));
  (Array.isArray(stops) ? stops : []).forEach((s) => addAny(s));

  if (!keys.length) return "";

  const uniq = Array.from(new Set(keys)).sort((a, b) => a.localeCompare(b));
  const a = uniq[0] || "";
  const b = uniq[1] || "";
  const y = uniq.length >= 2 ? uniq[uniq.length - 2] : "";
  const z = uniq[uniq.length - 1] || "";

  const bbox = `${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)}`;
  return `${uniq.length}|${bbox}|${a}|${b}|${y}|${z}`;
}

function collectAllPts(path, stops) {
  const out = [];
  (Array.isArray(path) ? path : []).forEach((p) => {
    const ll = getLL(p);
    if (ll) out.push(ll);
  });
  (Array.isArray(stops) ? stops : []).forEach((s) => {
    const ll = getLL(s);
    if (ll) out.push(ll);
  });
  return out;
}

function getBestMapDiv(map, mapDivRef) {
  try {
    const d1 = typeof map?.getDiv === "function" ? map.getDiv() : null;
    if (d1) return d1;
  } catch {}
  try {
    if (mapDivRef?.current) return mapDivRef.current;
  } catch {}
  return null;
}

function divHasSize(div) {
  try {
    if (!div) return false;
    const w = div.offsetWidth || 0;
    const h = div.offsetHeight || 0;
    return w > 8 && h > 8;
  } catch {
    return false;
  }
}

export default function RouteDetailMapPreview({
  routeId,
  gmapsStatus,
  mapDivRef, // shell veriyor olabilir; burada opsiyonel
  mapRef,
  mapInstance, // ✅ shell EMİR 4: mapRef.current değişince render kaçmasın diye opsiyonel direkt instance
  mapReadyTick, // ✅ shell EMİR 4: ready tick (opsiyonel)
  path,
  stops,
  stopsLoaded = true,
}) {
  const polylineRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const lastStopsSigRef = useRef(null);
  const lastPathSigRef = useRef(null);
  const lastFitSigRef = useRef(null);
  const lastMapInstanceRef = useRef(null);
  const rafRef = useRef(0);

  const fitTimersRef = useRef([]);
  const idleListenerRef = useRef(null);

  const stopsSig = useMemo(() => buildStopsSignature(stops), [stops]);
  const pathSig = useMemo(() => buildPathSignature(path), [path]);
  const fitSig = useMemo(() => buildFitSignature(path, stops), [path, stops]);

  const cancelRaf = () => {
    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    rafRef.current = 0;
  };

  const clearFitTimers = () => {
    try {
      fitTimersRef.current.forEach((t) => {
        try {
          clearTimeout(t);
        } catch {}
      });
    } catch {}
    fitTimersRef.current = [];
  };

  const clearIdleListener = () => {
    try {
      if (idleListenerRef.current && window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(idleListenerRef.current);
      }
    } catch {}
    idleListenerRef.current = null;
  };

  const clearArtifacts = () => {
    cancelRaf();
    clearFitTimers();
    clearIdleListener();

    try {
      stopMarkersRef.current.forEach((m) => {
        try {
          m.setMap(null);
        } catch {}
      });
    } catch {}
    stopMarkersRef.current = [];

    try {
      if (polylineRef.current) {
        try {
          polylineRef.current.setMap(null);
        } catch {}
      }
    } catch {}
    polylineRef.current = null;
  };

  // ✅ route değişince reset
  useEffect(() => {
    lastStopsSigRef.current = null;
    lastPathSigRef.current = null;
    lastFitSigRef.current = null;
    lastMapInstanceRef.current = null;
    clearArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  useEffect(() => {
    return () => clearArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const map = useMemo(() => {
    const m = mapInstance || getMapInstance(mapRef);
    return m || null;
    // mapReadyTick sadece dependency olarak “değişim yakalasın” diye
  }, [mapInstance, mapRef, mapReadyTick]);

  // ✅ Map instance değiştiyse artifacts reset (world view / eski polyline kalıntısı engeli)
  useEffect(() => {
    if (!map) return;
    if (lastMapInstanceRef.current !== map) {
      lastMapInstanceRef.current = map;
      lastStopsSigRef.current = null;
      lastPathSigRef.current = null;
      lastFitSigRef.current = null;
      clearArtifacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // ✅ Polyline çiz
  useEffect(() => {
    if (gmapsStatus !== "ready" && gmapsStatus !== "loaded") return;
    if (!(window.google && window.google.maps)) return;
    if (!map) return;

    if (lastPathSigRef.current === pathSig) return;
    lastPathSigRef.current = pathSig;

    const pts = (Array.isArray(path) ? path : [])
      .map((p) => getLL(p))
      .filter(Boolean)
      .map((ll) => ({ lat: Number(ll.lat), lng: Number(ll.lng) }))
      .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));

    if (!pts.length) {
      if (polylineRef.current) {
        try {
          polylineRef.current.setPath([]);
        } catch {}
      }
      return;
    }

    const gm = window.google.maps;

    if (!polylineRef.current) {
      polylineRef.current = new gm.Polyline({
        path: pts,
        geodesic: true,
        strokeColor: "#111",
        strokeOpacity: 0.95,
        strokeWeight: 4,
        clickable: false,
      });
      try {
        polylineRef.current.setMap(map);
      } catch {}
    } else {
      try {
        polylineRef.current.setPath(pts);
      } catch {}
    }
  }, [gmapsStatus, map, pathSig, path]);

  // ✅ Stop marker’ları
  useEffect(() => {
    if (gmapsStatus !== "ready" && gmapsStatus !== "loaded") return;
    if (!(window.google && window.google.maps)) return;
    if (!stopsLoaded) return;
    if (!map) return;

    if (lastStopsSigRef.current === stopsSig) return;
    lastStopsSigRef.current = stopsSig;

    try {
      stopMarkersRef.current.forEach((m) => {
        try {
          m.setMap(null);
        } catch {}
      });
    } catch {}
    stopMarkersRef.current = [];

    const gm = window.google.maps;

    const arr = Array.isArray(stops) ? stops : [];
    const ordered = arr.slice().sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));

    ordered.forEach((s, idx) => {
      const ll = getLL(s);
      if (!ll) return;
      const la = Number(ll.lat);
      const ln = Number(ll.lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return;

      const labelText = String(s?.order || idx + 1);

      try {
        const marker = new gm.Marker({
          position: { lat: la, lng: ln },
          map,
          label: {
            text: labelText,
            color: "#111",
            fontSize: "12px",
            fontWeight: "900",
          },
          icon: {
            path: gm.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#fff",
            fillOpacity: 1,
            strokeColor: "#111",
            strokeOpacity: 1,
            strokeWeight: 2,
          },
          clickable: false,
        });
        stopMarkersRef.current.push(marker);
      } catch {}
    });
  }, [gmapsStatus, map, stopsSig, stops, stopsLoaded]);

  // ✅ Fit bounds (EMİR 4): container-size + idle + retry backoff
  useEffect(() => {
    if (gmapsStatus !== "ready" && gmapsStatus !== "loaded") return;
    if (!(window.google && window.google.maps)) return;
    if (!map) return;

    if (lastFitSigRef.current === fitSig) return;
    lastFitSigRef.current = fitSig;

    const gm = window.google.maps;

    // path + stops → tek normalize havuzu (dedupe + finite)
    const ptsRaw = collectAllPts(path, stops)
      .map((x) => ({ lat: Number(x.lat), lng: Number(x.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    if (!ptsRaw.length) return;

    const uniqMap = new Map();
    ptsRaw.forEach((p) => {
      const k = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
      if (!uniqMap.has(k)) uniqMap.set(k, p);
    });
    const pts = Array.from(uniqMap.values());

    const padding = { top: 24, bottom: 24, left: 24, right: 24 };

    clearFitTimers();
    clearIdleListener();
    cancelRaf();

    const doApply = (attempt) => {
      try {
        // container ölçüsü 0 ise fitBounds boşa gider → retry
        const div = getBestMapDiv(map, mapDivRef);
        if (!divHasSize(div)) {
          if (attempt < 6) {
            const t = setTimeout(() => doApply(attempt + 1), 80 + attempt * 120);
            fitTimersRef.current.push(t);
          }
          return;
        }

        if (pts.length === 1) {
          map.setCenter(pts[0]);
          map.setZoom(15);
        } else {
          const bounds = new gm.LatLngBounds();
          pts.forEach((p) => bounds.extend(p));
          map.fitBounds(bounds, padding);
        }

        // “idle” sonrası bir kez daha uygula (bazı cihazlarda ilk fit yutuluyor)
        try {
          if (window.google?.maps?.event?.addListenerOnce) {
            idleListenerRef.current = window.google.maps.event.addListenerOnce(map, "idle", () => {
              try {
                if (pts.length === 1) {
                  map.setCenter(pts[0]);
                  map.setZoom(15);
                } else {
                  const bounds2 = new gm.LatLngBounds();
                  pts.forEach((p) => bounds2.extend(p));
                  map.fitBounds(bounds2, padding);
                }
              } catch {}
            });
          }
        } catch {}

        // küçük backoff retries (çok minimal)
        if (attempt < 2) {
          const delays = [140, 420];
          const t = setTimeout(() => doApply(attempt + 1), delays[attempt] || 240);
          fitTimersRef.current.push(t);
        }
      } catch {}
    };

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      doApply(0);
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmapsStatus, map, fitSig, path, stops]);

  return null;
}
