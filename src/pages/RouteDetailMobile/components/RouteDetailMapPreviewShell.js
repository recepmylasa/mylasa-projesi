// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreviewShell.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGoogleMaps } from "../../../hooks/useGoogleMaps";

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

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}
function key6(p) {
  return `${round6(p.lat)},${round6(p.lng)}`;
}
function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}

/* =========================================================
   ✅ ENCODED POLYLINE (string) DECODE — eski rotalar için
   ========================================================= */
function looksLikeEncodedPolyline(str) {
  const s = String(str || "").trim();
  if (s.length < 16) return false;
  if (/[,\s]/.test(s)) return false;
  if (!/^[\x20-\x7E]+$/.test(s)) return false;
  return true;
}

function decodeEncodedPolyline(str, precision = 5) {
  const s = String(str || "");
  let index = 0;
  let lat = 0;
  let lng = 0;

  const coordinates = [];
  const factor = Math.pow(10, precision);

  while (index < s.length) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = s.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < s.length);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = s.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < s.length);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    const p = { lat: lat / factor, lng: lng / factor };
    if (inRangeLatLng(p.lat, p.lng)) coordinates.push(p);
  }

  return coordinates;
}

function tryDecodePolylineMaybe(input) {
  const s = typeof input === "string" ? input.trim() : "";
  if (!looksLikeEncodedPolyline(s)) return null;

  try {
    const pts5 = decodeEncodedPolyline(s, 5);
    if (Array.isArray(pts5) && pts5.length >= 2) return pts5;

    const pts6 = decodeEncodedPolyline(s, 6);
    if (Array.isArray(pts6) && pts6.length >= 2) return pts6;

    return Array.isArray(pts5) && pts5.length ? pts5 : null;
  } catch {
    return null;
  }
}

function parseArrayLatLng(arr, hint = "auto") {
  try {
    if (!Array.isArray(arr) || arr.length < 2) return null;

    const a = toFiniteNumber(arr[0]);
    const b = toFiniteNumber(arr[1]);
    if (a == null || b == null) return null;

    if (hint === "lnglat") {
      const lat = b;
      const lng = a;
      if (inRangeLatLng(lat, lng)) return { lat, lng };
    }
    if (hint === "latlng") {
      const lat = a;
      const lng = b;
      if (inRangeLatLng(lat, lng)) return { lat, lng };
    }

    const aLatOk = Math.abs(a) <= 90;
    const bLatOk = Math.abs(b) <= 90;
    const aLngOk = Math.abs(a) <= 180;
    const bLngOk = Math.abs(b) <= 180;

    if (!aLatOk && aLngOk && bLatOk) {
      const lat = b;
      const lng = a;
      return inRangeLatLng(lat, lng) ? { lat, lng } : null;
    }

    if (!bLatOk && bLngOk && aLatOk) {
      const lat = a;
      const lng = b;
      return inRangeLatLng(lat, lng) ? { lat, lng } : null;
    }

    const candLatLng = inRangeLatLng(a, b) ? { lat: a, lng: b } : null;
    const candLngLat = inRangeLatLng(b, a) ? { lat: b, lng: a } : null;

    if (candLatLng && !candLngLat) return candLatLng;
    if (!candLatLng && candLngLat) return candLngLat;
    if (!candLatLng && !candLngLat) return null;

    return candLatLng;
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

    const a = toFiniteNumber(parts[0]);
    const b = toFiniteNumber(parts[1]);
    if (a == null || b == null) return null;

    return parseArrayLatLng([a, b], "auto");
  } catch {
    return null;
  }
}

function extractLatLng(any, depth = 0, seen, hint = "auto") {
  if (!any) return null;
  if (depth > 6) return null;

  const _seen = seen || new Set();

  try {
    if (typeof any === "object") {
      if (_seen.has(any)) return null;
      _seen.add(any);
    }
  } catch {}

  try {
    if (typeof any === "string") {
      const out = parseCoordString(any);
      if (out) return out;
    }
  } catch {}

  try {
    if (Array.isArray(any) && any.length >= 2) {
      const out = parseArrayLatLng(any, hint);
      if (out) return out;
    }
  } catch {}

  try {
    if (typeof any.lat === "function" && typeof any.lng === "function") {
      const lat = toFiniteNumber(any.lat());
      const lng = toFiniteNumber(any.lng());
      if (lat != null && lng != null && inRangeLatLng(lat, lng)) return { lat, lng };
    }
  } catch {}

  try {
    if (typeof any.latitude === "number" && typeof any.longitude === "number") {
      const lat = toFiniteNumber(any.latitude);
      const lng = toFiniteNumber(any.longitude);
      if (lat != null && lng != null && inRangeLatLng(lat, lng)) return { lat, lng };
    }
    if (typeof any._lat === "number" && typeof any._long === "number") {
      const lat = toFiniteNumber(any._lat);
      const lng = toFiniteNumber(any._long);
      if (lat != null && lng != null && inRangeLatLng(lat, lng)) return { lat, lng };
    }
  } catch {}

  try {
    const lat = toFiniteNumber(
      any.lat ??
        any.latitude ??
        any._lat ??
        any._latitude ??
        any?.coords?.lat ??
        any?.coords?.latitude ??
        any?.y
    );
    const lng = toFiniteNumber(
      any.lng ??
        any.lon ??
        any.long ??
        any.longitude ??
        any._long ??
        any._longitude ??
        any?.coords?.lng ??
        any?.coords?.longitude ??
        any?.x
    );
    if (lat != null && lng != null && inRangeLatLng(lat, lng)) return { lat, lng };
  } catch {}

  try {
    if (any?.type && typeof any.type === "string" && Array.isArray(any.coordinates)) {
      if (Array.isArray(any.coordinates) && any.coordinates.length >= 2 && !Array.isArray(any.coordinates[0])) {
        const out = parseArrayLatLng(any.coordinates, "lnglat");
        if (out) return out;
      }
      return null;
    }
  } catch {}

  const candidates = [
    { v: any?.latLng, h: hint },
    { v: any?.latlng, h: hint },
    { v: any?.location, h: hint },
    { v: any?.loc, h: hint },
    { v: any?.geo, h: hint },
    { v: any?.geoPoint, h: hint },
    { v: any?.geopoint, h: hint },
    { v: any?.point, h: hint },
    { v: any?.position, h: hint },
    { v: any?.pos, h: hint },
    { v: any?.center, h: hint },
    { v: any?.coord, h: hint },
    { v: any?.coords, h: hint },
    { v: any?.coordinates, h: "lnglat" },
    { v: any?.geometry?.location, h: hint },
    { v: any?.geometry, h: hint },
    { v: any?.place?.location, h: hint },
    { v: any?.place?.geometry?.location, h: hint },
    { v: any?.place?.geometry, h: hint },
    { v: any?.stop?.location, h: hint },
    { v: any?.stop?.coords, h: hint },
    { v: any?.stop?.geo, h: hint },
    { v: any?.stop?.point, h: hint },
    { v: any?.place?.coord, h: hint },
    { v: any?.place?.coords, h: hint },
  ];

  for (const c of candidates) {
    const p = extractLatLng(c.v, depth + 1, _seen, c.h);
    if (p) return p;
  }

  return null;
}

function coercePointsArray(input) {
  if (typeof input === "string") {
    const decoded = tryDecodePolylineMaybe(input);
    if (decoded && decoded.length) return { arr: decoded, hint: "auto" };
    return { arr: [input], hint: "auto" };
  }

  if (Array.isArray(input)) return { arr: input, hint: "auto" };

  if (input && typeof input === "object") {
    const polyStr =
      (typeof input?.encodedPath === "string" && input.encodedPath) ||
      (typeof input?.encodedPolyline === "string" && input.encodedPolyline) ||
      (typeof input?.polyline === "string" && input.polyline) ||
      (typeof input?.encoded === "string" && input.encoded) ||
      (typeof input?.overview_polyline?.points === "string" && input.overview_polyline.points) ||
      null;

    if (polyStr) {
      const decoded = tryDecodePolylineMaybe(polyStr);
      if (decoded && decoded.length) return { arr: decoded, hint: "auto" };
    }

    if (input?.type === "LineString" && Array.isArray(input.coordinates)) {
      return { arr: input.coordinates, hint: "lnglat" };
    }

    const cands = [
      { v: input?.path, h: "auto" },
      { v: input?.points, h: "auto" },
      { v: input?.polyline, h: "auto" },
      { v: input?.coordinates, h: "lnglat" },
      { v: input?.geometry?.path, h: "auto" },
      { v: input?.geometry?.points, h: "auto" },
      { v: input?.geometry?.coordinates, h: "lnglat" },
      { v: input?.geometry, h: "auto" },
    ];

    for (const c of cands) {
      if (typeof c.v === "string") {
        const decoded = tryDecodePolylineMaybe(c.v);
        if (decoded && decoded.length) return { arr: decoded, hint: "auto" };
      }

      if (Array.isArray(c.v)) return { arr: c.v, hint: c.h };
      if (c.v && typeof c.v === "object" && c.v?.type === "LineString" && Array.isArray(c.v.coordinates)) {
        return { arr: c.v.coordinates, hint: "lnglat" };
      }
    }
  }

  return input ? { arr: [input], hint: "auto" } : { arr: [], hint: "auto" };
}

function dedupBy6(points) {
  const out = [];
  const seen = new Set();
  for (const p of points) {
    const k = key6(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ lat: round6(p.lat), lng: round6(p.lng) });
  }
  return out;
}

function normalizePointsFromPath(path) {
  const { arr, hint } = coercePointsArray(path);
  const out = [];
  for (const p of arr) {
    const ll = extractLatLng(p, 0, undefined, hint);
    if (ll) out.push(ll);
  }
  return dedupBy6(out);
}

function normalizePointsFromStops(stops) {
  const arr = Array.isArray(stops) ? stops : [];
  const out = [];
  for (const s of arr) {
    const ll = extractLatLng(s, 0, undefined, "auto");
    if (ll) out.push(ll);
  }
  return dedupBy6(out);
}

function downsamplePoints(points, max = 450) {
  const arr = Array.isArray(points) ? points : [];
  if (arr.length <= max) return arr;

  const step = Math.ceil(arr.length / max);
  const out = [];

  for (let i = 0; i < arr.length; i += step) out.push(arr[i]);

  const last = arr[arr.length - 1];
  if (out.length === 0 || key6(out[out.length - 1]) !== key6(last)) out.push(last);

  return dedupBy6(out);
}

function makePinSvg({ fill = "#00E5FF", stroke = "rgba(0,0,0,0.65)" } = {}) {
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

function getMapInstanceFromRef(mapRefLike) {
  try {
    const m = mapRefLike?.current ? mapRefLike.current : mapRefLike;
    if (m && typeof m.setCenter === "function" && typeof m.fitBounds === "function") return m;
  } catch {}
  return null;
}

export default function RouteDetailMapPreviewShell({
  routeId,
  path = [],
  stops = [],
  stopsLoaded = false,
  badgeCount = 0,
  areaLabel = "",
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

  const hasMapId = !!MAP_ID;

  const mapsOpts = useMemo(() => ({ API_KEY, MAP_ID }), [API_KEY, MAP_ID]);
  const gmaps = useGoogleMaps(mapsOpts) || {};

  const gmapsStatus =
    gmaps.gmapsStatus ||
    gmaps.status ||
    (gmaps.isLoaded ? "ready" : gmaps.error ? "error" : "loading");

  const hookMapDivRef = gmaps.mapDivRef || gmaps.containerRef || gmaps.divRef || null;
  const mapRefLike = gmaps.mapRef || gmaps.map || null;

  const gmapsReload = gmaps.reload;
  const gmapsAttemptLoad = gmaps.attemptLoad;

  const baseIsError =
    gmapsStatus === "error" ||
    gmapsStatus === "failed" ||
    gmapsStatus === "blocked" ||
    gmapsStatus === "missing_key";

  const isError = baseIsError || !API_KEY;

  // ✅ KRİTİK FIX: mapRef.current değişimi re-render tetiklemez → state ile yakala
  const [mapInstance, setMapInstance] = useState(null);

  // ✅ Hook bazı ortamlarda farklı status döndürebilir → toleranslı hazır kontrol
  const statusIsReady =
    gmapsStatus === "ready" ||
    gmapsStatus === "loaded" ||
    gmapsStatus === "ok" ||
    gmapsStatus === "success" ||
    gmapsStatus === "done";

  // ✅ Harita instance varsa "ready" kabul et (DevTools %50 -> resize tetikleyip düzeltme bug’ını kapatır)
  const isReady = !isError && (statusIsReady || !!mapInstance);
  const isLoading = !isReady && !isError;

  const handleRetry = useCallback(() => {
    try {
      if (typeof gmapsReload === "function") gmapsReload();
    } catch {}
    try {
      if (typeof gmapsAttemptLoad === "function") gmapsAttemptLoad(true);
    } catch {}
    try {
      onRetry();
    } catch {}
  }, [gmapsReload, gmapsAttemptLoad, onRetry]);

  const [mapReadyTick, setMapReadyTick] = useState(0);
  const bumpTick = useCallback(() => {
    setMapReadyTick((t) => (t + 1) % 1000000);
  }, []);

  const shellRef = useRef(null);

  // ✅ Map instance probe — status'a bağımlı değil (bazı cihazlarda status gecikebiliyor)
  useEffect(() => {
    if (isError) {
      setMapInstance(null);
      return;
    }

    let raf = 0;
    let tries = 0;
    let stopped = false;

    const probe = () => {
      if (stopped) return;

      const m = getMapInstanceFromRef(mapRefLike);
      if (m) {
        setMapInstance((prev) => (prev === m ? prev : m));
        return;
      }

      tries += 1;
      if (tries < 120) raf = requestAnimationFrame(probe);
    };

    raf = requestAnimationFrame(probe);
    return () => {
      stopped = true;
      try {
        cancelAnimationFrame(raf);
      } catch {}
    };
  }, [mapRefLike, isError, routeId]);

  useEffect(() => {
    if (!isReady) return;
    bumpTick();
  }, [isReady, bumpTick]);

  useEffect(() => {
    if (!mapInstance) return;
    bumpTick();
  }, [mapInstance, bumpTick]);

  // ✅ EMİR 02: Map gesture guard — sheet/scroll motoruna kaçışı kes
  const gestureGuardRef = useRef({ active: false, pointerId: null });

  // ✅ EMİR 01: Shell kendi clamp'ını ASLA dayatmaz. %100 fill.
  const shellH = "var(--rdmps-h, 100%)";

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

  // ✅ EMİR 02: Map üstünde pointer/touch sheet’e kaçmasın
  useEffect(() => {
    const host = shellRef.current;
    if (!host) return;

    const state = gestureGuardRef.current;

    const onTouchStart = () => {
      state.active = true;
    };
    const onTouchEnd = () => {
      state.active = false;
      state.pointerId = null;
    };
    const onTouchMove = (e) => {
      if (!state.active) return;
      try {
        e.preventDefault();
      } catch {}
      try {
        e.stopPropagation();
      } catch {}
    };

    const onPointerDown = (e) => {
      state.active = true;
      state.pointerId = e.pointerId ?? null;
      try {
        host.setPointerCapture?.(e.pointerId);
      } catch {}
      try {
        e.stopPropagation();
      } catch {}
    };
    const onPointerMove = (e) => {
      if (!state.active) return;
      if (state.pointerId != null && e.pointerId != null && state.pointerId !== e.pointerId) return;
      try {
        e.stopPropagation();
      } catch {}
    };
    const onPointerUp = (e) => {
      if (state.pointerId != null && e.pointerId != null && state.pointerId !== e.pointerId) return;
      state.active = false;
      state.pointerId = null;
      try {
        e.stopPropagation();
      } catch {}
    };

    const onWheel = (e) => {
      try {
        e.stopPropagation();
      } catch {}
    };

    try {
      host.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
      host.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
      host.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
      host.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });

      host.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
      host.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
      host.addEventListener("pointerup", onPointerUp, { capture: true, passive: false });
      host.addEventListener("pointercancel", onPointerUp, { capture: true, passive: false });

      host.addEventListener("wheel", onWheel, { capture: true, passive: true });
    } catch {}

    return () => {
      try {
        host.removeEventListener("touchstart", onTouchStart, true);
        host.removeEventListener("touchmove", onTouchMove, true);
        host.removeEventListener("touchend", onTouchEnd, true);
        host.removeEventListener("touchcancel", onTouchEnd, true);

        host.removeEventListener("pointerdown", onPointerDown, true);
        host.removeEventListener("pointermove", onPointerMove, true);
        host.removeEventListener("pointerup", onPointerUp, true);
        host.removeEventListener("pointercancel", onPointerUp, true);

        host.removeEventListener("wheel", onWheel, true);
      } catch {}
    };
  }, []);

  // ✅ EMİR 02: Map options — map gesture map’te kalsın
  useEffect(() => {
    if (!mapInstance) return;
    try {
      mapInstance.setOptions({
        gestureHandling: "greedy",
        draggable: true,
        scrollwheel: false,
        disableDoubleClickZoom: true,
        keyboardShortcuts: false,
        clickableIcons: false,
        draggableCursor: "grab",
        draggingCursor: "grabbing",
      });
    } catch {}
  }, [mapInstance]);

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
    if (hasMapId) return;

    try {
      if (appliedStyleRef.current.map !== mapInstance || !appliedStyleRef.current.did) {
        appliedStyleRef.current = { map: mapInstance, did: true };
        mapInstance.setOptions({ styles: flashMapStyles });
      }
    } catch {}
  }, [mapInstance, flashMapStyles, hasMapId]);

  const points = useMemo(() => {
    const ptsFromPath = normalizePointsFromPath(path);
    const ptsFromStops = normalizePointsFromStops(stops);

    if (ptsFromPath.length >= 2) return ptsFromPath;
    if (ptsFromStops.length >= 2) return ptsFromStops;

    if (ptsFromPath.length === 1) return ptsFromStops.length ? ptsFromStops : ptsFromPath;
    if (ptsFromStops.length === 1) return ptsFromStops;

    return [];
  }, [path, stops]);

  const drawPoints = useMemo(() => downsamplePoints(points, 450), [points]);
  const rawPointCount = (points && points.length) || 0;

  const polylineRef = useRef(null);
  const glowRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);

  useEffect(() => {
    const map = mapInstance;
    const g = window.google;
    if (!map || !g?.maps) return;

    const cleanup = () => {
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
    };

    if (!drawPoints || drawPoints.length < 1) {
      cleanup();
      return;
    }

    const cyan = "#00E5FF";
    const iconUrl = makePinSvg({ fill: cyan });

    const icon = {
      url: iconUrl,
      scaledSize: new g.maps.Size(30, 30),
      anchor: new g.maps.Point(15, 27),
    };

    if (drawPoints.length === 1) {
      try {
        if (polylineRef.current) polylineRef.current.setMap(null);
        if (glowRef.current) glowRef.current.setMap(null);
      } catch {}
      polylineRef.current = null;
      glowRef.current = null;

      const p0 = drawPoints[0];

      try {
        if (!startMarkerRef.current) {
          startMarkerRef.current = new g.maps.Marker({
            position: p0,
            map,
            clickable: false,
            zIndex: 4,
            icon,
            title: "Konum",
          });
        } else {
          startMarkerRef.current.setPosition(p0);
          startMarkerRef.current.setMap(map);
        }
      } catch {}

      try {
        if (endMarkerRef.current) endMarkerRef.current.setMap(null);
      } catch {}
      endMarkerRef.current = null;

      return () => cleanup();
    }

    try {
      if (!glowRef.current) {
        glowRef.current = new g.maps.Polyline({
          path: drawPoints,
          geodesic: true,
          strokeColor: cyan,
          strokeOpacity: 0.22,
          strokeWeight: 9,
          clickable: false,
          zIndex: 2,
        });
        glowRef.current.setMap(map);
      } else {
        glowRef.current.setPath(drawPoints);
        glowRef.current.setMap(map);
      }
    } catch {}

    try {
      if (!polylineRef.current) {
        polylineRef.current = new g.maps.Polyline({
          path: drawPoints,
          geodesic: true,
          strokeColor: cyan,
          strokeOpacity: 0.96,
          strokeWeight: 5,
          clickable: false,
          zIndex: 3,
        });
        polylineRef.current.setMap(map);
      } else {
        polylineRef.current.setPath(drawPoints);
        polylineRef.current.setMap(map);
      }
    } catch {}

    const start = drawPoints[0];
    const end = drawPoints[drawPoints.length - 1];

    try {
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

    return () => cleanup();
  }, [mapInstance, drawPoints, routeId]);

  const fitStateRef = useRef({
    pendingTimer: null,
    pendingRaf: null,
    lastSig: "",
    lastAt: 0,
    lastAnyAt: 0,
    _r1: 0,
    _r2: 0,
    _r3: 0,
    _t1: 0,
    _t2: 0,
    _t3: 0,
    _t4: 0,
    _vvT: 0,
  });

  const computeSig = useCallback((pts, rect) => {
    const w = rect?.width || 0;
    const h = rect?.height || 0;
    const wB = Math.round(w / 40) * 40;
    const hB = Math.round(h / 40) * 40;

    if (!pts || pts.length < 1) return `0:${wB}x${hB}`;

    const first = pts[0];
    const last = pts[pts.length - 1];

    const f = `${round6(first.lat)},${round6(first.lng)}`;
    const l = `${round6(last.lat)},${round6(last.lng)}`;

    let minLat = first.lat,
      maxLat = first.lat,
      minLng = first.lng,
      maxLng = first.lng;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p) continue;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }

    const bbox = `${round4(minLat)},${round4(minLng)},${round4(maxLat)},${round4(maxLng)}`;
    return `${pts.length}:${f}:${l}:${bbox}:${wB}x${hB}`;
  }, []);

  const triggerResizeAndNudge = useCallback(() => {
    const map = mapInstance;
    const g = window.google;
    if (!map || !g?.maps) return;

    try {
      if (g.maps.event?.trigger) g.maps.event.trigger(map, "resize");
    } catch {}

    try {
      const c = map.getCenter?.();
      if (c && typeof map.setCenter === "function") map.setCenter(c);
    } catch {}
    try {
      const z = map.getZoom?.();
      if (Number.isFinite(z) && typeof map.setZoom === "function") map.setZoom(z);
    } catch {}
  }, [mapInstance]);

  const doFitNow = useCallback(
    (reason = "fit") => {
      const map = mapInstance;
      const el = shellRef.current || localDivRef.current;
      const g = window.google;

      if (!isReady) return;
      if (!map || !el || !g?.maps) return;

      const rect = el.getBoundingClientRect?.();
      const w = rect?.width || 0;
      const h = rect?.height || 0;
      if (w <= 4 || h <= 4) return;

      const sig = computeSig(drawPoints, rect);
      const now = Date.now();
      if (fitStateRef.current.lastSig === sig && now - fitStateRef.current.lastAt < 800) return;
      if (now - fitStateRef.current.lastAnyAt < 180) return;

      fitStateRef.current.lastSig = sig;
      fitStateRef.current.lastAt = now;
      fitStateRef.current.lastAnyAt = now;

      try {
        triggerResizeAndNudge();
      } catch {}

      if (!drawPoints || drawPoints.length < 1) return;

      const pts = drawPoints;

      requestAnimationFrame(() => {
        try {
          if (!isReady) return;
          if (!mapInstance) return;

          if (pts.length === 1) {
            const p0 = pts[0];
            mapInstance.setCenter(p0);
            const z = mapInstance.getZoom?.();
            if (!Number.isFinite(z) || z < 14 || z > 18) mapInstance.setZoom(16);
            return;
          }

          const bounds = new g.maps.LatLngBounds();
          for (const p of pts) bounds.extend(p);

          try {
            mapInstance.fitBounds(bounds, { top: 22, right: 22, bottom: 22, left: 22 });
          } catch {
            try {
              mapInstance.fitBounds(bounds);
            } catch {}
          }
        } catch {}
      });
    },
    [mapInstance, isReady, drawPoints, computeSig, triggerResizeAndNudge]
  );

  const scheduleFit = useCallback(
    (reason = "tick") => {
      const el = shellRef.current || localDivRef.current;
      if (!isReady || !mapInstance || !el) return;

      try {
        if (fitStateRef.current.pendingTimer) clearTimeout(fitStateRef.current.pendingTimer);
      } catch {}
      fitStateRef.current.pendingTimer = null;

      try {
        if (fitStateRef.current.pendingRaf) cancelAnimationFrame(fitStateRef.current.pendingRaf);
      } catch {}
      fitStateRef.current.pendingRaf = null;

      const run = () => {
        const raf = requestAnimationFrame(() => doFitNow(reason));
        fitStateRef.current.pendingRaf = raf;
      };

      if (reason === "resize" || reason === "transition") {
        fitStateRef.current.pendingTimer = setTimeout(run, 90);
        return;
      }

      run();
    },
    [isReady, mapInstance, doFitNow]
  );

  // ✅ EMİR 03: Transform/drag monitor — ResizeObserver transform'u görmez.
  useEffect(() => {
    if (!isReady || !mapInstance) return;

    const el = shellRef.current || localDivRef.current;
    if (!el) return;

    let raf = 0;
    let lastSampleT = 0;

    let lastW = -1;
    let lastH = -1;
    let lastTop = 0;
    let lastLeft = 0;

    let lastKickAt = 0;

    const tick = (t) => {
      raf = requestAnimationFrame(tick);
      if (!isReady) return;

      if (t - lastSampleT < 120) return;
      lastSampleT = t;

      let r;
      try {
        r = el.getBoundingClientRect();
      } catch {
        return;
      }

      const w = Math.round(r.width);
      const h = Math.round(r.height);
      const top = Math.round(r.top);
      const left = Math.round(r.left);

      const sizeChanged = Math.abs(w - lastW) > 2 || Math.abs(h - lastH) > 2;
      const moved = Math.abs(top - lastTop) > 6 || Math.abs(left - lastLeft) > 6;

      if (!sizeChanged && !moved) return;

      lastW = w;
      lastH = h;
      lastTop = top;
      lastLeft = left;

      const now = Date.now();
      if (now - lastKickAt < 140) return;
      lastKickAt = now;

      try {
        triggerResizeAndNudge();
      } catch {}
      scheduleFit("rect");
    };

    raf = requestAnimationFrame(tick);
    return () => {
      try {
        cancelAnimationFrame(raf);
      } catch {}
    };
  }, [isReady, mapInstance, scheduleFit, triggerResizeAndNudge]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    const targets = new Set();
    try {
      targets.add(el);
      if (el.parentElement) targets.add(el.parentElement);
      const card = el.closest?.(".rd-map-card");
      if (card) targets.add(card);
    } catch {}

    if (typeof ResizeObserver !== "undefined") {
      try {
        const ro = new ResizeObserver(() => scheduleFit("resize"));
        targets.forEach((t) => {
          try {
            ro.observe(t);
          } catch {}
        });
        return () => {
          try {
            ro.disconnect();
          } catch {}
        };
      } catch {}
    }

    const onResize = () => scheduleFit("resize");
    try {
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
    } catch {}
    return () => {
      try {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
      } catch {}
    };
  }, [scheduleFit]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const h = () => {
      try {
        if (fitStateRef.current._vvT) clearTimeout(fitStateRef.current._vvT);
      } catch {}
      fitStateRef.current._vvT = setTimeout(() => scheduleFit("resize"), 30);
    };

    try {
      vv.addEventListener("resize", h);
      vv.addEventListener("scroll", h);
    } catch {}

    return () => {
      try {
        vv.removeEventListener("resize", h);
        vv.removeEventListener("scroll", h);
      } catch {}
    };
  }, [scheduleFit]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    const host =
      el.closest?.(".route-detail-sheet") ||
      el.closest?.(".route-detail-body") ||
      el.closest?.("[data-route-detail]") ||
      el.closest?.(".rd-sheet") ||
      el.closest?.(".rd-root") ||
      el.closest?.("[data-rd-sheet]") ||
      null;

    if (!host) return;

    const onEnd = () => {
      scheduleFit("transition");
      setTimeout(() => scheduleFit("transition"), 140);
    };

    try {
      host.addEventListener("transitionend", onEnd, true);
      host.addEventListener("animationend", onEnd, true);
    } catch {}

    return () => {
      try {
        host.removeEventListener("transitionend", onEnd, true);
        host.removeEventListener("animationend", onEnd, true);
      } catch {}
    };
  }, [scheduleFit]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") scheduleFit("resize");
    };
    try {
      document.addEventListener("visibilitychange", onVis);
    } catch {}
    return () => {
      try {
        document.removeEventListener("visibilitychange", onVis);
      } catch {}
    };
  }, [scheduleFit]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;

    try {
      const io = new IntersectionObserver(
        (entries) => {
          const e = entries && entries[0];
          if (!e) return;
          if (e.isIntersecting && e.intersectionRatio > 0.15) scheduleFit("intersect");
        },
        { threshold: [0, 0.15, 0.3, 0.6, 1] }
      );
      io.observe(el);
      return () => {
        try {
          io.disconnect();
        } catch {}
      };
    } catch {}
  }, [scheduleFit]);

  // ✅ KRİTİK: DevTools %50'nin yaptığı "resize/reflow" etkisini otomatik uygula
  useEffect(() => {
    if (!isReady || !mapInstance) return;

    const map = mapInstance;
    const g = window.google;

    const dispatchResize = () => {
      try {
        window.dispatchEvent(new Event("resize"));
      } catch {}
    };

    const kick = (why) => {
      // why parametresi debug için tutuluyor (log yok)
      dispatchResize();
      try {
        triggerResizeAndNudge();
      } catch {}
      scheduleFit("resize");
    };

    // anında bir kick
    kick("now");

    // layout settle: birkaç dalga
    try {
      fitStateRef.current._t1 = setTimeout(() => kick("250ms"), 250);
      fitStateRef.current._t2 = setTimeout(() => kick("800ms"), 800);
      fitStateRef.current._t3 = setTimeout(() => kick("1600ms"), 1600);
      fitStateRef.current._t4 = setTimeout(() => kick("3000ms"), 3000);
    } catch {}

    // raf dalgası (ilk paint sonrası)
    try {
      fitStateRef.current._r1 = requestAnimationFrame(() => kick("raf1"));
      fitStateRef.current._r2 = requestAnimationFrame(() => kick("raf2"));
      fitStateRef.current._r3 = requestAnimationFrame(() => kick("raf3"));
    } catch {}

    // google idle/tilesloaded (harita gerçekten çizince)
    let l1 = null;
    let l2 = null;
    try {
      if (g?.maps?.event?.addListenerOnce) {
        l1 = g.maps.event.addListenerOnce(map, "idle", () => kick("idle"));
        l2 = g.maps.event.addListenerOnce(map, "tilesloaded", () => kick("tilesloaded"));
      }
    } catch {}

    return () => {
      try {
        cancelAnimationFrame(fitStateRef.current._r1);
        cancelAnimationFrame(fitStateRef.current._r2);
        cancelAnimationFrame(fitStateRef.current._r3);
      } catch {}
      try {
        clearTimeout(fitStateRef.current._t1);
        clearTimeout(fitStateRef.current._t2);
        clearTimeout(fitStateRef.current._t3);
        clearTimeout(fitStateRef.current._t4);
      } catch {}
      try {
        const gg = window.google;
        if (gg?.maps?.event) {
          if (l1) gg.maps.event.removeListener(l1);
          if (l2) gg.maps.event.removeListener(l2);
        }
      } catch {}
    };
  }, [isReady, mapInstance, scheduleFit, triggerResizeAndNudge, routeId]);

  useEffect(() => {
    if (!isReady || !mapInstance) return;
    scheduleFit("points");
  }, [drawPoints, isReady, mapInstance, scheduleFit]);

  const locationLabel = useMemo(() => {
    const fromProp = String(areaLabel || "").trim();
    const picked = stopsLoaded ? pickLocationLabelFromStops(stops) : "";
    const txt = (fromProp || picked || "MUĞLA").toString().trim();
    const out = txt.length > 18 ? txt.slice(0, 18) : txt;
    return out;
  }, [areaLabel, stopsLoaded, stops]);

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

    const code = String(gmaps?.error?.message || "").trim();
    if (code === "MAP_DIV_MISSING") return "Harita alanı henüz hazır değil. Biraz bekleyip tekrar deneyin.";
    if (code === "MAP_INIT_FAILED") return gmaps?.errorMsg || "Harita oluşturulamadı.";

    const base = String(gmaps?.errorMsg || gmaps?.error?.message || gmaps?.error || "")
      .toLowerCase()
      .trim();

    if (base.includes("billing")) return "Google Maps için faturalandırma (billing) etkin değil.";
    if (base.includes("referer") || base.includes("referrer")) return "API anahtarı referrer kısıtına takıldı.";
    if (base.includes("invalid") && base.includes("key")) return "Google Maps API anahtarı geçersiz.";
    if (base.includes("auth_failed")) return "Google Maps yetkilendirme hatası.";
    if (gmapsStatus === "blocked") return "Google Maps yüklemesi engellendi.";
    if (gmapsStatus === "missing_key") return "Google Maps API anahtarı eksik.";

    return gmaps?.errorMsg || "Harita yüklenemedi. Tekrar deneyin.";
  };

  const hasAnyInput = useMemo(() => {
    if (typeof path === "string" && path.trim()) return true;
    if (Array.isArray(path) && path.length) return true;
    if (path && typeof path === "object" && Object.keys(path).length) return true;
    if (Array.isArray(stops) && stops.length) return true;
    return false;
  }, [path, stops]);

  const showNoPoints = isReady && hasAnyInput && (!points || points.length === 0);
  const bc = Math.max(0, Math.min(12, Math.floor(Number(badgeCount) || 0)));

  return (
    <div
      ref={shellRef}
      className="rdmps-shell rdmps-root"
      style={{
        position: "relative",
        width: "100%",
        height: shellH,
        minHeight: shellH,
        borderRadius: "inherit",
        overflow: "hidden",
        WebkitTapHighlightColor: "transparent",
        background: "var(--rdmps-bg, rgba(0,0,0,0.10))",
      }}
      data-routeid={routeId || ""}
      data-ready={isReady ? "1" : "0"}
      data-error={isError ? "1" : "0"}
      data-points={(points && points.length) || 0}
      data-hasmapid={hasMapId ? "1" : "0"}
    >
      <div
        className="rdmps-map"
        ref={setDivRef}
        data-ready-tick={mapReadyTick}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          minHeight: "100%",
          pointerEvents: "auto",
          touchAction: "none",
        }}
      />

      <div
        className="rd-map-badges"
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          pointerEvents: "none",
          zIndex: 4,
        }}
      >
        {isReady && rawPointCount > 0 ? (
          <div className="rd-map-badge">{rawPointCount} NOKTA</div>
        ) : (
          <div className="rd-map-badge">{isLoading ? "YÜKLENİYOR" : "HARİTA"}</div>
        )}

        {bc > 0 &&
          Array.from({ length: bc }).map((_, i) => (
            <div key={i} className="rd-map-badge rd-map-badge--mini">
              {i + 1}
            </div>
          ))}
      </div>

      <div
        className="rd-map-loc"
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          pointerEvents: "none",
          zIndex: 4,
        }}
      >
        {locationLabel}
      </div>

      {isLoading ? (
        <div style={overlayBase} aria-label="Harita yükleniyor">
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={spinner} />
              <div style={title}>Harita hazırlanıyor…</div>
            </div>
            <div style={desc}>Bağlantı veya cihaz performansına göre birkaç saniye sürebilir.</div>
            <div style={btnRow}>
              <button type="button" style={ghostBtn} onClick={handleRetry}>
                Yeniden dene
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isError ? (
        <div style={overlayBase} aria-label="Harita hatası">
          <div style={card}>
            <div style={title}>Harita yüklenemedi</div>
            <div style={desc}>{messageForError()}</div>
            <div style={btnRow}>
              <button type="button" style={retryBtn} onClick={handleRetry}>
                Yeniden dene
              </button>
              <button
                type="button"
                style={ghostBtn}
                onClick={() => {
                  try {
                    window.location.reload();
                  } catch {}
                }}
              >
                Sayfayı yenile
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showNoPoints ? (
        <div style={overlayBase} aria-label="Rota noktası yok">
          <div style={card}>
            <div style={title}>Rota çizgisi bulunamadı</div>
            <div style={desc}>
              Bu rotada çizilecek bir path/nokta verisi görünmüyor (veya format decode edilemedi). Durak/path formatını
              kontrol edin.
            </div>
            <div style={btnRow}>
              <button type="button" style={retryBtn} onClick={handleRetry}>
                Yeniden dene
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes rdmpspin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .rdmps-shell{
          height: var(--rdmps-h, 100%) !important;
          min-height: var(--rdmps-h, 100%) !important;
        }

        .rdmps-map,
        .rdmps-map > div,
        .rdmps-map .gm-style,
        .rdmps-map .gm-style > div {
          width: 100% !important;
          height: 100% !important;
        }

        .rdmps-map canvas{
          width: 100% !important;
          height: 100% !important;
        }

        .rd-map-badge.rd-map-badge--mini{
          height: 22px;
          padding: 0 8px;
          font-size: 10px;
          letter-spacing: 0.06em;
          opacity: 0.98;
        }

        .rdmps-root[data-hasmapid="1"] .rdmps-map {
          filter: contrast(1.05) saturate(0.88) brightness(0.96);
        }

        /* ✅ global css max-width:100% map tile bozmasın */
        .gm-style img, .gm-style canvas {
          max-width: none !important;
        }
      `}</style>
    </div>
  );
}
