/* FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreviewShell.js */
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

/**
 * [a,b] can be [lat,lng] or [lng,lat]
 * Rule (EMİR 2):
 * - If one value is impossible as lat (|v|>90) but valid as lng -> swap accordingly
 * - Else ambiguous -> heuristic: if abs(a) > abs(b) assume [lat,lng], else assume [lng,lat]
 */
function parseArrayLatLng(arr) {
  try {
    if (!Array.isArray(arr) || arr.length < 2) return null;

    const a = toFiniteNumber(arr[0]);
    const b = toFiniteNumber(arr[1]);
    if (a == null || b == null) return null;

    const aLatOk = Math.abs(a) <= 90;
    const bLatOk = Math.abs(b) <= 90;
    const aLngOk = Math.abs(a) <= 180;
    const bLngOk = Math.abs(b) <= 180;

    // If a cannot be lat but can be lng, and b can be lat -> swap
    if (!aLatOk && aLngOk && bLatOk) {
      const lat = b;
      const lng = a;
      return inRangeLatLng(lat, lng) ? { lat, lng } : null;
    }

    // If b cannot be lat but can be lng, and a can be lat -> keep [lat,lng]
    if (!bLatOk && bLngOk && aLatOk) {
      const lat = a;
      const lng = b;
      return inRangeLatLng(lat, lng) ? { lat, lng } : null;
    }

    // Both could be lat -> ambiguous
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

    const a = toFiniteNumber(parts[0]);
    const b = toFiniteNumber(parts[1]);
    if (a == null || b == null) return null;

    // Apply same array rules
    return parseArrayLatLng([a, b]);
  } catch {
    return null;
  }
}

function extractLatLng(any, depth = 0, seen) {
  if (!any) return null;
  if (depth > 6) return null;

  const _seen = seen || new Set();

  // prevent cycles
  try {
    if (typeof any === "object") {
      if (_seen.has(any)) return null;
      _seen.add(any);
    }
  } catch {}

  // string "lat,lng" / "lng lat"
  try {
    if (typeof any === "string") {
      const out = parseCoordString(any);
      if (out) return out;
    }
  } catch {}

  // array [a,b]
  try {
    if (Array.isArray(any) && any.length >= 2) {
      const out = parseArrayLatLng(any);
      if (out) return out;
    }
  } catch {}

  // google.maps.LatLng
  try {
    if (typeof any.lat === "function" && typeof any.lng === "function") {
      const lat = toFiniteNumber(any.lat());
      const lng = toFiniteNumber(any.lng());
      if (lat != null && lng != null && inRangeLatLng(lat, lng)) return { lat, lng };
    }
  } catch {}

  // Firestore GeoPoint
  try {
    if (typeof any.latitude === "number" && typeof any.longitude === "number") {
      const lat = toFiniteNumber(any.latitude);
      const lng = toFiniteNumber(any.longitude);
      if (lat != null && lng != null && inRangeLatLng(lat, lng)) return { lat, lng };
    }
    // some serializations
    if (typeof any._lat === "number" && typeof any._long === "number") {
      const lat = toFiniteNumber(any._lat);
      const lng = toFiniteNumber(any._long);
      if (lat != null && lng != null && inRangeLatLng(lat, lng)) return { lat, lng };
    }
  } catch {}

  // Plain object variants
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

  // GeoJSON-ish {type:"LineString", coordinates:[[lng,lat],...]} handled upstream, but also allow single coord
  try {
    if (any?.type && typeof any.type === "string" && Array.isArray(any.coordinates)) {
      // if it's a single coord array: [lng,lat]
      const single = extractLatLng(any.coordinates, depth + 1, _seen);
      if (single) return single;
    }
  } catch {}

  // Nested candidates
  const candidates = [
    any?.latLng,
    any?.latlng,
    any?.location,
    any?.loc,
    any?.geo,
    any?.geoPoint,
    any?.geopoint,
    any?.point,
    any?.position,
    any?.pos,
    any?.center,
    any?.coord,
    any?.coords,
    any?.coordinates,
    any?.geometry?.location,
    any?.geometry,
    any?.place?.location,
    any?.place?.geometry?.location,
    any?.place?.geometry,
    any?.stop?.location,
    any?.stop?.coords,
    any?.stop?.geo,
    any?.stop?.point,
    any?.place?.coord,
    any?.place?.coords,
  ];

  for (const c of candidates) {
    const p = extractLatLng(c, depth + 1, _seen);
    if (p) return p;
  }

  return null;
}

function coercePointsArray(input) {
  if (Array.isArray(input)) return input;

  // GeoJSON-ish line
  if (input && typeof input === "object") {
    if (input?.type === "LineString" && Array.isArray(input.coordinates)) return input.coordinates;

    const cands = [
      input?.path,
      input?.points,
      input?.polyline,
      input?.coordinates,
      input?.geometry?.path,
      input?.geometry?.points,
      input?.geometry?.coordinates,
      input?.geometry,
    ];
    for (const c of cands) {
      if (Array.isArray(c)) return c;
      if (c && typeof c === "object" && c?.type === "LineString" && Array.isArray(c.coordinates)) return c.coordinates;
    }
  }

  // if string with single coord, normalizePointsFromPath will pick 1 point
  return input ? [input] : [];
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
  const arr = coercePointsArray(path);
  const out = [];
  for (const p of arr) {
    const ll = extractLatLng(p);
    if (ll) out.push(ll);
  }
  return dedupBy6(out);
}

function normalizePointsFromStops(stops) {
  const arr = Array.isArray(stops) ? stops : [];
  const out = [];
  for (const s of arr) {
    const ll = extractLatLng(s);
    if (ll) out.push(ll);
  }
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

  const gmapsReload = gmaps.reload;
  const gmapsAttemptLoad = gmaps.attemptLoad;

  const isReady = gmapsStatus === "ready" || gmapsStatus === "loaded";
  const isError =
    gmapsStatus === "error" ||
    gmapsStatus === "failed" ||
    gmapsStatus === "blocked" ||
    gmapsStatus === "missing_key";

  const isLoading = !isReady && !isError;

  const handleRetry = useCallback(() => {
    // ✅ önce maps loader'ı toparla
    try {
      if (typeof gmapsReload === "function") gmapsReload();
    } catch {}
    try {
      if (typeof gmapsAttemptLoad === "function") gmapsAttemptLoad(true);
    } catch {}
    // ✅ sonra dış handler
    try {
      onRetry();
    } catch {}
  }, [gmapsReload, gmapsAttemptLoad, onRetry]);

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

  // ===== Flash UI Map Styling =====
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

  // ===== EMİR 2 — Nokta toplama önceliği (path -> stops) + 1 nokta desteği =====
  const points = useMemo(() => {
    const ptsFromPath = normalizePointsFromPath(path);
    const ptsFromStops = normalizePointsFromStops(stops);

    if (ptsFromPath.length >= 2) return ptsFromPath;
    if (ptsFromStops.length >= 2) return ptsFromStops;

    if (ptsFromPath.length === 1) return ptsFromStops.length ? ptsFromStops : ptsFromPath;
    if (ptsFromStops.length === 1) return ptsFromStops;

    return [];
  }, [path, stops]);

  const polylineRef = useRef(null);
  const glowRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);

  // marker/polyline create + update + cleanup
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

    // no points
    if (!points || points.length < 1) {
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

    // single point: marker only (no polyline)
    if (points.length === 1) {
      try {
        if (polylineRef.current) polylineRef.current.setMap(null);
        if (glowRef.current) glowRef.current.setMap(null);
      } catch {}
      polylineRef.current = null;
      glowRef.current = null;

      const p0 = points[0];

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

    // 2+ points: polyline + start/end markers
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
  }, [mapInstance, points]);

  // ===== EMİR 2 — FitBounds / Zoom Stabilitesi (1 nokta desteği + loop-breaker + RO+RAF) =====
  const fitStateRef = useRef({
    pendingTimer: null,
    pendingRaf: null,
    lastSig: "",
    lastAt: 0,
    lastAnyAt: 0,
  });

  const safeTriggerResize = useCallback(() => {
    const map = mapInstance;
    const g = window.google;
    if (!map || !g?.maps?.event?.trigger) return;
    try {
      g.maps.event.trigger(map, "resize");
    } catch {}
  }, [mapInstance]);

  const computeSig = useCallback((pts, rect) => {
    const w = rect?.width || 0;
    const h = rect?.height || 0;

    // bucket size to avoid “sheet anim” micro-jitter spam
    const wB = Math.round(w / 40) * 40;
    const hB = Math.round(h / 40) * 40;

    if (!pts || pts.length < 1) return `0:${wB}x${hB}`;

    const first = pts[0];
    const last = pts[pts.length - 1];

    const f = `${round6(first.lat)},${round6(first.lng)}`;
    const l = `${round6(last.lat)},${round6(last.lng)}`;

    return `${pts.length}:${f}:${l}:${wB}x${hB}`;
  }, []);

  const doFitNow = useCallback(
    (reason = "fit") => {
      const map = mapInstance;
      const el = localDivRef.current;
      const g = window.google;

      if (!isReady) return;
      if (!map || !el || !g?.maps) return;
      if (!points || points.length < 1) return;

      const rect = el.getBoundingClientRect?.();
      const w = rect?.width || 0;
      const h = rect?.height || 0;
      if (w <= 4 || h <= 4) return;

      const sig = computeSig(points, rect);

      const now = Date.now();
      if (fitStateRef.current.lastSig === sig && now - fitStateRef.current.lastAt < 800) return;
      if (now - fitStateRef.current.lastAnyAt < 180) return; // micro-throttle

      fitStateRef.current.lastSig = sig;
      fitStateRef.current.lastAt = now;
      fitStateRef.current.lastAnyAt = now;

      try {
        safeTriggerResize();
      } catch {}

      try {
        if (points.length === 1) {
          const p0 = points[0];
          map.setCenter(p0);
          const z = map.getZoom?.();
          if (!Number.isFinite(z) || z < 14 || z > 18) {
            map.setZoom(16);
          }
          return;
        }

        const bounds = new g.maps.LatLngBounds();
        for (const p of points) bounds.extend(p);

        map.fitBounds(bounds, { top: 22, right: 22, bottom: 22, left: 22 });
      } catch {}
    },
    [mapInstance, isReady, points, safeTriggerResize, computeSig]
  );

  const scheduleFit = useCallback(
    (reason = "tick") => {
      const el = localDivRef.current;
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

      if (reason === "resize") {
        fitStateRef.current.pendingTimer = setTimeout(run, 90);
        return;
      }

      run();
    },
    [isReady, mapInstance, doFitNow]
  );

  useEffect(() => {
    const el = localDivRef.current;
    if (!el) return;

    if (typeof ResizeObserver !== "undefined") {
      try {
        const ro = new ResizeObserver(() => {
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

    const onResize = () => scheduleFit("resize");
    try {
      window.addEventListener("resize", onResize);
    } catch {}
    return () => {
      try {
        window.removeEventListener("resize", onResize);
      } catch {}
    };
  }, [scheduleFit]);

  useEffect(() => {
    if (!isReady || !mapInstance) return;

    const raf1 = requestAnimationFrame(() => {
      scheduleFit("raf1");
      const raf2 = requestAnimationFrame(() => scheduleFit("raf2"));
      const raf3 = requestAnimationFrame(() => scheduleFit("raf3"));
      fitStateRef.current.pendingRaf = raf3;
      try {
        fitStateRef.current._r1 = raf1;
        fitStateRef.current._r2 = raf2;
        fitStateRef.current._r3 = raf3;
      } catch {}
    });

    return () => {
      try {
        cancelAnimationFrame(fitStateRef.current._r1);
        cancelAnimationFrame(fitStateRef.current._r2);
        cancelAnimationFrame(fitStateRef.current._r3);
      } catch {}
    };
  }, [isReady, mapInstance, scheduleFit]);

  useEffect(() => {
    if (!isReady || !mapInstance) return;
    scheduleFit("points");
  }, [points, isReady, mapInstance, scheduleFit]);

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
    const base = String(gmaps?.errorMsg || gmaps?.error?.message || gmaps?.error || "")
      .toLowerCase()
      .trim();

    if (base.includes("billing")) return "Google Maps için faturalandırma (billing) etkin değil.";
    if (base.includes("referer") || base.includes("referrer")) return "API anahtarı referrer kısıtına takıldı.";
    if (base.includes("invalid") && base.includes("key")) return "Google Maps API anahtarı geçersiz.";
    if (base.includes("auth_failed")) return "Google Maps yetkilendirme hatası.";
    if (gmapsStatus === "blocked") return "Google Maps yüklemesi engellendi.";
    if (gmapsStatus === "missing_key") return "Google Maps API anahtarı eksik.";
    if (gmapsStatus === "error" && base.includes("map_div_missing")) {
      return "Harita alanı henüz hazır değil. Biraz bekleyip tekrar deneyin.";
    }
    return gmaps?.errorMsg || "Harita yüklenemedi. Tekrar deneyin.";
  };

  const showNoPoints = isReady && stopsLoaded && (!points || points.length === 0);

  return (
    <div
      className="rdmps-shell rdmps-root"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: 14,
        overflow: "hidden",
        transform: "translateZ(0)",
      }}
      data-routeid={routeId || ""}
      data-ready={isReady ? "1" : "0"}
      data-error={isError ? "1" : "0"}
      data-points={(points && points.length) || 0}
    >
      <RouteDetailMapPreview mapDivRef={setDivRef} mapReadyTick={mapReadyTick} />

      <div className="rd-map-badges">
        {isReady && points?.length > 0 ? (
          <div className="rd-map-badge">{points.length} NOKTA</div>
        ) : (
          <div className="rd-map-badge">{isLoading ? "YÜKLENİYOR" : "HARİTA"}</div>
        )}
      </div>
      <div className="rd-map-loc">{locationLabel}</div>

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
            <div style={desc}>Bu rotada çizilecek bir path/nokta verisi görünmüyor. Durakları kontrol edin.</div>
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
      `}</style>
    </div>
  );
}
