"use strict";
// functions/src/ratings.ts
// Server-side rating aggregation for routes & stops (V2 Firestore Triggers)
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
exports.onStopRatingWrite = exports.onRouteRatingWrite = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const badges_1 = require("./badges");
const db = admin.firestore();
/**
 * Helper: derive delta for sum/count based on before/after rating values.
 */
function getDelta(beforeVal, afterVal) {
    let deltaSum = 0;
    let deltaCount = 0;
    const hasBefore = typeof beforeVal === "number";
    const hasAfter = typeof afterVal === "number";
    if (!hasBefore && hasAfter) {
        // create
        deltaSum = afterVal;
        deltaCount = 1;
    }
    else if (hasBefore && hasAfter) {
        // update
        deltaSum = afterVal - beforeVal;
        deltaCount = 0;
    }
    else if (hasBefore && !hasAfter) {
        // delete (should not happen via rules; guard)
        deltaSum = -beforeVal;
        deltaCount = -1;
    }
    return { deltaSum, deltaCount };
}
/**
 * ROUTE ratings aggregation
 * path: route_ratings/{rid_uid}
 * doc fields: { routeId, userId, value(1..5), updatedAt }
 */
exports.onRouteRatingWrite = (0, firestore_2.onDocumentWritten)("route_ratings/{rid_uid}", async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    // No-op if hard delete w/o any context
    const routeId = (after?.routeId || before?.routeId);
    if (!routeId)
        return;
    const { deltaSum, deltaCount } = getDelta(before?.value ?? null, after?.value ?? null);
    if (deltaSum === 0 && deltaCount === 0)
        return; // nothing to do
    const routeRef = db.collection("routes").doc(routeId);
    // Atomically update aggregates
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(routeRef);
        if (!snap.exists)
            return;
        const route = snap.data();
        const prevSum = Number(route?.ratingSum || 0);
        const prevCount = Number(route?.ratingCount || 0);
        const nextSum = prevSum + deltaSum;
        const nextCount = prevCount + deltaCount;
        const nextAvg = nextCount > 0 ? nextSum / nextCount : 0;
        tx.update(routeRef, {
            ratingSum: nextSum,
            ratingCount: nextCount,
            ratingAvg: nextAvg,
            ratingUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    // Five-star badge check (needs ownerId & current aggregates)
    const afterSnap = await routeRef.get();
    if (afterSnap.exists) {
        await (0, badges_1.checkFiveStarBadge)(routeId, afterSnap.data());
    }
});
/**
 * STOP ratings aggregation
 * path: stop_ratings/{sid_uid}
 * doc fields: { stopId, routeId, userId, value(1..5), updatedAt }
 */
exports.onStopRatingWrite = (0, firestore_2.onDocumentWritten)("stop_ratings/{sid_uid}", async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const routeId = (after?.routeId || before?.routeId);
    const stopId = (after?.stopId || before?.stopId);
    if (!routeId || !stopId)
        return;
    const { deltaSum, deltaCount } = getDelta(before?.value ?? null, after?.value ?? null);
    if (deltaSum === 0 && deltaCount === 0)
        return;
    const stopRef = db.collection("routes").doc(routeId).collection("stops").doc(stopId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(stopRef);
        if (!snap.exists)
            return;
        const stop = snap.data();
        const prevSum = Number(stop?.ratingSum || 0);
        const prevCount = Number(stop?.ratingCount || 0);
        const nextSum = prevSum + deltaSum;
        const nextCount = prevCount + deltaCount;
        const nextAvg = nextCount > 0 ? nextSum / nextCount : 0;
        tx.update(stopRef, {
            ratingSum: nextSum,
            ratingCount: nextCount,
            ratingAvg: nextAvg,
            ratingUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    // Not calling five-star here; route-level badge depends on route ratings.
});
