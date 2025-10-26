// src/services/progress.js
// İlerleme hesabı: en yakın nokta, path bölme, mesafe toplamı, downsample

// Basit ve hızlı Haversine (metre)
function toRad(d) { return (d * Math.PI) / 180; }
export function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
  const aa = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

// Lat/Lng → yaklaşık yerel XY (metre)
// refLat: ölçek için referans enlem (deg)
function ll2xy(lat, lng, refLat) {
  const mPerDegLat = 111132; // ~m/deg
  const mPerDegLng = 111320 * Math.cos(refLat * Math.PI / 180);
  return { x: lng * mPerDegLng, y: lat * mPerDegLat, mPerDegLat, mPerDegLng };
}
// XY → Lat/Lng (metre uzayından geri)
function xy2ll(x, y, mPerDegLat, mPerDegLng) {
  return { lat: y / mPerDegLat, lng: x / mPerDegLng };
}

/**
 * path ( [{lat,lng,t}...] ) üzerinde point ( {lat,lng} ) için
 * en yakın izdüşüm noktasını bulur.
 * Dönüş: { index, lat, lng, distM, t }  → index: [index .. index+1] segmenti
 */
export function nearestPointOnPath({ path, point }) {
  if (!Array.isArray(path) || path.length === 0 || !point) {
    return { index: 0, lat: point?.lat ?? 0, lng: point?.lng ?? 0, distM: 0, t: 0 };
  }
  if (path.length === 1) {
    return { index: 0, lat: path[0].lat, lng: path[0].lng, distM: haversineMeters(path[0], point), t: 0 };
  }

  let best = { index: 0, lat: path[0].lat, lng: path[0].lng, distM: haversineMeters(path[0], point), t: 0 };

  for (let i = 0; i < path.length - 1; i++) {
    const A = path[i], B = path[i + 1];
    const refLat = (A.lat + B.lat) / 2;
    const a = ll2xy(A.lat, A.lng, refLat);
    const b = ll2xy(B.lat, B.lng, refLat);
    const p = ll2xy(point.lat, point.lng, refLat);

    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ap = { x: p.x - a.x, y: p.y - a.y };
    const ab2 = (ab.x * ab.x + ab.y * ab.y) || 1e-12;
    let t = (ap.x * ab.x + ap.y * ab.y) / ab2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    const ll = xy2ll(proj.x, proj.y, a.mPerDegLat, a.mPerDegLng);
    const candidate = { lat: ll.lat, lng: ll.lng };
    const d = haversineMeters(candidate, point);

    if (d < best.distM) {
      best = { index: i, lat: candidate.lat, lng: candidate.lng, distM: d, t };
    }
  }
  return best;
}

/**
 * index noktasına göre path'i ikiye böler.
 * nearest: {index, lat, lng, t}
 * done  : başlangıç → nearest
 * remain: nearest → son
 */
export function splitPathByIndex(path, nearest) {
  if (!Array.isArray(path) || path.length === 0) return { done: [], remain: [] };
  if (!nearest || nearest.index == null) return { done: [...path], remain: [] };

  const i = Math.max(0, Math.min(path.length - 1, nearest.index));
  const splitPoint = { lat: nearest.lat, lng: nearest.lng, t: path[i]?.t ?? null };

  // i == last → done tüm path, remain boş
  if (i >= path.length - 1 && nearest.t >= 1) {
    return { done: [...path], remain: [] };
  }

  const done = path.slice(0, i + 1);
  const lastDone = done[done.length - 1];
  if (!lastDone || haversineMeters(lastDone, splitPoint) > 0.01) done.push(splitPoint);

  const remain = [splitPoint, ...path.slice(i + 1)];
  return { done, remain };
}

/** Path'in toplam uzunluğu (metre) */
export function sumDistance(path) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineMeters(path[i - 1], path[i]);
  }
  return total;
}

/** Mesafeye göre downsample: ardışık noktalar minGapM altındaysa atlar */
export function downsampleByDistance(path, minGapM = 10) {
  if (!Array.isArray(path) || path.length <= 2) return path || [];
  const out = [];
  let last = null;
  for (const p of path) {
    if (!last) {
      out.push(p);
      last = p;
      continue;
    }
    const d = haversineMeters(last, p);
    if (d >= minGapM) {
      out.push(p);
      last = p;
    }
  }
  // Son nokta garanti
  if (out[out.length - 1] !== path[path.length - 1]) out.push(path[path.length - 1]);
  return out;
}
