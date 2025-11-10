"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillGeoCallable = exports.onRouteGeoFinish = void 0;
exports.computeRouteGeo = computeRouteGeo;
// Node 20 / TS
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const geofire_common_1 = require("geofire-common");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
/* ============ Yardımcılar ============ */
function asPoint(p) {
    if (!p)
        return null;
    if (Array.isArray(p) && p.length >= 2) {
        const [lat, lng] = p;
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    }
    if (typeof p === "object") {
        const lat = p.lat ?? p.latitude;
        const lng = p.lng ?? p.longitude ?? p.lon;
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    }
    return null;
}
function sample3FromPath(path) {
    const pts = [];
    if (!Array.isArray(path) || path.length === 0)
        return pts;
    const first = asPoint(path[0]);
    const mid = asPoint(path[Math.floor(path.length / 2)]);
    const last = asPoint(path[path.length - 1]);
    if (first)
        pts.push(first);
    if (mid && (pts.length === 0 || mid.lat !== pts[0].lat || mid.lng !== pts[0].lng))
        pts.push(mid);
    if (last && (pts.length === 0 || last.lat !== pts[pts.length - 1].lat || last.lng !== pts[pts.length - 1].lng))
        pts.push(last);
    return pts;
}
function centroid(pts) {
    if (!pts || pts.length === 0)
        return null;
    let sx = 0, sy = 0, n = 0;
    for (const p of pts) {
        if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
            sx += p.lat;
            sy += p.lng;
            n++;
        }
    }
    if (!n)
        return null;
    return { lat: sx / n, lng: sy / n };
}
function centroidOfStops(stops) {
    if (!Array.isArray(stops) || stops.length === 0)
        return null;
    const pts = [];
    for (const s of stops) {
        const p = asPoint(s?.location || s);
        if (p)
            pts.push(p);
    }
    return centroid(pts);
}
/* ============ Ana hesaplama ============ */
async function computeRouteGeo(route) {
    let center = null;
    // 1) Path varsa öncelik path
    if (Array.isArray(route?.path) && route.path.length > 0) {
        center = centroid(sample3FromPath(route.path));
    }
    // 2) Yoksa stops
    if (!center && Array.isArray(route?.stops) && route.stops.length > 0) {
        center = centroidOfStops(route.stops);
    }
    // 3) Hiçbiri yoksa boş
    if (!center)
        return {};
    const geohash = (0, geofire_common_1.geohashForLocation)([center.lat, center.lng], 11);
    return { center, geohash };
}
/* ============ Trigger: route finished → geo index ============ */
exports.onRouteGeoFinish = functions
    .region("us-central1")
    .firestore.document("routes/{routeId}")
    .onUpdate(async (change) => {
    const before = (change.before.data() || {});
    const after = (change.after.data() || {});
    // Sadece finished olduğunda; idempotent
    if (after.status !== "finished")
        return;
    if (after.routeGeo?.geohash && after.routeGeo?.center)
        return;
    const g = await computeRouteGeo(after);
    if (!g.center || !g.geohash)
        return;
    await change.after.ref.set({ routeGeo: g }, { merge: true });
});
/* ============ Callable: backfill ============ */
exports.backfillGeoCallable = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const pageSize = Math.min(Number(data?.pageSize || 50), 200);
    let scanned = 0, updated = 0;
    let last;
    for (let page = 0; page < 10; page++) {
        let q = db.collection("routes")
            .where("status", "==", "finished")
            .orderBy("createdAt", "desc")
            .limit(pageSize);
        if (last)
            q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty)
            break;
        for (const doc of snap.docs) {
            scanned++;
            const d = doc.data();
            if (d?.routeGeo?.geohash && d?.routeGeo?.center) {
                last = doc;
                continue;
            }
            const g = await computeRouteGeo(d);
            if (g.center && g.geohash) {
                await doc.ref.set({ routeGeo: g }, { merge: true });
                updated++;
            }
            await new Promise((r) => setTimeout(r, 50));
            last = doc;
        }
        if (snap.size < pageSize)
            break;
    }
    return { scanned, updated };
});
