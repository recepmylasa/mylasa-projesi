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
exports.claimRouteDrop = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const REGION = "europe-west3";
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
/**
 * Route Drops (EMİR 06/07)
 * - Idempotent: users/{uid}/routeDrops/{routeId} varsa tekrar verme
 * - Route doğrulama: routes/{routeId} yoksa NOT_FOUND
 * - Ödül: users/{uid}.boxesEarned increment(1)
 * - Log: users/{uid}/drops altına type:"route_drop_claimed"
 */
exports.claimRouteDrop = functions
    .region(REGION)
    .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const routeId = String(data?.routeId || "").trim();
    if (!routeId)
        throw new functions.https.HttpsError("invalid-argument", "routeId required");
    if (routeId.includes("/"))
        throw new functions.https.HttpsError("invalid-argument", "Invalid routeId");
    if (routeId.length > 200)
        throw new functions.https.HttpsError("invalid-argument", "routeId too long");
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
        const routeData = (routeSnap.data() || {});
        const ownerId = typeof routeData.ownerId === "string" ? String(routeData.ownerId) : null;
        const now = admin.firestore.FieldValue.serverTimestamp();
        tx.set(dropRef, {
            routeId,
            type: "route_drop",
            ownerId,
            claimedAt: now,
        }, { merge: true });
        tx.set(userRef, {
            boxesEarned: admin.firestore.FieldValue.increment(1),
            updatedAt: now,
        }, { merge: true });
        tx.set(userRef.collection("drops").doc(), {
            type: "route_drop_claimed",
            routeId,
            createdAt: now,
        }, { merge: true });
        return { ok: true, alreadyClaimed: false };
    });
    return res;
});
