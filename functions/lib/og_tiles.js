"use strict";
// Node 20 / TS
// MapTiler Static yardımcıları
Object.defineProperty(exports, "__esModule", { value: true });
exports.fitBoundsToCenterZoom = fitBoundsToCenterZoom;
exports.buildMapTilerUrl = buildMapTilerUrl;
exports.fetchTilePng = fetchTilePng;
exports.lighten = lighten;
// --- Web Mercator yardımcıları (normalize [0..1]) ---
function lonToX(lon) {
    return (lon + 180) / 360;
}
function latToY(lat) {
    const phi = (lat * Math.PI) / 180;
    const s = Math.log(Math.tan(Math.PI / 4 + phi / 2));
    return 0.5 - s / (2 * Math.PI);
}
/** bbox'ı verilen panel içine sığdıracak center+zoom'u yaklaşık hesapla */
function fitBoundsToCenterZoom(bbox, size) {
    const minX = lonToX(bbox.minLng);
    const maxX = lonToX(bbox.maxLng);
    const minY = latToY(bbox.maxLat); // dikkat: mercator y ters
    const maxY = latToY(bbox.minLat);
    const dx = Math.max(1e-9, Math.abs(maxX - minX));
    const dy = Math.max(1e-9, Math.abs(maxY - minY));
    const innerW = Math.max(1, size.w - size.pad * 2);
    const innerH = Math.max(1, size.h - size.pad * 2);
    const scalex = innerW / (dx * 256);
    const scaley = innerH / (dy * 256);
    let z = Math.min(Math.log2(scalex), Math.log2(scaley));
    if (!Number.isFinite(z))
        z = 14; // tek nokta vs.
    z = Math.max(0, Math.min(20, z));
    const centerLng = (bbox.minLng + bbox.maxLng) / 2;
    const centerLat = (bbox.minLat + bbox.maxLat) / 2;
    return { center: { lat: centerLat, lng: centerLng }, zoom: z };
}
function buildMapTilerUrl(p) {
    const style = encodeURIComponent(p.style);
    const w = Math.round(p.w);
    const h = Math.round(p.h);
    const z = Number(p.zoom.toFixed(2));
    // logo & attribution kapalı
    return `https://api.maptiler.com/maps/${style}/static/${p.center.lng},${p.center.lat},${z}/${w}x${h}.png?key=${encodeURIComponent(p.key)}&attribution=0&logo=0`;
}
async function fetchTilePng(url) {
    const timeoutMs = 10000;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const tryFetch = async () => {
            const r = await fetch(url, { signal: controller.signal });
            if (!r.ok)
                throw new Error(`tile ${r.status}`);
            const ab = await r.arrayBuffer();
            return Buffer.from(ab);
        };
        try {
            return await tryFetch();
        }
        catch {
            // 1 retry kısa bekleme
            await new Promise((r) => setTimeout(r, 300));
            return await tryFetch();
        }
    }
    finally {
        clearTimeout(to);
    }
}
// İsteğe bağlı: görseli biraz açma — şimdilik no-op (dependenci eklememek için)
function lighten(buf, _amount = 0.08) {
    return buf;
}
