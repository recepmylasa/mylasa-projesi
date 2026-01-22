// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreview.js
import React, { useEffect, useMemo, useRef } from "react";
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

/**
 * Ambiguous [a,b] that could be [lat,lng] OR [lng,lat]
 * Heuristic:
 * - If abs(a) > abs(b) → assume [lat,lng]
 * - Else → assume GeoJSON [lng,lat]
 */
function parseArrayLatLng(arr) {
  try {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const a = toNum(arr[0]);
    const b = toNum(arr[1]);
    if (a == null || b == null) return null;

    const candLatLng = inRangeLatLng(a, b) ? { lat: a, lng: b } : null;
    const candLngLat = inRangeLatLng(b, a) ? { lat: b, lng: a } : null;

    if (candLatLng && !candLngLat) return candLatLng;
    if (!candLatLng && candLngLat) return candLngLat;
    if (!candLatLng && !candLngLat) return null;

    if (Math.abs(a) > Math.abs(b)) return candLatLng;
    return candLngLat;
  } catch {
    return null;
  }
}

function parseCoordString(str) {
  try {
    if (!str || typeof str !== "string") return null;
    const s = str.trim();
    if (!s) return null;

    const parts = s.split(/[,\s]+/).filter(Boolean);
    if (parts.length < 2) return null;

    const a = toNum(parts[0]);
    const b = toNum(parts[1]);
    if (a == null || b == null) return null;

    const candLatLng = inRangeLatLng(a, b) ? { lat: a, lng: b } : null;
    const candLngLat = inRangeLatLng(b, a) ? { lat: b, lng: a } : null;

    if (candLatLng && !candLngLat) return candLatLng;
    if (!candLatLng && candLngLat) return candLngLat;
    if (!candLatLng && !candLngLat) return null;

    if (Math.abs(a) > Math.abs(b)) return candLatLng;
    return candLngLat;
  } catch {
    return null;
  }
}

function parseLL(value, depth = 0) {
  try {
    if (!value || depth > 3) return null;

    if (typeof value === "string") return parseCoordString(value);

    if (Array.isArray(value) && value.length >= 2) {
      return parseArrayLatLng(value);
    }

    if (typeof value?.lat === "function" && typeof value?.lng === "function") {
      const la = toNum(value.lat());
      const ln = toNum(value.lng());
      return inRangeLatLng(la, ln) ? { lat: la, lng: ln } : null;
    }

    if (value?.latLng) {
      const out = parseLL(value.latLng, depth + 1);
      if (out) return out;
    }
    if (value?.geometry?.location) {
      const out = parseLL(value.geometry.location, depth + 1);
      if (out) return out;
    }

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

    const s1 = typeof value?.coord === "string" ? value.coord : null;
    const s2 = typeof value?.coords === "string" ? value.coords : null;
    const s3 = typeof value?.coordinate === "string" ? value.coordinate : null;
    const s4 = typeof value?.coordinates === "string" ? value.coordinates : null;

    const strParsed = parseCoordString(s1 || s2 || s3 || s4);
    if (strParsed) return strParsed;

    if (Array.isArray(value?.coordinates)) {
      const out = parseArrayLatLng(value.coordinates);
      if (out) return out;
    }

    return null;
  } catch {
    return null;
  }
}

function getLL(v) {
  try {
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

    const direct = parseLL(v, 0);
    if (direct) return direct;

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
      v?.stop?.location,
      v?.stop?.coords,
      v?.stop?.geo,
      v?.stop?.point,
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

function pickFitPoints(pathPts, stopPts) {
  const pathArr = Array.isArray(pathPts) ? pathPts : [];
  const stopArr = Array.isArray(stopPts) ? stopPts : [];

  const pathValid = pathArr
    .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && inRangeLatLng(p.lat, p.lng));

  const stopValid = stopArr
    .map((s) => getLL(s) || (Number.isFinite(s?.lat) && Number.isFinite(s?.lng) ? { lat: s.lat, lng: s.lng } : null))
    .filter(Boolean)
    .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && inRangeLatLng(p.lat, p.lng));

  if (pathValid.length >= 2) return { pts: pathValid, source: "path" };
  if (stopValid.length >= 1) return { pts: stopValid, source: "stops" };

  if (pathValid.length === 1) return { pts: pathValid, source: "path_one" };
  if (stopValid.length === 1) return { pts: stopValid, source: "stops_one" };

  return { pts: [], source: "none" };
}

function buildFitSignatureV2(pathPts, stopPts) {
  const { pts, source } = pickFitPoints(pathPts, stopPts);
  if (!pts.length) return "";

  let minLat = Infinity,
    minLng = Infinity,
    maxLat = -Infinity,
    maxLng = -Infinity;

  const keys = [];
  pts.forEach((p) => {
    const la = Number(p.lat);
    const ln = Number(p.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    const k = `${la.toFixed(5)},${ln.toFixed(5)}`;
    keys.push(k);
    if (la < minLat) minLat = la;
    if (ln < minLng) minLng = ln;
    if (la > maxLat) maxLat = la;
    if (ln > maxLng) maxLng = ln;
  });

  if (!keys.length) return "";
  const uniq = Array.from(new Set(keys)).sort((a, b) => a.localeCompare(b));
  const a = uniq[0] || "";
  const b = uniq[1] || "";
  const y = uniq.length >= 2 ? uniq[uniq.length - 2] : "";
  const z = uniq[uniq.length - 1] || "";
  const bbox = `${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)}`;

  return `${source}|${uniq.length}|${bbox}|${a}|${b}|${y}|${z}`;
}

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

function pickStartEnd(pathPts, stopsArr) {
  const pts = Array.isArray(pathPts) ? pathPts : [];
  const stops = Array.isArray(stopsArr) ? stopsArr : [];

  const pathValid = pts
    .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && inRangeLatLng(p.lat, p.lng));

  if (pathValid.length >= 2) {
    return { start: pathValid[0], end: pathValid[pathValid.length - 1] };
  }
  if (pathValid.length === 1) {
    return { start: pathValid[0], end: null };
  }

  const ordered = stops.slice().sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));

  const stopValid = ordered
    .map((s) => getLL(s) || (Number.isFinite(s?.lat) && Number.isFinite(s?.lng) ? { lat: s.lat, lng: s.lng } : null))
    .filter(Boolean)
    .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && inRangeLatLng(p.lat, p.lng));

  if (stopValid.length >= 2) return { start: stopValid[0], end: stopValid[stopValid.length - 1] };
  if (stopValid.length === 1) return { start: stopValid[0], end: null };

  return { start: null, end: null };
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
  const polylineGlowRef = useRef(null);
  const polylineRef = useRef(null);

  const markersRef = useRef({ start: null, end: null });
  const lastMarkersSigRef = useRef(null);

  const lastPathSigRef = useRef(null);

  const didFitKeyRef = useRef(null);
  const lastMapInstanceRef = useRef(null);

  const rafRef = useRef(0);
  const fitTimersRef = useRef([]);
  const idleListenerRef = useRef(null);

  const isReady = gmapsStatus === "ready" || gmapsStatus === "loaded";

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

  const clearMarkers = () => {
    try {
      if (markersRef.current.start) {
        try {
          markersRef.current.start.setMap(null);
        } catch {}
      }
      if (markersRef.current.end) {
        try {
          markersRef.current.end.setMap(null);
        } catch {}
      }
    } catch {}
    markersRef.current = { start: null, end: null };
  };

  const clearPolylines = () => {
    try {
      if (polylineGlowRef.current) {
        try {
          polylineGlowRef.current.setMap(null);
        } catch {}
      }
    } catch {}
    polylineGlowRef.current = null;

    try {
      if (polylineRef.current) {
        try {
          polylineRef.current.setMap(null);
        } catch {}
      }
    } catch {}
    polylineRef.current = null;
  };

  const clearArtifacts = () => {
    cancelRaf();
    clearFitTimers();
    clearIdleListener();
    clearMarkers();
    clearPolylines();
  };

  const pathNorm = useMemo(() => {
    try {
      if (typeof routeDetailUtils.normalizePathForPreview === "function") {
        const out = routeDetailUtils.normalizePathForPreview(path);
        if (Array.isArray(out)) return { pts: out, dropped: 0 };
        if (out && Array.isArray(out.pts)) return { pts: out.pts, dropped: Number(out.dropped) || 0 };
      }
    } catch {}

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

  const stopsForMap = stopsLoaded ? stopsNorm.stops : [];

  const pathSig = useMemo(() => buildPathSignature(pathNorm.pts), [pathNorm.pts]);

  const fitSig = useMemo(() => buildFitSignatureV2(pathNorm.pts, stopsForMap), [pathNorm.pts, stopsForMap]);
  const fitKey = useMemo(() => `${fitSig}::${Number(mapReadyTick) || 0}`, [fitSig, mapReadyTick]);

  const map = useMemo(() => {
    const m = mapInstance || getMapInstance(mapRef);
    return m || null;
  }, [mapInstance, mapRef, mapReadyTick]);

  useEffect(() => {
    lastPathSigRef.current = null;
    lastMarkersSigRef.current = null;
    didFitKeyRef.current = null;
    lastMapInstanceRef.current = null;
    clearArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  useEffect(() => {
    return () => clearArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) return;
    if (lastMapInstanceRef.current !== map) {
      lastMapInstanceRef.current = map;
      lastPathSigRef.current = null;
      lastMarkersSigRef.current = null;
      didFitKeyRef.current = null;
      clearArtifacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // ✅ Cyan polyline (glow + main) — harita stili default, sadece rota çizgisi cyan
  useEffect(() => {
    if (!isReady) return;
    if (!(window.google && window.google.maps)) return;
    if (!map) return;

    if (lastPathSigRef.current === pathSig) return;
    lastPathSigRef.current = pathSig;

    const pts = (Array.isArray(pathNorm.pts) ? pathNorm.pts : [])
      .map((ll) => ({ lat: Number(ll.lat), lng: Number(ll.lng) }))
      .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng) && inRangeLatLng(x.lat, x.lng));

    const gm = window.google.maps;

    if (!pts.length) {
      try {
        if (polylineGlowRef.current) polylineGlowRef.current.setPath([]);
      } catch {}
      try {
        if (polylineRef.current) polylineRef.current.setPath([]);
      } catch {}
      return;
    }

    if (!polylineGlowRef.current) {
      polylineGlowRef.current = new gm.Polyline({
        path: pts,
        geodesic: true,
        strokeColor: "#22d3ee",
        strokeOpacity: 0.22,
        strokeWeight: 8,
        clickable: false,
      });
      try {
        polylineGlowRef.current.setMap(map);
      } catch {}
    } else {
      try {
        polylineGlowRef.current.setPath(pts);
      } catch {}
    }

    if (!polylineRef.current) {
      polylineRef.current = new gm.Polyline({
        path: pts,
        geodesic: true,
        strokeColor: "#22d3ee",
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

  // ✅ Start/End markers (1–2 adet)
  useEffect(() => {
    if (!isReady) return;
    if (!(window.google && window.google.maps)) return;
    if (!map) return;

    const { start, end } = pickStartEnd(pathNorm.pts, stopsForMap);

    const sKey = start ? key5(start) : "";
    const eKey = end ? key5(end) : "";
    const sig = `${sKey || "x"}|${eKey || "x"}`;

    if (lastMarkersSigRef.current === sig) return;
    lastMarkersSigRef.current = sig;

    clearMarkers();

    if (!start && !end) return;

    const gm = window.google.maps;

    const mk = (pos, kind) => {
      try {
        const isEnd = kind === "end";
        return new gm.Marker({
          position: pos,
          map,
          clickable: false,
          icon: {
            path: gm.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: isEnd ? "#22d3ee" : "#ffffff",
            fillOpacity: 1,
            strokeColor: isEnd ? "#ffffff" : "#22d3ee",
            strokeOpacity: 1,
            strokeWeight: 2.5,
          },
        });
      } catch {
        return null;
      }
    };

    if (start) {
      const la = Number(start.lat);
      const ln = Number(start.lng);
      if (inRangeLatLng(la, ln)) {
        const m1 = mk({ lat: la, lng: ln }, "start");
        if (m1) markersRef.current.start = m1;
      }
    }

    if (end) {
      const la = Number(end.lat);
      const ln = Number(end.lng);
      if (inRangeLatLng(la, ln) && (!start || key5(start) !== key5(end))) {
        const m2 = mk({ lat: la, lng: ln }, "end");
        if (m2) markersRef.current.end = m2;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, map, pathNorm.pts, stopsForMap]);

  // ✅ Fit bounds (priority + padding + zoom clamp + 0px retry + strict guard)
  useEffect(() => {
    if (!isReady) return;
    if (!(window.google && window.google.maps)) return;
    if (!map) return;

    if (didFitKeyRef.current === fitKey) return;
    didFitKeyRef.current = fitKey;

    const gm = window.google.maps;

    const { pts: fitPts } = pickFitPoints(pathNorm.pts, stopsForMap);
    if (!Array.isArray(fitPts) || !fitPts.length) return;

    const uniqMap = new Map();
    fitPts.forEach((p) => {
      const la = Number(p?.lat);
      const ln = Number(p?.lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
      if (!inRangeLatLng(la, ln)) return;
      const k = `${la.toFixed(6)},${ln.toFixed(6)}`;
      if (!uniqMap.has(k)) uniqMap.set(k, { lat: la, lng: ln });
    });
    const pts = Array.from(uniqMap.values());
    if (!pts.length) return;

    const paddingPx = 52;
    const padding = { top: paddingPx, bottom: paddingPx, left: paddingPx, right: paddingPx };

    clearFitTimers();
    clearIdleListener();
    cancelRaf();

    const clampZoomOnIdleOnce = () => {
      try {
        if (window.google?.maps?.event?.addListenerOnce) {
          idleListenerRef.current = window.google.maps.event.addListenerOnce(map, "idle", () => {
            try {
              const z = typeof map.getZoom === "function" ? map.getZoom() : null;
              if (typeof z === "number" && Number.isFinite(z) && z > 17) {
                map.setZoom(17);
              }
            } catch {}
          });
        }
      } catch {}
    };

    const applyFit = (attempt) => {
      try {
        const div = getBestMapDiv(map, mapDivRef);

        if (!divHasSize(div)) {
          if (attempt < 6) {
            const t = setTimeout(() => applyFit(attempt + 1), 70 + attempt * 110);
            fitTimersRef.current.push(t);
          }
          return;
        }

        try {
          if (window.google?.maps?.event?.trigger) {
            window.google.maps.event.trigger(map, "resize");
          }
        } catch {}

        if (pts.length === 1) {
          map.setCenter(pts[0]);
          map.setZoom(15);
          clampZoomOnIdleOnce();
          return;
        }

        const bounds = new gm.LatLngBounds();
        pts.forEach((p) => bounds.extend(p));

        try {
          if (typeof bounds.isEmpty === "function" && bounds.isEmpty()) return;
        } catch {}

        map.fitBounds(bounds, padding);
        clampZoomOnIdleOnce();

        if (attempt === 0) {
          const t = setTimeout(() => applyFit(1), 180);
          fitTimersRef.current.push(t);
        }
      } catch {}
    };

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      applyFit(0);
    });

    return () => {
      cancelRaf();
      clearFitTimers();
      clearIdleListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, map, fitKey]);

  return null;
}
