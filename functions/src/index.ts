// Node 20 / TS (firebase-functions v4 - v1 API)
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { reverseGeocode } from "./geo";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/* =========================
   Adım 11 — Areas (reverse geocode)
   ========================= */
type Areas = {
  city?: string;
  admin1?: string;
  country?: string;
  countryCode?: string;
};

const SLOW_THROTTLE_MS = 350;

const isDone = (x: any) =>
  (x?.areasStatus || "").toString() === "done";
const isFinished = (x: any) =>
  (x?.status || "").toString() === "finished";

function asPoint(p: any): { lat: number; lng: number } | null {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) {
    const [lat, lng] = p;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  if (typeof p === "object") {
    const lat = (p as any).lat ?? (p as any).latitude;
    const lng =
      (p as any).lng ??
      (p as any).longitude ??
      (p as any).lon;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  return null;
}

function sample3FromPath(
  path: any[]
): Array<{ lat: number; lng: number }> {
  const pts: Array<{ lat: number; lng: number }> = [];
  if (!Array.isArray(path) || path.length === 0) return pts;
  const first = asPoint(path[0]);
  const mid = asPoint(path[Math.floor(path.length / 2)]);
  const last = asPoint(path[path.length - 1]);
  if (first) pts.push(first);
  if (
    mid &&
    (pts.length === 0 ||
      mid.lat !== pts[0].lat ||
      mid.lng !== pts[0].lng)
  )
    pts.push(mid);
  if (
    last &&
    (pts.length === 0 ||
      last.lat !== pts[pts.length - 1].lat ||
      last.lng !== pts[pts.length - 1].lng)
  )
    pts.push(last);
  return pts;
}

function centroidOfStops(stops: any[]): {
  lat: number;
  lng: number;
} | null {
  if (!Array.isArray(stops) || stops.length === 0) return null;
  let sx = 0,
    sy = 0,
    n = 0;
  for (const s of stops) {
    const p = asPoint((s as any)?.location || s);
    if (p) {
      sx += p.lat;
      sy += p.lng;
      n++;
    }
  }
  if (!n) return null;
  return { lat: sx / n, lng: sy / n };
}

function majority<T extends string | undefined>(
  vals: T[]
): T | undefined {
  const c = new Map<string, number>();
  for (const v of vals) {
    if (v) c.set(v, (c.get(v) || 0) + 1);
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [k, n] of c) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best as T | undefined;
}

async function geocodeForRoute(data: any): Promise<Areas> {
  let points: Array<{ lat: number; lng: number }> = [];
  if (Array.isArray(data?.path)) {
    points = sample3FromPath(data.path);
  }
  if (points.length === 0 && Array.isArray(data?.stops)) {
    const c = centroidOfStops(data.stops);
    if (c) points = [c];
  }
  if (points.length === 0) {
    const a = asPoint(data?.start) || asPoint(data?.from);
    const b = asPoint(data?.end) || asPoint(data?.to);
    if (a) points.push(a);
    if (
      b &&
      (points.length === 0 ||
        b.lat !== points[0].lat ||
        b.lng !== points[0].lng)
    )
      points.push(b);
  }
  if (points.length === 0) return {};

  const results: Areas[] = [];
  for (const p of points) {
    await new Promise((r) => setTimeout(r, 80));
    const r = await reverseGeocode(p.lat, p.lng);
    results.push(r);
  }

  const city =
    majority(results.map((x) => x.city)) || results[0]?.city;
  const admin1 =
    majority(results.map((x) => x.admin1)) || results[0]?.admin1;
  const country =
    majority(results.map((x) => x.country)) ||
    results[0]?.country;
  const countryCode =
    majority(results.map((x) => x.countryCode)) ||
    results[0]?.countryCode;

  return { city, admin1, country, countryCode };
}

export const onRouteAreasFinish = functions
  .runWith({
    secrets: ["GEOCODING_API_KEY", "GEOCODING_PROVIDER"],
  })
  .firestore.document("routes/{routeId}")
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    if (!isFinished(after) || isDone(after) || isDone(before))
      return;

    if (
      after?.areas &&
      (after.areas.city || after.areas.countryCode)
    ) {
      await change.after.ref.set(
        { areasStatus: "done" },
        { merge: true }
      );
      return;
    }

    try {
      const areas = await geocodeForRoute(after);
      if (!areas.city && !areas.countryCode) {
        await change.after.ref.set(
          {
            areasStatus: "error",
            areasErrorCode: "NO_RESULT",
          },
          { merge: true }
        );
        return;
      }
      await change.after.ref.set(
        {
          areas,
          areasStatus: "done",
          areasErrorCode: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
    } catch (e: any) {
      await change.after.ref.set(
        {
          areasStatus: "error",
          areasErrorCode: String(e?.message || e || "ERR"),
        },
        { merge: true }
      );
    }
  });

export const backfillAreasCallable = functions
  .runWith({
    secrets: ["GEOCODING_API_KEY", "GEOCODING_PROVIDER"],
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Auth required."
      );
    }

    const pageSize = Math.min(
      Number(data?.pageSize || 40),
      100
    );
    let scanned = 0,
      updated = 0,
      errors = 0;
    let last:
      | FirebaseFirestore.QueryDocumentSnapshot
      | undefined;

    for (let page = 0; page < 5; page++) {
      let q = db
        .collection("routes")
        .where("status", "==", "finished")
        .limit(pageSize);
      if (last) q = q.startAfter(last);

      const snap = await q.get();
      if (snap.empty) break;

      for (const docSnap of snap.docs) {
        scanned++;
        last = docSnap;
        const d = docSnap.data() || {};
        if (isDone(d)) continue;

        if (
          d?.areas &&
          (d.areas.city || d.areas.countryCode)
        ) {
          await docSnap.ref.set(
            { areasStatus: "done" },
            { merge: true }
          );
          continue;
        }

        try {
          const areas = await geocodeForRoute(d);
          if (!areas.city && !areas.countryCode) {
            await docSnap.ref.set(
              {
                areasStatus: "error",
                areasErrorCode: "NO_RESULT",
              },
              { merge: true }
            );
          } else {
            await docSnap.ref.set(
              {
                areas,
                areasStatus: "done",
                areasErrorCode:
                  admin.firestore.FieldValue.delete(),
              },
              { merge: true }
            );
            updated++;
          }
        } catch {
          errors++;
          await docSnap.ref.set(
            {
              areasStatus: "error",
              areasErrorCode: "EXC",
            },
            { merge: true }
          );
        }

        await new Promise((r) =>
          setTimeout(r, SLOW_THROTTLE_MS)
        );
      }

      if (snap.size < pageSize) break;
    }

    return { scanned, updated, errors };
  });

/* =========================
   Followers counters
   ========================= */

async function adjustCounts(
  targetUid: string,
  followerUid: string,
  delta: 1 | -1
) {
  if (!targetUid || !followerUid || targetUid === followerUid)
    return;

  const targetRef = db.collection("users").doc(String(targetUid));
  const followerRef = db
    .collection("users")
    .doc(String(followerUid));

  await db.runTransaction(async (t) => {
    t.set(
      targetRef,
      {
        followersCount:
          admin.firestore.FieldValue.increment(delta),
      },
      { merge: true }
    );
    t.set(
      followerRef,
      {
        followingCount:
          admin.firestore.FieldValue.increment(delta),
      },
      { merge: true }
    );
  });
}

export const onFollowersCreate = functions.firestore
  .document("users/{targetUid}/followers/{followerUid}")
  .onCreate(async (_snap, ctx) => {
    const { targetUid, followerUid } =
      ctx.params as any;
    await adjustCounts(targetUid, followerUid, 1);
  });

export const onFollowersDelete = functions.firestore
  .document("users/{targetUid}/followers/{followerUid}")
  .onDelete(async (_snap, ctx) => {
    const { targetUid, followerUid } =
      ctx.params as any;
    await adjustCounts(targetUid, followerUid, -1);
  });

export const onFollowsCreate = functions.firestore
  .document("follows/{pairId}")
  .onCreate(async (snap, ctx) => {
    const d = snap.data() || {};
    let follower = d.followerId as
      | string
      | undefined;
    let followee = d.followeeId as
      | string
      | undefined;

    if (!follower || !followee) {
      const pair = String((ctx.params as any).pairId || "");
      const [a, b] = pair.split("_");
      if (!follower) follower = a;
      if (!followee) followee = b;
    }

    if (follower && followee) {
      await adjustCounts(followee, follower, 1);
    }
  });

export const onFollowsDelete = functions.firestore
  .document("follows/{pairId}")
  .onDelete(async (snap, ctx) => {
    const d = snap.data() || {};
    let follower = d.followerId as
      | string
      | undefined;
    let followee = d.followeeId as
      | string
      | undefined;

    if (!follower || !followee) {
      const pair = String((ctx.params as any).pairId || "");
      const [a, b] = pair.split("_");
      if (!follower) follower = a;
      if (!followee) followee = b;
    }

    if (follower && followee) {
      await adjustCounts(followee, follower, -1);
    }
  });

/* === Modül exportları === */
export { renderRouteShare } from "./share";
export { routeOgImage } from "./og";
export {
  onRouteGeoFinish,
  backfillGeoCallable,
} from "./geoindex";
export {
  logShareEvent,
  aggregateShareMetricsDaily,
} from "./telemetry";
