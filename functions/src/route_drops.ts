import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const REGION = "europe-west3";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/**
 * Route Drops (EMİR 06/07)
 * - Idempotent: users/{uid}/routeDrops/{routeId} varsa tekrar verme
 * - Route doğrulama: routes/{routeId} yoksa NOT_FOUND
 * - Ödül: users/{uid}.boxesEarned increment(1)
 * - Log: users/{uid}/drops altına type:"route_drop_claimed"
 */
export const claimRouteDrop = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }

    const routeId = String((data as any)?.routeId || "").trim();

    if (!routeId) throw new functions.https.HttpsError("invalid-argument", "routeId required");
    if (routeId.includes("/")) throw new functions.https.HttpsError("invalid-argument", "Invalid routeId");
    if (routeId.length > 200) throw new functions.https.HttpsError("invalid-argument", "routeId too long");

    const userRef = db.collection("users").doc(uid);
    const dropRef = userRef.collection("routeDrops").doc(routeId);
    const routeRef = db.collection("routes").doc(routeId);

    const res = await db.runTransaction(async (tx) => {
      // Route var mı?
      const routeSnap = await tx.get(routeRef);
      if (!routeSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Route not found");
      }

      // Idempotent lock
      const already = await tx.get(dropRef);
      if (already.exists) {
        return { ok: true, alreadyClaimed: true };
      }

      const routeData = (routeSnap.data() || {}) as any;
      const ownerId = typeof routeData.ownerId === "string" ? String(routeData.ownerId) : null;
      const now = admin.firestore.FieldValue.serverTimestamp();

      tx.set(
        dropRef,
        {
          routeId,
          type: "route_drop",
          ownerId,
          claimedAt: now,
        },
        { merge: true }
      );

      tx.set(
        userRef,
        {
          boxesEarned: admin.firestore.FieldValue.increment(1),
          updatedAt: now,
        },
        { merge: true }
      );

      tx.set(
        userRef.collection("drops").doc(),
        {
          type: "route_drop_claimed",
          routeId,
          createdAt: now,
        },
        { merge: true }
      );

      return { ok: true, alreadyClaimed: false };
    });

    return res;
  });
