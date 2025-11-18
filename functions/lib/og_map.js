"use strict";
// Node 20 / TS – OG mini-harita projeksiyon helper'ı
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectPathToBox = projectPathToBox;
/** Lat/Lng → Web Mercator (0–1 normalize) */
function projectToMercator(p) {
    const x = (p.lng + 180) / 360;
    const rad = (p.lat * Math.PI) / 180;
    const y = 0.5 -
        Math.log((1 + Math.sin(rad)) / (1 - Math.sin(rad))) /
            (4 * Math.PI);
    return { x, y };
}
/** Rota noktalarını verilen kutuya sığdırır, ekran koordinatlarını döner. */
function projectPathToBox(latlngs, box) {
    if (!Array.isArray(latlngs) || latlngs.length === 0) {
        return {
            points: [],
            bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        };
    }
    const mercator = latlngs.map(projectToMercator);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of mercator) {
        if (p.x < minX)
            minX = p.x;
        if (p.y < minY)
            minY = p.y;
        if (p.x > maxX)
            maxX = p.x;
        if (p.y > maxY)
            maxY = p.y;
    }
    if (!Number.isFinite(minX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(maxY)) {
        return {
            points: [],
            bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        };
    }
    const { w, h, pad } = box;
    const innerW = Math.max(w - pad * 2, 1);
    const innerH = Math.max(h - pad * 2, 1);
    const spanX = Math.max(maxX - minX, 1e-9);
    const spanY = Math.max(maxY - minY, 1e-9);
    const scale = Math.min(innerW / spanX, innerH / spanY);
    const points = mercator.map((p) => {
        const sx = pad + (p.x - minX) * scale;
        const sy = pad + (maxY - p.y) * scale; // y ekseni ters
        return [sx, sy];
    });
    return { points, bbox: { minX, minY, maxX, maxY } };
}
