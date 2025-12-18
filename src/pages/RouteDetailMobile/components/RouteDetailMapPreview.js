// src/pages/RouteDetailMobile/components/RouteDetailMapPreview.js
import React, { useEffect, useMemo, useRef } from "react";

// ✅ Backward-safe import: getValidLatLngSafe yoksa bile build patlamasın
import * as routeDetailUtils from "../routeDetailUtils";

const getLL = (a, b) => {
  try {
    if (typeof routeDetailUtils.getValidLatLngSafe === "function") {
      return routeDetailUtils.getValidLatLngSafe(a, b);
    }
    if (typeof routeDetailUtils.getValidLatLng === "function") {
      // fallback
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
  mapDivRef,
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

  // route değişince tam temizlik
  useEffect(() => {
    lastStopsSigRef.current = null;
    lastPathSigRef.current = null;
    lastFitSigRef.current = null;
    lastMapInstanceRef.current = null;
    clearArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // unmount cleanup
  useEffect(() => {
    return () => {
      clearArtifacts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polyline: sadece pathSig değişince setPath
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

    // path yoksa polyline temizle (varsa)
    if (!pathSig) {
      if (polylineRef.current) {
        try {
          polylineRef.current.setPath([]);
        } catch {}
      }
      lastPathSigRef.current = pathSig;
      return;
    }

    if (pathSig === lastPathSigRef.current && polylineRef.current) return;

    if (!polylineRef.current) {
      polylineRef.current = new window.google.maps.Polyline({
        map,
        clickable: false,
        geodesic: true,
        strokeColor: "#1a73e8",
        strokeOpacity: 0.95,
        strokeWeight: 4,
      });
    } else {
      try {
        polylineRef.current.setMap(map);
      } catch {}
    }

    const pts = [];
    (Array.isArray(path) ? path : []).forEach((p) => {
      const ll = getLL(p?.lat, p?.lng);
      if (!ll) return;
      pts.push(new window.google.maps.LatLng(ll.lat, ll.lng));
    });

    try {
      polylineRef.current.setPath(pts);
    } catch {}

    lastPathSigRef.current = pathSig;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmapsStatus, mapRef, pathSig, path]);

  // Markers: sadece stopsSig değişince yeniden yarat
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

    const hasMarkers = (stopMarkersRef.current || []).length > 0;
    if (stopsSig === lastStopsSigRef.current && hasMarkers) return;

    try {
      stopMarkersRef.current.forEach((m) => {
        try {
          m.setMap(null);
        } catch {}
      });
    } catch {}
    stopMarkersRef.current = [];

    (Array.isArray(stops) ? stops : []).forEach((s) => {
      const ll = getLL(s?.lat, s?.lng);
      if (!ll) return;
      try {
        const mk = new window.google.maps.Marker({
          position: { lat: ll.lat, lng: ll.lng },
          map,
          title: s.title || `Durak ${s.order || ""}`,
        });
        stopMarkersRef.current.push(mk);
      } catch {}
    });

    lastStopsSigRef.current = stopsSig;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmapsStatus, mapRef, stopsSig, stops]);

  // Fit: sadece fitSig değişince (sıradan bağımsız) — false zıplama yok
  useEffect(() => {
    if (gmapsStatus !== "ready") return;
    if (!mapRef?.current) return;
    if (!(window.google && window.google.maps)) return;

    // ✅ stops snapshot gelmeden ilk fit atma
    if (!stopsLoaded) return;

    const map = mapRef.current;

    if (lastMapInstanceRef.current !== map) {
      lastMapInstanceRef.current = map;
      lastStopsSigRef.current = null;
      lastPathSigRef.current = null;
      lastFitSigRef.current = null;
      clearArtifacts();
    }

    if (!fitSig) return;
    if (fitSig === lastFitSigRef.current) return;

    const all = collectAllPts(path, stops);
    if (!all.length) return;

    if (all.length === 1) {
      try {
        map.setCenter(all[0]);
        map.setZoom(15);
      } catch {}
      lastFitSigRef.current = fitSig;
      return;
    }

    const b = new window.google.maps.LatLngBounds();
    all.forEach((pt) => b.extend(pt));

    cancelRaf();
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      try {
        map.fitBounds(b, 40);
      } catch {}
    });

    lastFitSigRef.current = fitSig;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmapsStatus, mapRef, fitSig, stopsLoaded, path, stops]);

  return <div ref={mapDivRef} className="route-detail-map-inner" />;
}
