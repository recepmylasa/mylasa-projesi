// functions/src/badges.ts
// Node 20 / TypeScript
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export type RouteDoc = {
  ownerId: string;
  status: "recording" | "finished" | "draft" | string;
  totalDistanceM?: number;
  durationMs?: number;
  areas?: { city?: string; admin1?: string; country?: string; countryCode?: string };
  ratingSum?: number;
  ratingCount?: number;
  path?: Array<{ lat: number; lng: number }>;
  title?: string;
};

export type UserStats = {
  routesFinished?: number;
  distanceSumM?: number;
  cities?: Record<string, boolean>;
  countries?: Record<string, boolean>;
  lastUpdatedAt?: FirebaseFirestore.Timestamp;
};

export type BadgeCatalog = {
  name: string;
  desc: string;
  icon: string;            // emoji veya asset yolu
  tier: "normal" | "rare";
  order: number;
  condition?: Record<string, unknown>;
};

const db = admin.firestore();

// ---- Badge IDs (MVP 10)
export const BADGES = {
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
} as const;
type BadgeId = (typeof BADGES)[keyof typeof BADGES];

// ---------- utilities ----------
function badgeDocRef(uid: string, badgeId: BadgeId) {
  return db.collection("users").doc(uid).collection("badges").doc(badgeId);
}
function userStatsRef(uid: string) {
  return db.collection("users").doc(uid).collection("stats").doc("aggregate");
}
function routeRef(routeId: string) {
  return db.collection("routes").doc(routeId);
}
function routeStopsCol(routeId: string) {
  return routeRef(routeId).collection("stops");
}

async function ensureStatsDoc(uid: string): Promise<UserStats> {
  const ref = userStatsRef(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const init: UserStats = {
      routesFinished: 0,
      distanceSumM: 0,
      cities: {},
      countries: {},
      lastUpdatedAt: Timestamp.now(),
    };
    await ref.set(init);
    return init;
  }
  return snap.data() as UserStats;
}

async function awardBadgeIfNotExists(
  uid: string,
  badgeId: BadgeId,
  sourceRouteId?: string
) {
  const bRef = badgeDocRef(uid, badgeId);
  const already = await bRef.get();
  if (already.exists) return false;

  // katalogtan kopya alanları oku (adı, tier vs.)
  const cat = await db.collection("badge_catalog").doc(badgeId).get();
  const payload = {
    earnedAt: FieldValue.serverTimestamp(),
    tier: (cat.data()?.tier as string) || "normal",
    name: (cat.data()?.name as string) || badgeId,
    sourceRouteId: sourceRouteId || null,
  };
  await bRef.set(payload, { merge: true });
  return true;
}

// ---------- seed ----------
export async function seedBadgeCatalog(): Promise<void> {
  const cats: Record<BadgeId, BadgeCatalog> = {
    [BADGES.FIRST_ROUTE]:   { name:"İlk Rota", desc:"İlk rotanı tamamladın.", icon:"🥇", tier:"normal", order:10 },
    [BADGES.ROUTES_3]:      { name:"3 Rota", desc:"3 rota tamamladın.", icon:"✅", tier:"normal", order:20 },
    [BADGES.ROUTES_10]:     { name:"10 Rota", desc:"10 rota tamamladın.", icon:"💪", tier:"normal", order:30 },
    [BADGES.DIST_100]:      { name:"100 km", desc:"Toplam 100 km katettin.", icon:"🛣️", tier:"normal", order:40 },
    [BADGES.DIST_500]:      { name:"500 km", desc:"Toplam 500 km katettin.", icon:"🚀", tier:"rare", order:50 },
    [BADGES.CITY_5]:        { name:"Şehir Kaşifi", desc:"5 farklı şehir.", icon:"🧭", tier:"normal", order:60 },
    [BADGES.COUNTRY_3]:     { name:"Ülke Kaşifi", desc:"3 farklı ülke.", icon:"🌍", tier:"rare", order:70 },
    [BADGES.MARATHON_20K]:  { name:"Maraton", desc:"Tek rotada 20 km+.", icon:"🏃‍♂️", tier:"rare", order:80 },
    [BADGES.STOPS_5]:       { name:"Durak Ustası", desc:"Bir rotada 5+ durak.", icon:"📍", tier:"normal", order:90 },
    [BADGES.FIVE_STAR_ROUTE]:{ name:"Beş Yıldızlı", desc:"Bir rotan 4.5★ / 20+ oy.", icon:"🌟", tier:"rare", order:100 },
  };
  const batch = db.batch();
  Object.entries(cats).forEach(([id, v]) => {
    batch.set(db.collection("badge_catalog").doc(id), v, { merge: true });
  });
  await batch.commit();
}

// ---------- stats update on finish ----------
export async function applyRouteFinishedStats(routeId: string, route: RouteDoc) {
  const { ownerId, totalDistanceM = 0 } = route;
  if (!ownerId) return;

  await db.runTransaction(async (tx) => {
    const sRef = userStatsRef(ownerId);
    const sSnap = await tx.get(sRef);
    const curr = (sSnap.exists ? (sSnap.data() as UserStats) : {
      routesFinished: 0, distanceSumM: 0, cities: {}, countries: {}
    }) as UserStats;

    const next: UserStats = {
      routesFinished: (curr.routesFinished || 0) + 1,
      distanceSumM: (curr.distanceSumM || 0) + Math.max(0, Math.floor(totalDistanceM)),
      cities: { ...(curr.cities || {}) },
      countries: { ...(curr.countries || {}) },
      lastUpdatedAt: Timestamp.now(),
    };

    const city = route.areas?.city?.trim();
    const countryCode = route.areas?.countryCode?.trim();
    if (city) next.cities![city] = true;
    if (countryCode) next.countries![countryCode] = true;

    tx.set(sRef, next, { merge: true });
  });

  // Maraton & Durak Ustası
  if ((route.totalDistanceM || 0) >= 20000) {
    await awardBadgeIfNotExists(ownerId, BADGES.MARATHON_20K, routeId);
  }
  // stops sayımı
  try {
    const agg = await routeStopsCol(routeId).count().get();
    if ((agg.data().count || 0) >= 5) {
      await awardBadgeIfNotExists(ownerId, BADGES.STOPS_5, routeId);
    }
  } catch { /* eski SDK/plan desteklemiyorsa atla */ }

  // kümülatif rozetler (stats okuyup karar ver)
  const s = (await userStatsRef(ownerId).get()).data() as UserStats | undefined;
  const routesFinished = s?.routesFinished || 0;
  const dist = s?.distanceSumM || 0;
  const citiesCount = Object.keys(s?.cities || {}).length;
  const countriesCount = Object.keys(s?.countries || {}).length;

  if (routesFinished >= 1)  await awardBadgeIfNotExists(ownerId, BADGES.FIRST_ROUTE, routeId);
  if (routesFinished >= 3)  await awardBadgeIfNotExists(ownerId, BADGES.ROUTES_3, routeId);
  if (routesFinished >= 10) await awardBadgeIfNotExists(ownerId, BADGES.ROUTES_10, routeId);

  if (dist >= 100_000) await awardBadgeIfNotExists(ownerId, BADGES.DIST_100, routeId);
  if (dist >= 500_000) await awardBadgeIfNotExists(ownerId, BADGES.DIST_500, routeId);

  if (citiesCount >= 5) await awardBadgeIfNotExists(ownerId, BADGES.CITY_5, routeId);
  if (countriesCount >= 3) await awardBadgeIfNotExists(ownerId, BADGES.COUNTRY_3, routeId);
}

// ---------- five_star on rating update ----------
export async function checkFiveStarBadge(routeId: string, route: RouteDoc) {
  const { ownerId, ratingCount = 0 } = route;
  if (!ownerId) return;
  const avg =
    (typeof route.ratingSum === "number" && ratingCount > 0)
      ? route.ratingSum / ratingCount
      : (route as any).ratingAvg ?? 0;

  if (ratingCount >= 20 && avg >= 4.5) {
    await awardBadgeIfNotExists(ownerId, BADGES.FIVE_STAR_ROUTE, routeId);
  }
}

// ---------- backfill (admin) ----------
export async function backfillUserStatsAndBadges(): Promise<{ processed: number }> {
  let processed = 0;
  const routesSnap = await db.collection("routes").where("status", "==", "finished").get();
  for (const r of routesSnap.docs) {
    processed++;
    const data = r.data() as RouteDoc;
    await applyRouteFinishedStats(r.id, data);
    await checkFiveStarBadge(r.id, data);
  }
  return { processed };
}
