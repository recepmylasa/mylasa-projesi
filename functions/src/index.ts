// functions/src/index.ts
import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";
import { onDocumentWritten, onDocumentUpdated } from "firebase-functions/v2/firestore";
import {
  applyRouteFinishedStats,
  checkFiveStarBadge,
  seedBadgeCatalog,
  backfillUserStatsAndBadges,
  RouteDoc,
} from "./badges";
import { onRouteRatingWrite, onStopRatingWrite } from "./ratings";

admin.initializeApp();

// ------ Firestore Triggers ------

// routes: finish'e geçişte istatistik + rozetler
export const onRouteWrite = onDocumentWritten("routes/{routeId}", async (event) => {
  const before = event.data?.before?.data() as RouteDoc | undefined;
  const after = event.data?.after?.data() as RouteDoc | undefined;
  const routeId = event.params.routeId as string;

  if (!after) return; // delete

  // finish geçişi
  const wasFinished = before?.status === "finished";
  const isFinished = after.status === "finished";
  if (!wasFinished && isFinished) {
    await applyRouteFinishedStats(routeId, after);
  }
});

// routes: rating güncellemeleri -> five_star_route
export const onRouteUpdate = onDocumentUpdated("routes/{routeId}", async (event) => {
  const after = event.data?.after?.data() as RouteDoc | undefined;
  const routeId = event.params.routeId as string;
  if (!after) return;
  await checkFiveStarBadge(routeId, after);
});

// ratings (server-side aggregation)
export { onRouteRatingWrite, onStopRatingWrite };

// follows: sayaçlar (followersCount / followingCount)
export const onFollowWrite = onDocumentWritten("follows/{pairId}", async (event) => {
  const beforeExists = !!event.data?.before.exists;
  const afterExists = !!event.data?.after.exists;

  // Sadece create/delete (update zaten rules ile engelli)
  if (beforeExists && afterExists) return;

  const snapData = (afterExists
    ? event.data!.after!.data()
    : event.data!.before!.data()) as { followerId?: string; followeeId?: string } | undefined;

  const followerId = String(snapData?.followerId || "").trim();
  const followeeId = String(snapData?.followeeId || "").trim();
  if (!followerId || !followeeId) return;

  const db = admin.firestore();
  const followerRef = db.collection("users").doc(followerId);
  const followeeRef = db.collection("users").doc(followeeId);

  const delta = afterExists && !beforeExists ? 1 : -1;

  await db.runTransaction(async (tx) => {
    const [followerSnap, followeeSnap] = await Promise.all([tx.get(followerRef), tx.get(followeeRef)]);
    const follower = followerSnap.exists ? followerSnap.data()! : {};
    const followee = followeeSnap.exists ? followeeSnap.data()! : {};

    const nextFollowing = Math.max(0, Number(follower.followingCount || 0) + delta);
    const nextFollowers = Math.max(0, Number(followee.followersCount || 0) + delta);

    tx.set(followerRef, { followingCount: nextFollowing }, { merge: true });
    tx.set(followeeRef, { followersCount: nextFollowers }, { merge: true });
  });
});

// ------ Callable Admin helpers (V2 onCall) ------
export const seedBadgeCatalogCallable = onCall(async () => {
  await seedBadgeCatalog();
  return { ok: true };
});

export const backfillBadgesCallable = onCall(async () => {
  const res = await backfillUserStatsAndBadges();
  return { ok: true, ...res };
});
