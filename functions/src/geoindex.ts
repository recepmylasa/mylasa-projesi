// Node 20 / TS
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { geohashForLocation } from "geofire-common";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/* ============ Tipler ============ */
export type LatLng = { lat: number; lng: number };
type RouteDoc = {
  status?: string;
  path?: any[];
  stops?: any[];
  routeGeo?: { center?: LatLng; geohash?: string };
  createdAt?: FirebaseFirestore.Timestamp | number | Date;
  ownerId?: string;
};

/* ============ Yardımcılar ============ */
function asPoint(p: any): LatLng | null {
  if (!p) return null;
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

function sample3FromPath(path: any[]): LatLng[] {
  const pts: LatLng[] = [];
  if (!Array.isArray(path) || path.length === 0) return pts;
  const first = asPoint(path[0]);
  const mid = asPoint(path[Math.floor(path.length / 2)]);
  const last = asPoint(path[path.length - 1]);
  if (first) pts.push(first);
  if (mid && (pts.length === 0 || mid.lat !== pts[0].lat || mid.lng !== pts[0].lng)) pts.push(mid);
  if (last && (pts.length === 0 || last.lat !== pts[pts.length - 1].lat || last.lng !== pts[pts.length - 1].lng)) pts.push(last);
  return pts;
}

function centroid(pts: LatLng[]): LatLng | null {
  if (!pts || pts.length === 0) return null;
  let sx = 0, sy = 0, n = 0;
  for (const p of pts) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      sx += p.lat; sy += p.lng; n++;
    }
  }
  if (!n) return null;
  return { lat: sx / n, lng: sy / n };
}

function centroidOfStops(stops: any[]): LatLng | null {
  if (!Array.isArray(stops) || stops.length === 0) return null;
  const pts: LatLng[] = [];
  for (const s of stops) {
    const p = asPoint(s?.location || s);
    if (p) pts.push(p);
  }
  return centroid(pts);
}

/* ============ Ana hesaplama ============ */
export async function computeRouteGeo(route: RouteDoc): Promise<{ center?: LatLng; geohash?: string }> {
  let center: LatLng | null = null;

  // 1) Path varsa öncelik path
  if (Array.isArray(route?.path) && route!.path!.length > 0) {
    center = centroid(sample3FromPath(route!.path!));
  }

  // 2) Yoksa stops
  if (!center && Array.isArray(route?.stops) && route!.stops!.length > 0) {
    center = centroidOfStops(route!.stops!);
  }

  // 3) Hiçbiri yoksa boş
  if (!center) return {};

  const geohash = geohashForLocation([center.lat, center.lng], 11);
  return { center, geohash };
}

/* ============ Trigger: route finished → geo index ============ */
export const onRouteGeoFinish = functions
  .region("us-central1")
  .firestore.document("routes/{routeId}")
  .onUpdate(async (change) => {
    const before = (change.before.data() || {}) as RouteDoc;
    const after = (change.after.data() || {}) as RouteDoc;

    // Sadece finished olduğunda; idempotent
    if (after.status !== "finished") return;
    if (after.routeGeo?.geohash && after.routeGeo?.center) return;

    const g = await computeRouteGeo(after);
    if (!g.center || !g.geohash) return;

    await change.after.ref.set({ routeGeo: g }, { merge: true });
  });

/* ============ Callable: backfill ============ */
export const backfillGeoCallable = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");

    const pageSize = Math.min(Number(data?.pageSize || 50), 200);
    let scanned = 0, updated = 0;
    let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;

    for (let page = 0; page < 10; page++) {
      let q = db.collection("routes")
        .where("status", "==", "finished")
        .orderBy("createdAt", "desc")
        .limit(pageSize);
      if (last) q = q.startAfter(last);

      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        scanned++;
        const d = doc.data() as RouteDoc;
        if (d?.routeGeo?.geohash && d?.routeGeo?.center) { last = doc; continue; }

        const g = await computeRouteGeo(d);
        if (g.center && g.geohash) {
          await doc.ref.set({ routeGeo: g }, { merge: true });
          updated++;
        }
        await new Promise((r) => setTimeout(r, 50));
        last = doc;
      }

      if (snap.size < pageSize) break;
    }

    return { scanned, updated };
  });
