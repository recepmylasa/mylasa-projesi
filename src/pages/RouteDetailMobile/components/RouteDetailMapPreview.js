// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreview.js
import React, { useEffect, useMemo, useRef } from "react";

// ✅ Backward-safe import: named export yoksa bile build patlamasın
import * as routeDetailUtils from "../routeDetailUtils";

/**
 * getLL(a,b) → {lat,lng} | null
 * - routeDetailUtils.getValidLatLngSafe varsa onu kullanır (en güvenlisi)
 * - yoksa getValidLatLng fallback
 */
const getLL = (a, b) => {
  try {
    if (typeof routeDetailUtils.getValidLatLngSafe === "function") {
      return routeDetailUtils.getValidLatLngSafe(a, b);
    }
    if (typeof routeDetailUtils.getValidLatLng === "function") {
      if (a && typeof a === "object") return routeDetailUtils.getValidLatLng(a.lat, a.lng);
      return routeDetailUtils.getValidLatLng(a, b);
    }
    return null;
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
    // Google Maps Map instance için minimal kontrol
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

export default function RouteDetailMapPreview({
  routeId,
  gmapsStatus,
  mapDivRef, // (shell veriyor olabilir; burada şart değil)
  mapRef,
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

  const stopsSig = useMemo(() => buildStopsSignature(stops), [stops]);
  const pathSig = useMemo(() => buildPathSignature(path), [path]);
  const fitSig = useMemo(() => buildFitSignature(path, stops), [path, stops]);

  const cancelRaf = () => {
    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    rafRef.current = 0;
  };

  const clearArtifacts = () => {
    cancelRaf();

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

  // ✅ Polyline çiz
  useEffect(() => {
    if (gmapsStatus !== "ready" && gmapsStatus !== "loaded") return;
    if (!(window.google && window.google.maps)) return;

    const map = getMapInstance(mapRef);
    if (!map) return;

    if (lastMapInstanceRef.current !== map) {
      lastMapInstanceRef.current = map;
      lastStopsSigRef.current = null;
      lastPathSigRef.current = null;
      lastFitSigRef.current = null;
      clearArtifacts();
    }

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
  }, [gmapsStatus, mapRef, pathSig, path]);

  // ✅ Stop marker’ları
  useEffect(() => {
    if (gmapsStatus !== "ready" && gmapsStatus !== "loaded") return;
    if (!(window.google && window.google.maps)) return;
    if (!stopsLoaded) return;

    const map = getMapInstance(mapRef);
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
    const ordered = arr
      .slice()
      .sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));

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
  }, [gmapsStatus, mapRef, stopsSig, stops, stopsLoaded]);

  // ✅ Fit bounds
  useEffect(() => {
    if (gmapsStatus !== "ready" && gmapsStatus !== "loaded") return;
    if (!(window.google && window.google.maps)) return;

    if (lastFitSigRef.current === fitSig) return;
    lastFitSigRef.current = fitSig;

    const map = getMapInstance(mapRef);
    if (!map) return;

    const gm = window.google.maps;

    // EMİR 17: path + stops → tek normalize havuzu (dedupe + finite)
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

    cancelRaf();
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      try {
        if (pts.length === 1) {
          map.setCenter(pts[0]);
          map.setZoom(15);
          return;
        }

        const bounds = new gm.LatLngBounds();
        pts.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, { top: 24, bottom: 24, left: 24, right: 24 });
      } catch {}
    });
  }, [gmapsStatus, mapRef, fitSig, path, stops]);

  return null;
}
