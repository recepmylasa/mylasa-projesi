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
exports.aggregateShareMetricsDaily = exports.logShareEvent = exports.backfillGeoCallable = exports.onRouteGeoFinish = exports.routeOgImage = exports.renderRouteShare = exports.onFollowsDelete = exports.onFollowsCreate = exports.onFollowersDelete = exports.onFollowersCreate = exports.backfillAreasCallable = exports.onRouteAreasFinish = void 0;
// Node 20 / TS (firebase-functions v4 - v1 API)
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const geo_1 = require("./geo");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
const SLOW_THROTTLE_MS = 350;
const isDone = (x) => (x?.areasStatus || "").toString() === "done";
const isFinished = (x) => (x?.status || "").toString() === "finished";
function asPoint(p) {
    if (!p)
        return null;
    if (Array.isArray(p) && p.length >= 2) {
        const [lat, lng] = p;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
        }
    }
    if (typeof p === "object") {
        const lat = p.lat ?? p.latitude;
        const lng = p.lng ??
            p.longitude ??
            p.lon;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
        }
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
    if (mid &&
        (pts.length === 0 ||
            mid.lat !== pts[0].lat ||
            mid.lng !== pts[0].lng))
        pts.push(mid);
    if (last &&
        (pts.length === 0 ||
            last.lat !== pts[pts.length - 1].lat ||
            last.lng !== pts[pts.length - 1].lng))
        pts.push(last);
    return pts;
}
function centroidOfStops(stops) {
    if (!Array.isArray(stops) || stops.length === 0)
        return null;
    let sx = 0, sy = 0, n = 0;
    for (const s of stops) {
        const p = asPoint(s?.location || s);
        if (p) {
            sx += p.lat;
            sy += p.lng;
            n++;
        }
    }
    if (!n)
        return null;
    return { lat: sx / n, lng: sy / n };
}
function majority(vals) {
    const c = new Map();
    for (const v of vals) {
        if (v)
            c.set(v, (c.get(v) || 0) + 1);
    }
    let best;
    let bestN = 0;
    for (const [k, n] of c) {
        if (n > bestN) {
            best = k;
            bestN = n;
        }
    }
    return best;
}
async function geocodeForRoute(data) {
    let points = [];
    if (Array.isArray(data?.path)) {
        points = sample3FromPath(data.path);
    }
    if (points.length === 0 && Array.isArray(data?.stops)) {
        const c = centroidOfStops(data.stops);
        if (c)
            points = [c];
    }
    if (points.length === 0) {
        const a = asPoint(data?.start) || asPoint(data?.from);
        const b = asPoint(data?.end) || asPoint(data?.to);
        if (a)
            points.push(a);
        if (b &&
            (points.length === 0 ||
                b.lat !== points[0].lat ||
                b.lng !== points[0].lng))
            points.push(b);
    }
    if (points.length === 0)
        return {};
    const results = [];
    for (const p of points) {
        await new Promise((r) => setTimeout(r, 80));
        const r = await (0, geo_1.reverseGeocode)(p.lat, p.lng);
        results.push(r);
    }
    const city = majority(results.map((x) => x.city)) || results[0]?.city;
    const admin1 = majority(results.map((x) => x.admin1)) || results[0]?.admin1;
    const country = majority(results.map((x) => x.country)) ||
        results[0]?.country;
    const countryCode = majority(results.map((x) => x.countryCode)) ||
        results[0]?.countryCode;
    return { city, admin1, country, countryCode };
}
exports.onRouteAreasFinish = functions
    .runWith({
    secrets: ["GEOCODING_API_KEY", "GEOCODING_PROVIDER"],
})
    .firestore.document("routes/{routeId}")
    .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    if (!isFinished(after) || isDone(after) || isDone(before))
        return;
    if (after?.areas &&
        (after.areas.city || after.areas.countryCode)) {
        await change.after.ref.set({ areasStatus: "done" }, { merge: true });
        return;
    }
    try {
        const areas = await geocodeForRoute(after);
        if (!areas.city && !areas.countryCode) {
            await change.after.ref.set({
                areasStatus: "error",
                areasErrorCode: "NO_RESULT",
            }, { merge: true });
            return;
        }
        await change.after.ref.set({
            areas,
            areasStatus: "done",
            areasErrorCode: admin.firestore.FieldValue.delete(),
        }, { merge: true });
    }
    catch (e) {
        await change.after.ref.set({
            areasStatus: "error",
            areasErrorCode: String(e?.message || e || "ERR"),
        }, { merge: true });
    }
});
exports.backfillAreasCallable = functions
    .runWith({
    secrets: ["GEOCODING_API_KEY", "GEOCODING_PROVIDER"],
})
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const pageSize = Math.min(Number(data?.pageSize || 40), 100);
    let scanned = 0, updated = 0, errors = 0;
    let last;
    for (let page = 0; page < 5; page++) {
        let q = db
            .collection("routes")
            .where("status", "==", "finished")
            .limit(pageSize);
        if (last)
            q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty)
            break;
        for (const docSnap of snap.docs) {
            scanned++;
            last = docSnap;
            const d = docSnap.data() || {};
            if (isDone(d))
                continue;
            if (d?.areas &&
                (d.areas.city || d.areas.countryCode)) {
                await docSnap.ref.set({ areasStatus: "done" }, { merge: true });
                continue;
            }
            try {
                const areas = await geocodeForRoute(d);
                if (!areas.city && !areas.countryCode) {
                    await docSnap.ref.set({
                        areasStatus: "error",
                        areasErrorCode: "NO_RESULT",
                    }, { merge: true });
                }
                else {
                    await docSnap.ref.set({
                        areas,
                        areasStatus: "done",
                        areasErrorCode: admin.firestore.FieldValue.delete(),
                    }, { merge: true });
                    updated++;
                }
            }
            catch {
                errors++;
                await docSnap.ref.set({
                    areasStatus: "error",
                    areasErrorCode: "EXC",
                }, { merge: true });
            }
            await new Promise((r) => setTimeout(r, SLOW_THROTTLE_MS));
        }
        if (snap.size < pageSize)
            break;
    }
    return { scanned, updated, errors };
});
/* =========================
   Followers counters
   ========================= */
async function adjustCounts(targetUid, followerUid, delta) {
    if (!targetUid || !followerUid || targetUid === followerUid)
        return;
    const targetRef = db.collection("users").doc(String(targetUid));
    const followerRef = db
        .collection("users")
        .doc(String(followerUid));
    await db.runTransaction(async (t) => {
        t.set(targetRef, {
            followersCount: admin.firestore.FieldValue.increment(delta),
        }, { merge: true });
        t.set(followerRef, {
            followingCount: admin.firestore.FieldValue.increment(delta),
        }, { merge: true });
    });
}
exports.onFollowersCreate = functions.firestore
    .document("users/{targetUid}/followers/{followerUid}")
    .onCreate(async (_snap, ctx) => {
    const { targetUid, followerUid } = ctx.params;
    await adjustCounts(targetUid, followerUid, 1);
});
exports.onFollowersDelete = functions.firestore
    .document("users/{targetUid}/followers/{followerUid}")
    .onDelete(async (_snap, ctx) => {
    const { targetUid, followerUid } = ctx.params;
    await adjustCounts(targetUid, followerUid, -1);
});
exports.onFollowsCreate = functions.firestore
    .document("follows/{pairId}")
    .onCreate(async (snap, ctx) => {
    const d = snap.data() || {};
    let follower = d.followerId;
    let followee = d.followeeId;
    if (!follower || !followee) {
        const pair = String(ctx.params.pairId || "");
        const [a, b] = pair.split("_");
        if (!follower)
            follower = a;
        if (!followee)
            followee = b;
    }
    if (follower && followee) {
        await adjustCounts(followee, follower, 1);
    }
});
exports.onFollowsDelete = functions.firestore
    .document("follows/{pairId}")
    .onDelete(async (snap, ctx) => {
    const d = snap.data() || {};
    let follower = d.followerId;
    let followee = d.followeeId;
    if (!follower || !followee) {
        const pair = String(ctx.params.pairId || "");
        const [a, b] = pair.split("_");
        if (!follower)
            follower = a;
        if (!followee)
            followee = b;
    }
    if (follower && followee) {
        await adjustCounts(followee, follower, -1);
    }
});
/* === Modül exportları === */
var share_1 = require("./share");
Object.defineProperty(exports, "renderRouteShare", { enumerable: true, get: function () { return share_1.renderRouteShare; } });
var og_1 = require("./og");
Object.defineProperty(exports, "routeOgImage", { enumerable: true, get: function () { return og_1.routeOgImage; } });
var geoindex_1 = require("./geoindex");
Object.defineProperty(exports, "onRouteGeoFinish", { enumerable: true, get: function () { return geoindex_1.onRouteGeoFinish; } });
Object.defineProperty(exports, "backfillGeoCallable", { enumerable: true, get: function () { return geoindex_1.backfillGeoCallable; } });
var telemetry_1 = require("./telemetry");
Object.defineProperty(exports, "logShareEvent", { enumerable: true, get: function () { return telemetry_1.logShareEvent; } });
Object.defineProperty(exports, "aggregateShareMetricsDaily", { enumerable: true, get: function () { return telemetry_1.aggregateShareMetricsDaily; } });
