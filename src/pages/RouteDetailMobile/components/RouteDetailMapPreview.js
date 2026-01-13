// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreview.js
import React, { useEffect, useMemo, useRef } from "react";

// ✅ Backward-safe import: named export yoksa bile build patlamasın
import * as routeDetailUtils from "../routeDetailUtils";

/* -------------------- Safe number helpers -------------------- */
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

function parseCoordString(str) {
  try {
    if (!str || typeof str !== "string") return null;
    const s = str.trim();
    if (!s) return null;

    // "lat,lng" | "lat lng" | "lng,lat"
    const parts = s.split(/[,\s]+/).filter(Boolean);
    if (parts.length < 2) return null;

    const a = toNum(parts[0]);
    const b = toNum(parts[1]);
    if (a == null || b == null) return null;

    if (inRangeLatLng(a, b)) return { lat: a, lng: b };
    if (inRangeLatLng(b, a)) return { lat: b, lng: a };
    return null;
  } catch {
    return null;
  }
}

function parseLL(value, depth = 0) {
  try {
    if (!value || depth > 3) return null;

    // string -> "lat,lng"
    if (typeof value === "string") return parseCoordString(value);

    // [lat,lng] / [lng,lat]
    if (Array.isArray(value) && value.length >= 2) {
      const a = toNum(value[0]);
      const b = toNum(value[1]);
      if (a == null || b == null) return null;
      if (inRangeLatLng(a, b)) return { lat: a, lng: b };
      if (inRangeLatLng(b, a)) return { lat: b, lng: a };
      return null;
    }

    // Google LatLng: lat()/lng()
    if (typeof value?.lat === "function" && typeof value?.lng === "function") {
      const la = toNum(value.lat());
      const ln = toNum(value.lng());
      return inRangeLatLng(la, ln) ? { lat: la, lng: ln } : null;
    }

    // nested latLng (Google Places geometry.location gibi)
    if (value?.latLng) {
      const out = parseLL(value.latLng, depth + 1);
      if (out) return out;
    }
    if (value?.geometry?.location) {
      const out = parseLL(value.geometry.location, depth + 1);
      if (out) return out;
    }

    // GeoPoint variants
    const la =
      toNum(value?.lat) ??
      toNum(value?.latitude) ??
      toNum(value?._lat) ??
      toNum(value?._latitude) ??
      toNum(value?.y);

    const ln =
      toNum(value?.lng) ??
      toNum(value?.lon) ??
      toNum(value?.long) ??
      toNum(value?.longitude) ??
      toNum(value?._long) ??
      toNum(value?._longitude) ??
      toNum(value?.x);

    if (inRangeLatLng(la, ln)) return { lat: la, lng: ln };

    // coord string fields
    const s1 = typeof value?.coord === "string" ? value.coord : null;
    const s2 = typeof value?.coords === "string" ? value.coords : null;
    const s3 = typeof value?.coordinate === "string" ? value.coordinate : null;
    const s4 = typeof value?.coordinates === "string" ? value.coordinates : null;

    const strParsed = parseCoordString(s1 || s2 || s3 || s4);
    if (strParsed) return strParsed;

    return null;
  } catch {
    return null;
  }
}

/**
 * getLL(any) → {lat,lng} | null
 * Öncelik: routeDetailUtils.getValidLatLngSafe → normalizeLatLng → güçlü fallback
 */
function getLL(v) {
  try {
    // 1) Utils (varsa)
    if (typeof routeDetailUtils.getValidLatLngSafe === "function") {
      const out = routeDetailUtils.getValidLatLngSafe(v);
      const la = toNum(out?.lat);
      const ln = toNum(out?.lng);
      if (inRangeLatLng(la, ln)) return { lat: la, lng: ln };
    }

    if (typeof routeDetailUtils.normalizeLatLng === "function") {
      const out = routeDetailUtils.normalizeLatLng(v);
      const la = toNum(out?.lat);
      const ln = toNum(out?.lng);
      if (inRangeLatLng(la, ln)) return { lat: la, lng: ln };
    }

    // 2) Direct parse
    const direct = parseLL(v, 0);
    if (direct) return direct;

    // 3) Common nested candidates (stop / place / map data)
    const candidates = [
      v?.location,
      v?.loc,
      v?.geo,
      v?.geoPoint,
      v?.geopoint,
      v?.point,
      v?.position,
      v?.pos,
      v?.center,
      v?.coords,
      v?.coord,
      v?.latLng,
      v?.latlng,
      v?.data?.location,
      v?.raw?.location,
      v?.raw?.coords,
      v?.raw?.position,
      v?.place?.location,
      v?.place?.geometry?.location,
      v?.geometry?.location,
    ].filter(Boolean);

    for (const c of candidates) {
      const out = parseLL(c, 1);
      if (out) return out;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * mapRef bazen React ref (mapRef.current), bazen direkt Map instance gelebiliyor.
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

function key5(ll) {
  try {
    const la = Number(ll?.lat);
    const ln = Number(ll?.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
    return `${la.toFixed(5)},${ln.toFixed(5)}`;
  } catch {
    return null;
  }
}

function buildStopsSignature(stops) {
  const arr = Array.isArray(stops) ? stops : [];
  const parts = arr
    .map((s) => {
      const id = s?.id != null ? String(s.id) : s?.stopId != null ? String(s.stopId) : "";
      const ll = getLL(s) || (Number.isFinite(s?.lat) && Number.isFinite(s?.lng) ? { lat: s.lat, lng: s.lng } : null);
      const k = ll ? key5(ll) : null;
      return `${id}@${k || "x"}`;
    })
    .sort((a, b) => a.localeCompare(b));
  return parts.join("|");
}

function buildPathSignature(pathPts) {
  const pts = Array.isArray(pathPts) ? pathPts : [];
  if (!pts.length) return "";

  let minLat = Infinity,
    minLng = Infinity,
    maxLat = -Infinity,
    maxLng = -Infinity;

  const valid = [];
  for (const p of pts) {
    const la = Number(p?.lat);
    const ln = Number(p?.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
    valid.push({ lat: la, lng: ln });
    if (la < minLat) minLat = la;
    if (ln < minLng) minLng = ln;
    if (la > maxLat) maxLat = la;
    if (ln > maxLng) maxLng = ln;
  }

  if (!valid.length) return "";

  const first = valid[0];
  const last = valid[valid.length - 1];
  const mid = valid[Math.floor(valid.length / 2)];

  const bbox = `${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)}`;
  const ends = `${first.lat.toFixed(5)},${first.lng.toFixed(5)}|${last.lat.toFixed(5)},${last.lng.toFixed(5)}`;
  const sample = `${mid.lat.toFixed(5)},${mid.lng.toFixed(5)}`;

  return `${valid.length}|${bbox}|${ends}|${sample}`;
}

function buildFitSignature(pathPts, stopPts) {
  const keys = [];
  let minLat = Infinity,
    minLng = Infinity,
    maxLat = -Infinity,
    maxLng = -Infinity;

  const add = (ll) => {
    const la = Number(ll?.lat);
    const ln = Number(ll?.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    const k = `${la.toFixed(5)},${ln.toFixed(5)}`;
    keys.push(k);
    if (la < minLat) minLat = la;
    if (ln < minLng) minLng = ln;
    if (la > maxLat) maxLat = la;
    if (ln > maxLng) maxLng = ln;
  };

  (Array.isArray(pathPts) ? pathPts : []).forEach(add);
  (Array.isArray(stopPts) ? stopPts : []).forEach(add);

  if (!keys.length) return "";

  const uniq = Array.from(new Set(keys)).sort((a, b) => a.localeCompare(b));
  const a = uniq[0] || "";
  const b = uniq[1] || "";
  const y = uniq.length >= 2 ? uniq[uniq.length - 2] : "";
  const z = uniq[uniq.length - 1] || "";
  const bbox = `${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)}`;
  return `${uniq.length}|${bbox}|${a}|${b}|${y}|${z}`;
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
  mapDivRef,
  mapRef,
  mapInstance,
  mapReadyTick,
  path,
  stops,
  stopsLoaded = true,
}) {
  const polylineRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const lastStopsSigRef = useRef(null);
  const lastPathSigRef = useRef(null);
  const lastFitKeyRef = useRef(null);
  const lastMapInstanceRef = useRef(null);
  const rafRef = useRef(0);

  const fitTimersRef = useRef([]);
  const idleListenerRef = useRef(null);

  const isReady = gmapsStatus === "ready" || gmapsStatus === "loaded";

  // ✅ Canonical normalize (EMİR 17/18)
  const pathNorm = useMemo(() => {
    try {
      if (typeof routeDetailUtils.normalizePathForPreview === "function") {
        const out = routeDetailUtils.normalizePathForPreview(path);
        if (Array.isArray(out)) return { pts: out, dropped: 0 };
        if (out && Array.isArray(out.pts)) return { pts: out.pts, dropped: Number(out.dropped) || 0 };
      }
    } catch {}
    // fallback
    const list = Array.isArray(path) ? path : [];
    const pts = [];
    let dropped = 0;
    for (const p of list) {
      const ll = getLL(p);
      if (ll) pts.push(ll);
      else dropped += 1;
    }
    return { pts, dropped };
  }, [path]);

  const stopsNorm = useMemo(() => {
    try {
      if (typeof routeDetailUtils.normalizeStopsForPreview === "function") {
        const out = routeDetailUtils.normalizeStopsForPreview(stops);
        if (Array.isArray(out)) return { stops: out, dropped: 0 };
        if (out && Array.isArray(out.stops)) return { stops: out.stops, dropped: Number(out.dropped) || 0 };
      }
    } catch {}
    // fallback
    const list = Array.isArray(stops) ? stops : [];
    const out = [];
    let dropped = 0;
    for (const s of list) {
      const ll = getLL(s);
      if (ll) out.push({ ...(s || {}), lat: ll.lat, lng: ll.lng });
      else {
        dropped += 1;
        out.push({ ...(s || {}) });
      }
    }
    return { stops: out, dropped };
  }, [stops]);

  // markers/fit için stopsLoaded kontrolü (partial state world-view riskini azaltır)
  const stopsForMap = stopsLoaded ? stopsNorm.stops : [];

  const stopsSig = useMemo(() => buildStopsSignature(stopsForMap), [stopsForMap]);
  const pathSig = useMemo(() => buildPathSignature(pathNorm.pts), [pathNorm.pts]);
  const fitSig = useMemo(() => buildFitSignature(pathNorm.pts, stopsForMap), [pathNorm.pts, stopsForMap]);

  // ✅ mapReadyTick değişince fit tekrar denensin (shell resize/ready/instance swap)
  const fitKey = useMemo(() => `${fitSig}::${Number(mapReadyTick) || 0}`, [fitSig, mapReadyTick]);

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
    lastFitKeyRef.current = null;
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
  }, [mapInstance, mapRef, mapReadyTick]);

  // ✅ Map instance değiştiyse artifacts reset (eski polyline/marker kalıntısı engeli)
  useEffect(() => {
    if (!map) return;
    if (lastMapInstanceRef.current !== map) {
      lastMapInstanceRef.current = map;
      lastStopsSigRef.current = null;
      lastPathSigRef.current = null;
      lastFitKeyRef.current = null;
      clearArtifacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // ✅ Polyline çiz (canonical pathNorm.pts)
  useEffect(() => {
    if (!isReady) return;
    if (!(window.google && window.google.maps)) return;
    if (!map) return;

    if (lastPathSigRef.current === pathSig) return;
    lastPathSigRef.current = pathSig;

    const pts = (Array.isArray(pathNorm.pts) ? pathNorm.pts : [])
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
  }, [isReady, map, pathSig, pathNorm.pts]);

  // ✅ Stop marker’ları (canonical stopsForMap)
  useEffect(() => {
    if (!isReady) return;
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

    const arr = Array.isArray(stopsForMap) ? stopsForMap : [];
    const ordered = arr.slice().sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));

    ordered.forEach((s, idx) => {
      const ll = getLL(s) || (Number.isFinite(s?.lat) && Number.isFinite(s?.lng) ? { lat: s.lat, lng: s.lng } : null);
      if (!ll) return;

      const la = toNum(ll.lat);
      const ln = toNum(ll.lng);
      if (!inRangeLatLng(la, ln)) return;

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
  }, [isReady, map, stopsSig, stopsLoaded, stopsForMap]);

  // ✅ Fit bounds (container-size + idle + retry) + shell mapReadyTick ile yeniden deneme
  useEffect(() => {
    if (!isReady) return;
    if (!(window.google && window.google.maps)) return;
    if (!map) return;

    if (lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;

    const gm = window.google.maps;

    // path + stops → dedupe + finite
    const ptsRaw = []
      .concat(Array.isArray(pathNorm.pts) ? pathNorm.pts : [])
      .concat(Array.isArray(stopsForMap) ? stopsForMap : [])
      .map((x) => getLL(x) || (Number.isFinite(x?.lat) && Number.isFinite(x?.lng) ? { lat: x.lat, lng: x.lng } : null))
      .filter(Boolean)
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

        // minimal backoff retries
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
  }, [isReady, map, fitKey, pathNorm.pts, stopsForMap, mapDivRef]);

  return null;
}
