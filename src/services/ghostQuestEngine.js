// src/services/ghostQuestEngine.js
// EMİR 04 — Ghost Mode MVP metrics engine (SAF, side-effect yok)

import {
  normalizeLatLng,
  haversineMeters,
  pointToPolylineDistanceMeters,
} from "./geoUtils";

/**
 * A) extractLatLngFromStop(stop)
 * stop.lat/lng
 * stop.latitude/longitude
 * stop.location.lat/lng
 * stop.location.latitude/longitude
 */
export function extractLatLngFromStop(stop) {
  try {
    if (!stop || typeof stop !== "object") return null;

    // direct
    const direct =
      normalizeLatLng(stop) ||
      normalizeLatLng({
        lat: stop.latitude,
        lng: stop.longitude,
      });

    if (direct) return direct;

    // nested location
    const loc = stop.location;
    const nested =
      normalizeLatLng(loc) ||
      normalizeLatLng({
        lat: loc?.latitude,
        lng: loc?.longitude,
      });

    return nested || null;
  } catch {
    return null;
  }
}

/**
 * B) buildCheckpointsFromStops(stops)
 * stops -> lat/lng çıkar, null’ları at.
 * dönüş: Array<{ id?:string, lat:number, lng:number, order?:number }>
 * sıralama: order varsa order’a göre, yoksa mevcut sıra
 */
export function buildCheckpointsFromStops(stops) {
  try {
    const arr = Array.isArray(stops) ? stops : [];
    const out = [];

    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      const ll = extractLatLngFromStop(s);
      if (!ll) continue;

      const cp = {
        ...(s?.id ? { id: String(s.id) } : {}),
        lat: ll.lat,
        lng: ll.lng,
        ...(typeof s?.order === "number" && Number.isFinite(s.order) ? { order: s.order } : {}),
      };
      out.push(cp);
    }

    // order varsa sort
    const hasOrder = out.some((x) => typeof x.order === "number" && Number.isFinite(x.order));
    if (hasOrder) out.sort((a, b) => (a.order || 0) - (b.order || 0));

    return out;
  } catch {
    return [];
  }
}

/**
 * C) computeGhostMetrics({ pos, path, checkpoints, visited, options })
 * Saf: visited -> yeni Set ile nextVisited döndürür (immutable)
 */
export function computeGhostMetrics({ pos, path, checkpoints, visited, options } = {}) {
  const opts = {
    offRouteThresholdM: 35,
    checkpointRadiusM: 25,
    completionTarget: 0.85,
    ...(options || {}),
  };

  const posLL = normalizeLatLng(pos);
  const pathArr = Array.isArray(path) ? path : [];
  const cps = Array.isArray(checkpoints) ? checkpoints : [];
  const prevVisited = visited instanceof Set ? visited : new Set();
  const nextVisited = new Set(prevVisited);

  // distance to route
  let distanceToRouteM = null;
  try {
    const dObj = pointToPolylineDistanceMeters(posLL, pathArr);
    if (dObj && Number.isFinite(dObj.distanceMeters)) {
      distanceToRouteM = dObj.distanceMeters;
    }
  } catch {
    distanceToRouteM = null;
  }

  const offRoute =
    distanceToRouteM != null &&
    Number.isFinite(distanceToRouteM) &&
    distanceToRouteM > Number(opts.offRouteThresholdM);

  // checkpoint hit + nearest checkpoint
  let nearestCheckpointM = null;

  if (posLL && cps.length > 0) {
    for (let i = 0; i < cps.length; i++) {
      const cp = cps[i];
      const d = haversineMeters(posLL, cp);
      if (!Number.isFinite(d)) continue;

      if (nearestCheckpointM == null || d < nearestCheckpointM) nearestCheckpointM = d;

      if (d <= Number(opts.checkpointRadiusM)) {
        nextVisited.add(i);
      }
    }
  }

  const totalCheckpoints = cps.length;
  const visitedCount = totalCheckpoints > 0 ? nextVisited.size : 0;

  const completion =
    totalCheckpoints > 0
      ? Math.max(0, Math.min(1, visitedCount / totalCheckpoints))
      : 0;

  const canFinish = completion >= Number(opts.completionTarget);

  return {
    distanceToRouteM: distanceToRouteM != null && Number.isFinite(distanceToRouteM) ? distanceToRouteM : null,
    offRoute: !!offRoute,
    visitedCount,
    totalCheckpoints,
    completion,
    canFinish,
    nearestCheckpointM: nearestCheckpointM != null && Number.isFinite(nearestCheckpointM) ? nearestCheckpointM : null,

    // internal use (hook): immutable visited set
    nextVisited,
  };
}
