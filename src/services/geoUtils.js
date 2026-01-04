// src/services/geoUtils.js
// EMİR 03 — Geo Utils (saf fonksiyonlar, SSR-safe, side-effect yok)

const EARTH_RADIUS_M = 6371000;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function toNumberSafe(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * normalizeLatLng(input)
 * input: {lat,lng} | {latitude,longitude}
 * returns: {lat:number,lng:number} | null
 */
export function normalizeLatLng(input) {
  try {
    if (!input || typeof input !== "object") return null;

    const latRaw =
      Object.prototype.hasOwnProperty.call(input, "lat") ? input.lat : input.latitude;
    const lngRaw =
      Object.prototype.hasOwnProperty.call(input, "lng") ? input.lng : input.longitude;

    const lat = toNumberSafe(latRaw);
    const lng = toNumberSafe(lngRaw);

    if (lat == null || lng == null) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    // Basic sanity bounds
    if (lat < -90 || lat > 90) return null;
    if (lng < -180 || lng > 180) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * haversineMeters(a, b) -> number meters
 * a,b: normalize edilebilir input
 */
export function haversineMeters(a, b) {
  const A = normalizeLatLng(a);
  const B = normalizeLatLng(b);
  if (!A || !B) return NaN;

  const lat1 = A.lat * DEG2RAD;
  const lat2 = B.lat * DEG2RAD;
  const dLat = (B.lat - A.lat) * DEG2RAD;
  const dLng = (B.lng - A.lng) * DEG2RAD;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * (sinDLng * sinDLng);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  const d = EARTH_RADIUS_M * c;

  return Number.isFinite(d) ? d : NaN;
}

/**
 * polylineLengthMeters(path) -> number meters
 * path: Array<{lat,lng}|{latitude,longitude}>
 */
export function polylineLengthMeters(path) {
  try {
    if (!Array.isArray(path) || path.length < 2) return 0;

    let sum = 0;
    let prev = normalizeLatLng(path[0]);
    for (let i = 1; i < path.length; i++) {
      const cur = normalizeLatLng(path[i]);
      if (prev && cur) {
        const d = haversineMeters(prev, cur);
        if (Number.isFinite(d)) sum += d;
      }
      prev = cur;
    }
    return Number.isFinite(sum) ? sum : NaN;
  } catch {
    return NaN;
  }
}

/**
 * Internal: Equirectangular projection (meters) around a reference latitude.
 * We use segment-start A as origin.
 */
function projectMetersFromA(A, X, refLatRad) {
  const dLat = (X.lat - A.lat) * DEG2RAD;
  const dLng = (X.lng - A.lng) * DEG2RAD;

  const x = EARTH_RADIUS_M * dLng * Math.cos(refLatRad);
  const y = EARTH_RADIUS_M * dLat;
  return { x, y };
}

function unprojectMetersToLatLng(A, vecMeters, refLatRad) {
  const dLatRad = vecMeters.y / EARTH_RADIUS_M;
  const cosLat = Math.cos(refLatRad);
  const dLngRad = cosLat === 0 ? 0 : vecMeters.x / (EARTH_RADIUS_M * cosLat);

  const lat = A.lat + dLatRad * RAD2DEG;
  const lng = A.lng + dLngRad * RAD2DEG;

  // Clamp very lightly to valid bounds (numerical safety)
  const latClamped = Math.max(-90, Math.min(90, lat));
  const lngClamped = Math.max(-180, Math.min(180, lng));

  return { lat: latClamped, lng: lngClamped };
}

function clamp01(t) {
  if (!Number.isFinite(t)) return 0;
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

/**
 * Internal: project point P to segment AB using equirectangular approximation.
 * returns { distanceMeters, t, closest:{lat,lng} }
 */
function projectPointToSegmentEquirect(Pin, Ain, Bin) {
  const P = normalizeLatLng(Pin);
  const A = normalizeLatLng(Ain);
  const B = normalizeLatLng(Bin);
  if (!P || !A || !B) return null;

  // Reference latitude for scale
  const refLatRad = ((A.lat + B.lat + P.lat) / 3) * DEG2RAD;

  const a0 = { x: 0, y: 0 };
  const b = projectMetersFromA(A, B, refLatRad);
  const p = projectMetersFromA(A, P, refLatRad);

  const vx = b.x - a0.x;
  const vy = b.y - a0.y;

  const wx = p.x - a0.x;
  const wy = p.y - a0.y;

  const vv = vx * vx + vy * vy;

  // Degenerate segment
  if (!Number.isFinite(vv) || vv <= 1e-12) {
    const dist = Math.hypot(wx, wy);
    const closest = { lat: A.lat, lng: A.lng };
    return {
      distanceMeters: Number.isFinite(dist) ? dist : NaN,
      t: 0,
      closest,
    };
  }

  let t = (wx * vx + wy * vy) / vv;
  t = clamp01(t);

  const cx = vx * t;
  const cy = vy * t;

  const dx = wx - cx;
  const dy = wy - cy;

  const dist = Math.hypot(dx, dy);
  const closest = unprojectMetersToLatLng(A, { x: cx, y: cy }, refLatRad);

  return {
    distanceMeters: Number.isFinite(dist) ? dist : NaN,
    t,
    closest,
  };
}

/**
 * pointToSegmentDistanceMeters(p, a, b) -> number meters
 * (equirectangular approximation)
 */
export function pointToSegmentDistanceMeters(p, a, b) {
  const proj = projectPointToSegmentEquirect(p, a, b);
  if (!proj) return NaN;
  return proj.distanceMeters;
}

/**
 * pointToPolylineDistanceMeters(p, path)
 * returns:
 * {
 *  distanceMeters:number,
 *  segIndex:number,
 *  t:number,
 *  closest:{lat,lng}
 * } | null
 */
export function pointToPolylineDistanceMeters(p, path) {
  try {
    if (!Array.isArray(path) || path.length < 2) return null;

    let best = null;

    for (let i = 0; i < path.length - 1; i++) {
      const proj = projectPointToSegmentEquirect(p, path[i], path[i + 1]);
      if (!proj) continue;

      const d = proj.distanceMeters;
      if (!Number.isFinite(d)) continue;

      if (!best || d < best.distanceMeters) {
        best = {
          distanceMeters: d,
          segIndex: i,
          t: clamp01(proj.t),
          closest: proj.closest,
        };
      }
    }

    return best;
  } catch {
    return null;
  }
}

/**
 * progressAlongPolyline(p, path)
 * returns:
 * {
 *  alongMeters:number,
 *  totalMeters:number,
 *  percent:number, // 0..1
 *  segIndex:number,
 *  t:number
 * } | null
 */
export function progressAlongPolyline(p, path) {
  try {
    if (!Array.isArray(path) || path.length < 2) return null;

    let total = 0;
    let cumBefore = 0;

    let best = null;
    let bestAlong = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const A = normalizeLatLng(path[i]);
      const B = normalizeLatLng(path[i + 1]);

      let segLen = 0;
      if (A && B) {
        const d = haversineMeters(A, B);
        segLen = Number.isFinite(d) ? d : 0;
      }

      const proj = projectPointToSegmentEquirect(p, path[i], path[i + 1]);
      if (proj && Number.isFinite(proj.distanceMeters)) {
        const t = clamp01(proj.t);
        const alongHere = cumBefore + segLen * t;

        if (!best || proj.distanceMeters < best.distanceMeters) {
          best = {
            distanceMeters: proj.distanceMeters,
            segIndex: i,
            t,
          };
          bestAlong = alongHere;
        }
      }

      cumBefore += segLen;
      total += segLen;
    }

    if (!best) return null;

    const safeTotal = Number.isFinite(total) ? total : 0;
    const safeAlong = Number.isFinite(bestAlong) ? bestAlong : 0;

    const percent =
      safeTotal > 0 ? clamp01(safeAlong / safeTotal) : 0;

    return {
      alongMeters: safeAlong,
      totalMeters: safeTotal,
      percent,
      segIndex: best.segIndex,
      t: best.t,
    };
  } catch {
    return null;
  }
}
