// functions/src/og_map.ts
// Node 20 / TS
// Mini-harita: Web Mercator projeksiyonu + kutuya sığdırma yardımcıları

export type LatLng = { lat: number; lng: number };

// Web Mercator yardımcıları
const MAX_LAT = 85.05113; // mercator limit

function clampLat(lat: number) {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

function lonLatToMercatorXY(lng: number, lat: number) {
  const λ = ((lng + 180) % 360 + 360) % 360 - 180; // wrap [-180,180)
  const φ = (clampLat(lat) * Math.PI) / 180;
  const x = (λ + 180) / 360; // [0..1]
  const y =
    0.5 - Math.log((1 + Math.sin(φ)) / (1 - Math.sin(φ))) / (4 * Math.PI); // [0..1]
  return { x, y };
}

function bboxXY(pts: Array<{ x: number; y: number }>) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!pts.length) {
    minX = minY = 0;
    maxX = maxY = 1;
  }
  return { minX, minY, maxX, maxY };
}

// Kutuya sığdır: (w,h,pad) → piksel koordinatları
export function projectPathToBox(
  latlngs: LatLng[],
  box: { w: number; h: number; pad: number }
): { points: Array<[number, number]>; bbox: { minX: number; minY: number; maxX: number; maxY: number } } {
  const merc = latlngs.map((p) => lonLatToMercatorXY(p.lng, p.lat));
  const bb = bboxXY(merc);
  const innerW = Math.max(1, box.w - 2 * box.pad);
  const innerH = Math.max(1, box.h - 2 * box.pad);
  const spanX = Math.max(1e-12, bb.maxX - bb.minX);
  const spanY = Math.max(1e-12, bb.maxY - bb.minY);
  const scale = Math.min(innerW / spanX, innerH / spanY);

  const pts: Array<[number, number]> = merc.map((p) => {
    const sx = box.pad + (p.x - bb.minX) * scale;
    const sy = box.pad + (bb.maxY - p.y) * scale; // Y ekseni ters
    return [sx, sy];
  });

  return { points: pts, bbox: bb };
}

// Metresel kabaca genişlik/yükseklik tahmini (DoD için küçük/kısa rota ayrımı)
export function approxBBoxMeters(latlngs: LatLng[]) {
  if (!latlngs.length) return 0;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const p of latlngs) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  if (!isFinite(minLat) || !isFinite(maxLat) || !isFinite(minLng) || !isFinite(maxLng)) return 0;
  const midLat = (minLat + maxLat) / 2;
  const latMeters = (maxLat - minLat) * 111_320; // ~m/deg
  const lonMeters = ((maxLng - minLng) * 111_320 * Math.cos((midLat * Math.PI) / 180)) || 0;
  return Math.max(Math.abs(latMeters), Math.abs(lonMeters));
}
