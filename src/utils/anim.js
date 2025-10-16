// src/utils/anim.js
import { MOBILE_ZOOM } from "../constants/map";

export function lerp(a, b, t) { return a + (b - a) * t; }
export function easeInOut(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2; }

export function animateFlyTo(map, fromCenter, toCenter, fromZoom, toZoom = MOBILE_ZOOM, totalMs = 1150) {
  if (!map) return;
  const start = performance.now();
  const midZoom = Math.max(3, Math.min(8, (fromZoom ?? 12) - 3));

  function frame(now) {
    const t = Math.min(1, (now - start) / totalMs);
    const e = easeInOut(t);

    let zoom;
    if (t < 0.3) zoom = lerp(fromZoom ?? 12, midZoom, t / 0.3);
    else if (t < 0.7) zoom = midZoom;
    else zoom = lerp(midZoom, toZoom ?? MOBILE_ZOOM, (t - 0.7) / 0.3);

    const lat = lerp(fromCenter.lat, toCenter.lat, e);
    const lng = lerp(fromCenter.lng, toCenter.lng, e);

    try { map.setCenter({ lat, lng }); map.setZoom(zoom); } catch {}
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
