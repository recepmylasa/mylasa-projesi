// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreviewShell.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGoogleMaps } from "../../../hooks/useGoogleMaps";
import RouteDetailMapPreview from "./RouteDetailMapPreview";

function pickLocationLabelFromStops(stops) {
  const arr = Array.isArray(stops) ? stops : [];
  for (const s of arr) {
    const v =
      s?.city ||
      s?.ilce ||
      s?.district ||
      s?.county ||
      s?.town ||
      s?.province ||
      s?.il ||
      s?.state ||
      s?.region ||
      s?.adminArea ||
      s?.administrativeArea ||
      s?.place?.city ||
      s?.place?.district ||
      s?.place?.province ||
      s?.place?.il ||
      null;

    if (typeof v === "string" && v.trim()) return v.trim();

    const vic =
      (typeof s?.place?.vicinity === "string" && s.place.vicinity) ||
      (typeof s?.place?.formatted_address === "string" && s.place.formatted_address) ||
      (typeof s?.address === "string" && s.address) ||
      null;

    if (typeof vic === "string" && vic.trim()) {
      const parts = vic
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return last;
    }
  }
  return "";
}

function toFiniteNumber(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidLat(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= -90 && n <= 90;
}

function isValidLng(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= -180 && n <= 180;
}

function extractLatLng(any) {
  if (!any) return null;

  // Array: [lat,lng] OR [lng,lat]
  try {
    if (Array.isArray(any) && any.length >= 2) {
      const a = toFiniteNumber(any[0]);
      const b = toFiniteNumber(any[1]);
      if (a != null && b != null) {
        // prefer [lat,lng]
        if (isValidLat(a) && isValidLng(b)) return { lat: a, lng: b };
        // fallback [lng,lat]
        if (isValidLat(b) && isValidLng(a)) return { lat: b, lng: a };
      }
    }
  } catch {}

  // google.maps.LatLng
  try {
    if (typeof any.lat === "function" && typeof any.lng === "function") {
      const lat = toFiniteNumber(any.lat());
      const lng = toFiniteNumber(any.lng());
      if (lat != null && lng != null && isValidLat(lat) && isValidLng(lng)) return { lat, lng };
    }
  } catch {}

  // Firestore GeoPoint (public)
  try {
    if (typeof any.latitude === "number" && typeof any.longitude === "number") {
      const lat = toFiniteNumber(any.latitude);
      const lng = toFiniteNumber(any.longitude);
      if (lat != null && lng != null && isValidLat(lat) && isValidLng(lng)) return { lat, lng };
    }
  } catch {}

  // Firestore GeoPoint (internal-ish variants): {_lat,_long} etc.
  try {
    const lat = toFiniteNumber(any._lat ?? any._latitude);
    const lng = toFiniteNumber(any._long ?? any._lng ?? any._longitude);
    if (lat != null && lng != null && isValidLat(lat) && isValidLng(lng)) return { lat, lng };
  } catch {}

  // Plain object {lat,lng} (+ variants)
  try {
    const lat = toFiniteNumber(
      any.lat ??
        any.latitude ??
        any._lat ??
        any._latitude ??
        any?.coords?.lat ??
        any?.coords?.latitude ??
        any?.coord?.lat ??
        any?.coord?.latitude
    );

    const lng = toFiniteNumber(
      any.lng ??
        any.longitude ??
        any.lon ??
        any.long ??
        any._lng ??
        any._long ??
        any._longitude ??
        any?.coords?.lng ??
        any?.coords?.longitude ??
        any?.coord?.lng ??
        any?.coord?.longitude
    );

    if (lat != null && lng != null && isValidLat(lat) && isValidLng(lng)) return { lat, lng };
  } catch {}

  // Nested candidates
  const candidates = [
    any?.location,
    any?.geo,
    any?.geopoint,
    any?.geoPoint,
    any?.point,
    any?.position,
    any?.center,
    any?.coord,
    any?.coords,
    any?.coordinates,
    any?.place?.location,
    any?.place?.geometry?.location,
    any?.place?.geometry,
    any?.stop?.location,
  ];

  for (const c of candidates) {
    const p = extractLatLng(c);
    if (p) return p;
  }

  return null;
}

function dedupConsecutive(points) {
  const dedup = [];
  const EPS = 1e-7;
  for (const p of points) {
    const prev = dedup[dedup.length - 1];
    if (!prev) {
      dedup.push(p);
      continue;
    }
    const sameLat = Math.abs(prev.lat - p.lat) < EPS;
    const sameLng = Math.abs(prev.lng - p.lng) < EPS;
    if (!(sameLat && sameLng)) dedup.push(p);
  }
  return dedup;
}

function normalizePointsFromPath(path) {
  const arr = Array.isArray(path) ? path : [];
  const out = [];
  for (const p of arr) {
    const ll = extractLatLng(p);
    if (ll) out.push(ll);
  }
  return dedupConsecutive(out);
}

function normalizePointsFromStops(stops) {
  const arr = Array.isArray(stops) ? stops.slice() : [];

  // Prefer deterministic order if present
  try {
    arr.sort((a, b) => {
      const ao = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.isFinite(Number(a?.index)) ? Number(a.index) : null;
      const bo = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.isFinite(Number(b?.index)) ? Number(b.index) : null;
      if (ao == null && bo == null) return 0;
      if (ao == null) return 1;
      if (bo == null) return -1;
      return ao - bo;
    });
  } catch {}

  const out = [];
  for (const s of arr) {
    const ll = extractLatLng(s);
    if (ll) out.push(ll);
  }
  return dedupConsecutive(out);
}

function makePinSvg({ fill = "#00E5FF", stroke = "rgba(0,0,0,0.65)" } = {}) {
  // small “balon” pin
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
    <defs>
      <filter id="s" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.45)"/>
      </filter>
    </defs>
    <g filter="url(#s)">
      <path d="M18 3c-5.2 0-9.4 4.2-9.4 9.4 0 7.1 7.9 16.7 9 18.1.2.3.6.5 1 .5s.7-.2 1-.5c1.1-1.4 9-11 9-18.1C27.4 7.2 23.2 3 18 3z"
            fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
      <circle cx="18" cy="12.6" r="3.2" fill="rgba(255,255,255,0.92)"/>
    </g>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
}

function sampleForBounds(points) {
  // bounds için örnekleme (polyline full kalsın)
  const arr = Array.isArray(points) ? points : [];
  const n = arr.length;
  if (n <= 420) return arr;

  const step = Math.ceil(n / 360); // ~360 nokta hedef
  const out = [];
  for (let i = 0; i < n; i += step) out.push(arr[i]);
  // son noktayı garanti et
  if (out[out.length - 1] !== arr[n - 1]) out.push(arr[n - 1]);
  return out;
}

export default function RouteDetailMapPreviewShell({
  routeId,
  path = [],
  stops = [],
  stopsLoaded = false,
  onRetry = () => {},
}) {
  const API_KEY =
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY ||
    process.env.REACT_APP_GMAPS_API_KEY ||
    process.env.REACT_APP_MAPS_API_KEY ||
    "";

  const MAP_ID =
    process.env.REACT_APP_GMAPS_MAP_ID ||
    process.env.REACT_APP_GOOGLE_MAPS_MAP_ID ||
    process.env.REACT_APP_MAP_ID ||
    "";

  const mapsOpts = useMemo(() => ({ API_KEY, MAP_ID }), [API_KEY, MAP_ID]);

  const gmaps = useGoogleMaps(mapsOpts) || {};

  const gmapsStatus =
    gmaps.gmapsStatus ||
    gmaps.status ||
    (gmaps.isLoaded ? "ready" : gmaps.error ? "error" : "loading");

  const hookMapDivRef = gmaps.mapDivRef || gmaps.containerRef || gmaps.divRef || null;
  const mapRef = gmaps.mapRef || gmaps.map || null;

  const isReady = gmapsStatus === "ready" || gmapsStatus === "loaded";
  const isError =
    gmapsStatus === "error" ||
    gmapsStatus === "failed" ||
    gmapsStatus === "blocked" ||
    gmapsStatus === "missing_key";

  const isLoading = !isReady && !isError;

  const [mapReadyTick, setMapReadyTick] = useState(0);
  const bumpTick = useCallback(() => {
    setMapReadyTick((t) => (t + 1) % 1000000);
  }, []);

  const lastMapInstanceRef = useRef(null);
  const localDivRef = useRef(null);

  const setDivRef = useCallback(
    (node) => {
      localDivRef.current = node;

      try {
        if (typeof hookMapDivRef === "function") {
          hookMapDivRef(node);
        } else if (hookMapDivRef && typeof hookMapDivRef === "object") {
          hookMapDivRef.current = node;
        }
      } catch {}
    },
    [hookMapDivRef]
  );

  const mapInstance = useMemo(() => {
    try {
      const m = mapRef?.current ? mapRef.current : mapRef;
      if (m && typeof m.setCenter === "function" && typeof m.fitBounds === "function") return m;
      return null;
    } catch {
      return null;
    }
  }, [mapRef]);

  useEffect(() => {
    if (!isReady) return;
    bumpTick();
  }, [isReady, bumpTick]);

  useEffect(() => {
    if (!mapInstance) return;
    if (lastMapInstanceRef.current !== mapInstance) {
      lastMapInstanceRef.current = mapInstance;
      bumpTick();
    }
  }, [mapInstance, bumpTick]);

  // ===== EMİR 8 — Flash UI Map Styling (dark/grayscale, toggle’dan bağımsız) =====
  const flashMapStyles = useMemo(
    () => [
      { elementType: "geometry", stylers: [{ color: "#0F141A" }] },
      { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#9AA3AE" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#0B0F14" }] },

      { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2A333D" }] },
      { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#A9B2BE" }] },
      { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#A0A8B3" }] },

      { featureType: "poi", elementType: "labels.text", stylers: [{ visibility: "off" }] },
      { featureType: "poi", elementType: "geometry", stylers: [{ color: "#10171F" }] },

      { featureType: "road", elementType: "geometry", stylers: [{ color: "#1A232D" }] },
      { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0B0F14" }] },
      { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8A94A1" }] },
      { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#1D2732" }] },
      { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#232E3A" }] },
      { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#0B0F14" }] },

      { featureType: "transit", elementType: "labels.text", stylers: [{ visibility: "off" }] },
      { featureType: "transit", elementType: "geometry", stylers: [{ color: "#0E141B" }] },

      { featureType: "water", elementType: "geometry", stylers: [{ color: "#0A1B26" }] },
      { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6F7B88" }] },
    ],
    []
  );

  const appliedStyleRef = useRef({ map: null, did: false });

  useEffect(() => {
    if (!mapInstance) return;

    try {
      if (appliedStyleRef.current.map !== mapInstance || !appliedStyleRef.current.did) {
        appliedStyleRef.current = { map: mapInstance, did: true };
        mapInstance.setOptions({ styles: flashMapStyles });
      }
    } catch {}
  }, [mapInstance, flashMapStyles]);

  // ===== EMİR 8 — Cyan polyline + start/end markers (Shell içinde) =====
  const points = useMemo(() => {
    const ptsFromPath = normalizePointsFromPath(path);
    if (ptsFromPath.length >= 2) return ptsFromPath;

    const ptsFromStops = normalizePointsFromStops(stops);
    if (ptsFromStops.length >= 2) return ptsFromStops;

    return [];
  }, [path, stops]);

  const boundsPts = useMemo(() => sampleForBounds(points), [points]);

  const polylineRef = useRef(null);
  const glowRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);

  useEffect(() => {
    const map = mapInstance;
    const g = window.google;
    if (!map || !g?.maps) return;

    if (!points || points.length < 2) {
      try {
        if (polylineRef.current) polylineRef.current.setMap(null);
        if (glowRef.current) glowRef.current.setMap(null);
        if (startMarkerRef.current) startMarkerRef.current.setMap(null);
        if (endMarkerRef.current) endMarkerRef.current.setMap(null);
      } catch {}
      polylineRef.current = null;
      glowRef.current = null;
      startMarkerRef.current = null;
      endMarkerRef.current = null;
      return;
    }

    const cyan = "#00E5FF";

    try {
      if (!glowRef.current) {
        glowRef.current = new g.maps.Polyline({
          path: points,
          geodesic: true,
          strokeColor: cyan,
          strokeOpacity: 0.22,
          strokeWeight: 9,
          clickable: false,
          zIndex: 2,
        });
        glowRef.current.setMap(map);
      } else {
        glowRef.current.setPath(points);
        glowRef.current.setMap(map);
      }
    } catch {}

    try {
      if (!polylineRef.current) {
        polylineRef.current = new g.maps.Polyline({
          path: points,
          geodesic: true,
          strokeColor: cyan,
          strokeOpacity: 0.96,
          strokeWeight: 5,
          clickable: false,
          zIndex: 3,
        });
        polylineRef.current.setMap(map);
      } else {
        polylineRef.current.setPath(points);
        polylineRef.current.setMap(map);
      }
    } catch {}

    const start = points[0];
    const end = points[points.length - 1];

    const iconUrl = makePinSvg({ fill: cyan });

    try {
      const icon = {
        url: iconUrl,
        scaledSize: new g.maps.Size(30, 30),
        anchor: new g.maps.Point(15, 27),
      };

      if (!startMarkerRef.current) {
        startMarkerRef.current = new g.maps.Marker({
          position: start,
          map,
          clickable: false,
          zIndex: 4,
          icon,
          title: "Başlangıç",
        });
      } else {
        startMarkerRef.current.setPosition(start);
        startMarkerRef.current.setMap(map);
      }

      if (!endMarkerRef.current) {
        endMarkerRef.current = new g.maps.Marker({
          position: end,
          map,
          clickable: false,
          zIndex: 4,
          icon,
          title: "Bitiş",
        });
      } else {
        endMarkerRef.current.setPosition(end);
        endMarkerRef.current.setMap(map);
      }
    } catch {}
  }, [mapInstance, points]);

  // ===== EMİR 8 — FitBounds / Zoom Stabilitesi (container>0 + RO + RAF) =====
  const fitStateRef = useRef({
    rafs: [],
    t: null,
    t2: null,
    lastSig: "",
    lastAt: 0,
  });

  const safeTriggerResize = useCallback(() => {
    const map = mapInstance;
    const g = window.google;
    if (!map || !g?.maps?.event?.trigger) return;
    try {
      g.maps.event.trigger(map, "resize");
    } catch {}
  }, [mapInstance]);

  const scheduleFit = useCallback(
    (reason = "tick") => {
      const map = mapInstance;
      const el = localDivRef.current;
      const g = window.google;
      if (!map || !el || !g?.maps) return;
      if (!points || points.length < 2) return;

      const rect = el.getBoundingClientRect?.();
      const w = rect?.width || 0;
      const h = rect?.height || 0;
      if (w <= 4 || h <= 4) return;

      const first = points[0];
      const last = points[points.length - 1];

      const sig = `${points.length}:${first?.lat},${first?.lng}:${last?.lat},${last?.lng}:${Math.round(w)}x${Math.round(h)}`;

      const now = Date.now();
      if (fitStateRef.current.lastSig === sig && now - fitStateRef.current.lastAt < 700) return;

      fitStateRef.current.lastSig = sig;
      fitStateRef.current.lastAt = now;

      // clear old timers
      try {
        if (fitStateRef.current.t) clearTimeout(fitStateRef.current.t);
      } catch {}
      try {
        if (fitStateRef.current.t2) clearTimeout(fitStateRef.current.t2);
      } catch {}
      fitStateRef.current.t = null;
      fitStateRef.current.t2 = null;

      fitStateRef.current.t = setTimeout(() => {
        try {
          safeTriggerResize();
        } catch {}

        try {
          const bounds = new g.maps.LatLngBounds();
          for (const p of boundsPts) bounds.extend(p);
          map.fitBounds(bounds, { top: 22, right: 22, bottom: 22, left: 22 });
        } catch {}

        // Büyük path’lerde ikinci fit pahalı olabilir → sadece hafif düzeltme yap
        fitStateRef.current.t2 = setTimeout(() => {
          try {
            safeTriggerResize();
          } catch {}

          // küçük/orta points’te ikinci fit faydalı olabiliyor
          if (points.length <= 900) {
            try {
              const bounds = new g.maps.LatLngBounds();
              for (const p of boundsPts) bounds.extend(p);
              map.fitBounds(bounds, { top: 22, right: 22, bottom: 22, left: 22 });
            } catch {}
          }
        }, 120);
      }, reason === "resize" ? 60 : 40);
    },
    [mapInstance, points, boundsPts, safeTriggerResize]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      try {
        if (fitStateRef.current.t) clearTimeout(fitStateRef.current.t);
      } catch {}
      try {
        if (fitStateRef.current.t2) clearTimeout(fitStateRef.current.t2);
      } catch {}
      fitStateRef.current.t = null;
      fitStateRef.current.t2 = null;
    };
  }, []);

  useEffect(() => {
    const el = localDivRef.current;
    if (!el) return;

    if (typeof ResizeObserver !== "undefined") {
      try {
        const ro = new ResizeObserver(() => {
          bumpTick();
          scheduleFit("resize");
        });
        ro.observe(el);
        return () => {
          try {
            ro.disconnect();
          } catch {}
        };
      } catch {}
    }

    const onResize = () => {
      bumpTick();
      scheduleFit("resize");
    };
    try {
      window.addEventListener("resize", onResize);
    } catch {}
    return () => {
      try {
        window.removeEventListener("resize", onResize);
      } catch {}
    };
  }, [bumpTick, scheduleFit]);

  useEffect(() => {
    if (!isReady || !mapInstance) return;

    try {
      for (const id of fitStateRef.current.rafs) cancelAnimationFrame(id);
    } catch {}
    fitStateRef.current.rafs = [];

    const raf1 = requestAnimationFrame(() => {
      scheduleFit("raf1");
      const raf2 = requestAnimationFrame(() => {
        scheduleFit("raf2");
        const raf3 = requestAnimationFrame(() => scheduleFit("raf3"));
        fitStateRef.current.rafs.push(raf3);
      });
      fitStateRef.current.rafs.push(raf2);
    });
    fitStateRef.current.rafs.push(raf1);

    return () => {
      try {
        for (const id of fitStateRef.current.rafs) cancelAnimationFrame(id);
      } catch {}
      fitStateRef.current.rafs = [];
    };
  }, [isReady, mapInstance, scheduleFit]);

  useEffect(() => {
    if (!mapInstance) return;
    scheduleFit("tick");
  }, [mapReadyTick, mapInstance, scheduleFit]);

  // ===== Label =====
  const locationLabel = useMemo(() => {
    const v = stopsLoaded ? pickLocationLabelFromStops(stops) : "";
    const txt = (v || "MUĞLA").toString().trim();
    if (txt.length > 18) return txt.slice(0, 18);
    return txt;
  }, [stopsLoaded, stops]);

  const overlayBase = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 14,
    background: "var(--rdmps-overlay-bg, rgba(255,255,255,0.86))",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    zIndex: 5,
  };

  const card = {
    width: "100%",
    maxWidth: 360,
    borderRadius: 14,
    border: "1px solid var(--rdmps-card-border, rgba(0,0,0,0.08))",
    background: "var(--rdmps-card-bg, #fff)",
    boxShadow: "var(--rdmps-card-shadow, 0 10px 26px rgba(0,0,0,0.10))",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const title = {
    fontWeight: 900,
    fontSize: 14,
    color: "var(--rdmps-title, #111)",
  };

  const desc = {
    fontSize: 12,
    color: "var(--rdmps-sub, rgba(0,0,0,0.72))",
    lineHeight: 1.35,
  };

  const btnRow = { display: "flex", gap: 10, flexWrap: "wrap" };

  const retryBtn = {
    height: "var(--rdmps-btn-h, 38px)",
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid var(--rdmps-btn-primary-border, #111)",
    background: "var(--rdmps-btn-primary-bg, #111)",
    color: "var(--rdmps-btn-primary-fg, #fff)",
    boxShadow: "var(--rdmps-btn-primary-shadow, none)",
    fontWeight: 900,
    cursor: "pointer",
    flex: "1 1 140px",
    WebkitTapHighlightColor: "transparent",
  };

  const ghostBtn = {
    height: "var(--rdmps-btn-h, 38px)",
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid var(--rdmps-btn-ghost-border, rgba(0,0,0,0.12))",
    background: "var(--rdmps-btn-ghost-bg, #fff)",
    color: "var(--rdmps-btn-ghost-fg, #111)",
    boxShadow: "var(--rdmps-btn-ghost-shadow, none)",
    fontWeight: 900,
    cursor: "pointer",
    flex: "1 1 140px",
    WebkitTapHighlightColor: "transparent",
  };

  const spinner = {
    width: 18,
    height: 18,
    borderRadius: 999,
    border: "2px solid var(--rdmps-spin-track, rgba(0,0,0,0.12))",
    borderTopColor: "var(--rdmps-spin-head, rgba(0,0,0,0.65))",
    animation: "rdmpspin 0.9s linear infinite",
    flex: "0 0 auto",
  };

  const messageForError = () => {
    if (!API_KEY) return "Google Maps API anahtarı bulunamadı.";
    const errText = String(gmaps?.error?.message || gmaps?.error || "").toLowerCase();
    if (errText.includes("billing")) return "Harita yüklenemedi (billing / proje ayarı).";
    if (errText.includes("apikey") || errText.includes("api key")) return "Harita yüklenemedi (API anahtarı).";
    if (errText.includes("quota")) return "Harita yüklenemedi (quota limiti).";
    if (errText.includes("div")) return "Harita alanı oluşturulamadı.";
    return "Harita yüklenemedi.";
  };

  const cssFilterFallback = useMemo(() => {
    if (!MAP_ID) return "none";
    return "grayscale(0.95) brightness(0.78) contrast(1.12) saturate(0.72)";
  }, [MAP_ID]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={setDivRef}
        className="rdmps-map"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 14,
          overflow: "hidden",
          background: "#0B0F14",
          filter: cssFilterFallback,
          transform: "translateZ(0)",
        }}
      />

      <RouteDetailMapPreview
        routeId={routeId}
        gmapsStatus={gmapsStatus}
        mapDivRef={localDivRef}
        mapRef={mapRef}
        mapInstance={mapInstance}
        mapReadyTick={mapReadyTick}
        path={path}
        stops={stops}
        stopsLoaded={stopsLoaded}
      />

      <div className="rd-map-card__label" aria-hidden="true">
        {locationLabel}
      </div>

      {isLoading && (
        <div className="rdmps-overlay" style={overlayBase} aria-live="polite" aria-busy="true">
          <style>{`
            @keyframes rdmpspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>

          <div className="rdmps-card" style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={spinner} />
              <div>
                <div className="rdmps-title" style={title}>
                  Harita yükleniyor…
                </div>
                <div className="rdmps-sub" style={desc}>
                  Bağlantı yavaşsa biraz sürebilir.
                </div>
              </div>
            </div>

            <div style={btnRow}>
              <button
                type="button"
                className="rdmps-btn rdmps-btn--ghost"
                style={ghostBtn}
                onClick={() => {
                  try {
                    onRetry();
                  } catch {}
                }}
              >
                Yenile
              </button>
            </div>
          </div>
        </div>
      )}

      {isError && (
        <div className="rdmps-overlay" style={overlayBase} role="alert">
          <div className="rdmps-card" style={card}>
            <div>
              <div className="rdmps-title" style={title}>
                Harita açılamadı
              </div>
              <div className="rdmps-sub" style={desc}>
                {messageForError()}
              </div>
            </div>

            <div style={btnRow}>
              <button
                type="button"
                className="rdmps-btn rdmps-btn--primary"
                style={retryBtn}
                onClick={() => {
                  try {
                    onRetry();
                  } catch {}
                }}
              >
                Tekrar dene
              </button>

              <button
                type="button"
                className="rdmps-btn rdmps-btn--ghost"
                style={ghostBtn}
                onClick={() => {
                  try {
                    onRetry();
                  } catch {}
                }}
                title="Remount tetikler"
              >
                Yenile
              </button>
            </div>

            {process.env.NODE_ENV !== "production" && gmaps?.error && (
              <div style={{ fontSize: 11, opacity: 0.7, wordBreak: "break-word" }}>
                {String(gmaps?.error?.message || gmaps?.error)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
