// src/utils/geo.js
// Uzaklık hesabı (metre) ve yazı formatı

export function haversineMeters(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000; // metre
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function fmtDistance(m) {
  if (m == null || Number.isNaN(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${(Math.round(km * 10) / 10).toString().replace(".", ",")} km`;
}
