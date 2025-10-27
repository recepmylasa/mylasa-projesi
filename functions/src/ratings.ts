// functions/src/ratings.ts
// Server-side rating aggregation for routes & stops (V2 Firestore Triggers)

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { checkFiveStarBadge, RouteDoc } from "./badges";

const db = admin.firestore();

/**
 * Helper: derive delta for sum/count based on before/after rating values.
 */
function getDelta(beforeVal?: number | null, afterVal?: number | null) {
  let deltaSum = 0;
  let deltaCount = 0;

  const hasBefore = typeof beforeVal === "number";
  const hasAfter = typeof afterVal === "number";

  if (!hasBefore && hasAfter) {
    // create
    deltaSum = afterVal!;
    deltaCount = 1;
  } else if (hasBefore && hasAfter) {
    // update
    deltaSum = (afterVal as number) - (beforeVal as number);
    deltaCount = 0;
  } else if (hasBefore && !hasAfter) {
    // delete (should not happen via rules; guard)
    deltaSum = -(beforeVal as number);
    deltaCount = -1;
  }

  return { deltaSum, deltaCount };
}

/**
 * ROUTE ratings aggregation
 * path: route_ratings/{rid_uid}
 * doc fields: { routeId, userId, value(1..5), updatedAt }
 */
export const onRouteRatingWrite = onDocumentWritten(
  "route_ratings/{rid_uid}",
  async (event) => {
    const before = event.data?.before?.data() as
      | { routeId?: string; value?: number }
      | undefined;
    const after = event.data?.after?.data() as
      | { routeId?: string; value?: number }
      | undefined;

    // No-op if hard delete w/o any context
    const routeId = (after?.routeId || before?.routeId) as string | undefined;
    if (!routeId) return;

    const { deltaSum, deltaCount } = getDelta(before?.value ?? null, after?.value ?? null);
    if (deltaSum === 0 && deltaCount === 0) return; // nothing to do

    const routeRef = db.collection("routes").doc(routeId);

    // Atomically update aggregates
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(routeRef);
      if (!snap.exists) return;

      const route = snap.data() as RouteDoc | undefined;
      const prevSum = Number((route as any)?.ratingSum || 0);
      const prevCount = Number((route as any)?.ratingCount || 0);

      const nextSum = prevSum + deltaSum;
      const nextCount = prevCount + deltaCount;
      const nextAvg = nextCount > 0 ? nextSum / nextCount : 0;

      tx.update(routeRef, {
        ratingSum: nextSum,
        ratingCount: nextCount,
        ratingAvg: nextAvg,
        ratingUpdatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Five-star badge check (needs ownerId & current aggregates)
    const afterSnap = await routeRef.get();
    if (afterSnap.exists) {
      await checkFiveStarBadge(routeId, afterSnap.data() as RouteDoc);
    }
  }
);

/**
 * STOP ratings aggregation
 * path: stop_ratings/{sid_uid}
 * doc fields: { stopId, routeId, userId, value(1..5), updatedAt }
 */
export const onStopRatingWrite = onDocumentWritten(
  "stop_ratings/{sid_uid}",
  async (event) => {
    const before = event.data?.before?.data() as
      | { routeId?: string; stopId?: string; value?: number }
      | undefined;
    const after = event.data?.after?.data() as
      | { routeId?: string; stopId?: string; value?: number }
      | undefined;

    const routeId = (after?.routeId || before?.routeId) as string | undefined;
    const stopId = (after?.stopId || before?.stopId) as string | undefined;
    if (!routeId || !stopId) return;

    const { deltaSum, deltaCount } = getDelta(before?.value ?? null, after?.value ?? null);
    if (deltaSum === 0 && deltaCount === 0) return;

    const stopRef = db.collection("routes").doc(routeId).collection("stops").doc(stopId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(stopRef);
      if (!snap.exists) return;

      const stop = snap.data() as any;
      const prevSum = Number(stop?.ratingSum || 0);
      const prevCount = Number(stop?.ratingCount || 0);

      const nextSum = prevSum + deltaSum;
      const nextCount = prevCount + deltaCount;
      const nextAvg = nextCount > 0 ? nextSum / nextCount : 0;

      tx.update(stopRef, {
        ratingSum: nextSum,
        ratingCount: nextCount,
        ratingAvg: nextAvg,
        ratingUpdatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Not calling five-star here; route-level badge depends on route ratings.
  }
);
