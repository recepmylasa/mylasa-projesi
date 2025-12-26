// src/pages/RouteDetailMobile/components/RouteDetailMapPreview.js
import React, { useEffect, useMemo, useRef } from "react";

// ✅ Backward-safe import: named export yoksa bile build patlamasın
import * as routeDetailUtils from "../routeDetailUtils";

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

function key5(lat, lng) {
  const ll = getLL(lat, lng);
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
      const k = key5(s?.lat, s?.lng) || "x";
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
    const ll = getLL(p?.lat, p?.lng);
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

  const add = (lat, lng) => {
    const ll = getLL(lat, lng);
    if (!ll) return;
    const la = Number(ll.lat);
    const ln = Number(ll.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;

    keys.push(`${la.toFixed(5)},${ln.toFixed(5)}`);

    if (la < minLat) minLat = la;
    if (ln < minLng) minLng = ln;
    if (la > maxLat) maxLat = la;
    if (ln > maxLng) maxLng = ln;
  };

  (Array.isArray(path) ? path : []).forEach((p) => add(p?.lat, p?.lng));
  (Array.isArray(stops) ? stops : []).forEach((s) => add(s?.lat, s?.lng));

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
    const ll = getLL(p?.lat, p?.lng);
    if (ll) out.push(ll);
  });
  (Array.isArray(stops) ? stops : []).forEach((s) => {
    const ll = getLL(s?.lat, s?.lng);
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
    if (gmapsStatus !== "ready") return;
    if (!mapRef?.current) return;
    if (!(window.google && window.google.maps)) return;

    const map = mapRef.current;

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
      .map((p) => getLL(p?.lat, p?.lng))
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
    if (gmapsStatus !== "ready") return;
    if (!mapRef?.current) return;
    if (!(window.google && window.google.maps)) return;

    const map = mapRef.current;
    if (!stopsLoaded) return;

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
    const ordered = arr.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

    ordered.forEach((s, idx) => {
      const ll = getLL(s?.lat, s?.lng);
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
    if (gmapsStatus !== "ready") return;
    if (!mapRef?.current) return;
    if (!(window.google && window.google.maps)) return;

    if (lastFitSigRef.current === fitSig) return;
    lastFitSigRef.current = fitSig;

    const map = mapRef.current;
    const gm = window.google.maps;

    const pts = collectAllPts(path, stops)
      .map((x) => ({ lat: Number(x.lat), lng: Number(x.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    if (!pts.length) return;

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
