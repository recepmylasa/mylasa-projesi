// src/utils/anim.js
import { MOBILE_ZOOM } from "../constants/map";

/** küçük yardımcılar */
export function lerp(a, b, t) { return a + (b - a) * t; }
export function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

/** iki koordinasyon arası Haversine (metre) */
export function distanceMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa =
    s1 * s1 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

/**
 * Akıllı uçuş animasyonu.
 * - Yakın hedeflerde zoom dışarı-İÇERİ yapmaz; sadece yumuşak pan.
 * - Uzak hedeflerde kısa bir dışa, sonra hedefe yakın içe zoom.
 * - Çok yakınsa ( <80 m ) direkt panTo.
 */
export function animateFlyTo(map, fromCenter, toCenter, fromZoom, toZoom = MOBILE_ZOOM, totalMs = 1100) {
  if (!map || !fromCenter || !toCenter) return;

  const dist = distanceMeters(fromCenter, toCenter);

  // Çok yakın: native pan yeter
  if (dist < 80 && Math.abs((fromZoom ?? MOBILE_ZOOM) - (toZoom ?? MOBILE_ZOOM)) <= 1) {
    try { map.panTo(toCenter); } catch {}
    return;
  }

  const start = performance.now();

  // uzaklığa göre strateji
  const onlyPan = dist < 1200;   // ~1.2 km altı sadece pan
  const midZoom =
    onlyPan
      ? (fromZoom ?? MOBILE_ZOOM)
      : Math.max(3, Math.min((fromZoom ?? MOBILE_ZOOM) - (dist > 5000 ? 4 : 3), 10));

  function frame(now) {
    const t = Math.min(1, (now - start) / totalMs);
    const e = easeInOut(t);

    // merkez
    const lat = lerp(fromCenter.lat, toCenter.lat, e);
    const lng = lerp(fromCenter.lng, toCenter.lng, e);

    // zoom akışı
    let z = fromZoom ?? MOBILE_ZOOM;
    if (!onlyPan) {
      if (t < 0.35) z = lerp(fromZoom ?? MOBILE_ZOOM, midZoom, t / 0.35);
      else if (t < 0.75) z = midZoom;
      else z = lerp(midZoom, toZoom ?? MOBILE_ZOOM, (t - 0.75) / 0.25);
    } else {
      // sadece pan — yakın hedefte sonda küçük bir düzeltme
      if (t > 0.85) z = lerp(fromZoom ?? MOBILE_ZOOM, toZoom ?? MOBILE_ZOOM, (t - 0.85) / 0.15);
    }

    try { map.setCenter({ lat, lng }); map.setZoom(z); } catch {}
    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
