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
exports.BADGES = void 0;
exports.seedBadgeCatalog = seedBadgeCatalog;
exports.applyRouteFinishedStats = applyRouteFinishedStats;
exports.checkFiveStarBadge = checkFiveStarBadge;
exports.backfillUserStatsAndBadges = backfillUserStatsAndBadges;
// functions/src/badges.ts
// Node 20 / TypeScript
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const db = admin.firestore();
// ---- Badge IDs (MVP 10)
exports.BADGES = {
    FIRST_ROUTE: "first_route",
    ROUTES_3: "routes_3",
    ROUTES_10: "routes_10",
    DIST_100: "dist_100km",
    DIST_500: "dist_500km",
    CITY_5: "city_5",
    COUNTRY_3: "country_3",
    MARATHON_20K: "marathon_20k",
    STOPS_5: "stops_5",
    FIVE_STAR_ROUTE: "five_star_route",
};
// ---------- utilities ----------
function badgeDocRef(uid, badgeId) {
    return db.collection("users").doc(uid).collection("badges").doc(badgeId);
}
function userStatsRef(uid) {
    return db.collection("users").doc(uid).collection("stats").doc("aggregate");
}
function routeRef(routeId) {
    return db.collection("routes").doc(routeId);
}
function routeStopsCol(routeId) {
    return routeRef(routeId).collection("stops");
}
async function ensureStatsDoc(uid) {
    const ref = userStatsRef(uid);
    const snap = await ref.get();
    if (!snap.exists) {
        const init = {
            routesFinished: 0,
            distanceSumM: 0,
            cities: {},
            countries: {},
            lastUpdatedAt: firestore_1.Timestamp.now(),
        };
        await ref.set(init);
        return init;
    }
    return snap.data();
}
async function awardBadgeIfNotExists(uid, badgeId, sourceRouteId) {
    const bRef = badgeDocRef(uid, badgeId);
    const already = await bRef.get();
    if (already.exists)
        return false;
    // katalogtan kopya alanları oku (adı, tier vs.)
    const cat = await db.collection("badge_catalog").doc(badgeId).get();
    const payload = {
        earnedAt: firestore_1.FieldValue.serverTimestamp(),
        tier: cat.data()?.tier || "normal",
        name: cat.data()?.name || badgeId,
        sourceRouteId: sourceRouteId || null,
    };
    await bRef.set(payload, { merge: true });
    return true;
}
// ---------- seed ----------
async function seedBadgeCatalog() {
    const cats = {
        [exports.BADGES.FIRST_ROUTE]: { name: "İlk Rota", desc: "İlk rotanı tamamladın.", icon: "🥇", tier: "normal", order: 10 },
        [exports.BADGES.ROUTES_3]: { name: "3 Rota", desc: "3 rota tamamladın.", icon: "✅", tier: "normal", order: 20 },
        [exports.BADGES.ROUTES_10]: { name: "10 Rota", desc: "10 rota tamamladın.", icon: "💪", tier: "normal", order: 30 },
        [exports.BADGES.DIST_100]: { name: "100 km", desc: "Toplam 100 km katettin.", icon: "🛣️", tier: "normal", order: 40 },
        [exports.BADGES.DIST_500]: { name: "500 km", desc: "Toplam 500 km katettin.", icon: "🚀", tier: "rare", order: 50 },
        [exports.BADGES.CITY_5]: { name: "Şehir Kaşifi", desc: "5 farklı şehir.", icon: "🧭", tier: "normal", order: 60 },
        [exports.BADGES.COUNTRY_3]: { name: "Ülke Kaşifi", desc: "3 farklı ülke.", icon: "🌍", tier: "rare", order: 70 },
        [exports.BADGES.MARATHON_20K]: { name: "Maraton", desc: "Tek rotada 20 km+.", icon: "🏃‍♂️", tier: "rare", order: 80 },
        [exports.BADGES.STOPS_5]: { name: "Durak Ustası", desc: "Bir rotada 5+ durak.", icon: "📍", tier: "normal", order: 90 },
        [exports.BADGES.FIVE_STAR_ROUTE]: { name: "Beş Yıldızlı", desc: "Bir rotan 4.5★ / 20+ oy.", icon: "🌟", tier: "rare", order: 100 },
    };
    const batch = db.batch();
    Object.entries(cats).forEach(([id, v]) => {
        batch.set(db.collection("badge_catalog").doc(id), v, { merge: true });
    });
    await batch.commit();
}
// ---------- stats update on finish ----------
async function applyRouteFinishedStats(routeId, route) {
    const { ownerId, totalDistanceM = 0 } = route;
    if (!ownerId)
        return;
    await db.runTransaction(async (tx) => {
        const sRef = userStatsRef(ownerId);
        const sSnap = await tx.get(sRef);
        const curr = (sSnap.exists ? sSnap.data() : {
            routesFinished: 0, distanceSumM: 0, cities: {}, countries: {}
        });
        const next = {
            routesFinished: (curr.routesFinished || 0) + 1,
            distanceSumM: (curr.distanceSumM || 0) + Math.max(0, Math.floor(totalDistanceM)),
            cities: { ...(curr.cities || {}) },
            countries: { ...(curr.countries || {}) },
            lastUpdatedAt: firestore_1.Timestamp.now(),
        };
        const city = route.areas?.city?.trim();
        const countryCode = route.areas?.countryCode?.trim();
        if (city)
            next.cities[city] = true;
        if (countryCode)
            next.countries[countryCode] = true;
        tx.set(sRef, next, { merge: true });
    });
    // Maraton & Durak Ustası
    if ((route.totalDistanceM || 0) >= 20000) {
        await awardBadgeIfNotExists(ownerId, exports.BADGES.MARATHON_20K, routeId);
    }
    // stops sayımı
    try {
        const agg = await routeStopsCol(routeId).count().get();
        if ((agg.data().count || 0) >= 5) {
            await awardBadgeIfNotExists(ownerId, exports.BADGES.STOPS_5, routeId);
        }
    }
    catch { /* eski SDK/plan desteklemiyorsa atla */ }
    // kümülatif rozetler (stats okuyup karar ver)
    const s = (await userStatsRef(ownerId).get()).data();
    const routesFinished = s?.routesFinished || 0;
    const dist = s?.distanceSumM || 0;
    const citiesCount = Object.keys(s?.cities || {}).length;
    const countriesCount = Object.keys(s?.countries || {}).length;
    if (routesFinished >= 1)
        await awardBadgeIfNotExists(ownerId, exports.BADGES.FIRST_ROUTE, routeId);
    if (routesFinished >= 3)
        await awardBadgeIfNotExists(ownerId, exports.BADGES.ROUTES_3, routeId);
    if (routesFinished >= 10)
        await awardBadgeIfNotExists(ownerId, exports.BADGES.ROUTES_10, routeId);
    if (dist >= 100000)
        await awardBadgeIfNotExists(ownerId, exports.BADGES.DIST_100, routeId);
    if (dist >= 500000)
        await awardBadgeIfNotExists(ownerId, exports.BADGES.DIST_500, routeId);
    if (citiesCount >= 5)
        await awardBadgeIfNotExists(ownerId, exports.BADGES.CITY_5, routeId);
    if (countriesCount >= 3)
        await awardBadgeIfNotExists(ownerId, exports.BADGES.COUNTRY_3, routeId);
}
// ---------- five_star on rating update ----------
async function checkFiveStarBadge(routeId, route) {
    const { ownerId, ratingCount = 0 } = route;
    if (!ownerId)
        return;
    const avg = (typeof route.ratingSum === "number" && ratingCount > 0)
        ? route.ratingSum / ratingCount
        : route.ratingAvg ?? 0;
    if (ratingCount >= 20 && avg >= 4.5) {
        await awardBadgeIfNotExists(ownerId, exports.BADGES.FIVE_STAR_ROUTE, routeId);
    }
}
// ---------- backfill (admin) ----------
async function backfillUserStatsAndBadges() {
    let processed = 0;
    const routesSnap = await db.collection("routes").where("status", "==", "finished").get();
    for (const r of routesSnap.docs) {
        processed++;
        const data = r.data();
        await applyRouteFinishedStats(r.id, data);
        await checkFiveStarBadge(r.id, data);
    }
    return { processed };
}
