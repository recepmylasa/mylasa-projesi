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
exports.recomputeUserReputation = exports.onRatingWrite = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
const REGION = "europe-west3";
const PRIOR_MEAN = 3.5; // μ
const PRIOR_STRENGTH = 100; // K
function bayes(sum, count) {
    return (PRIOR_STRENGTH * PRIOR_MEAN + sum) / (PRIOR_STRENGTH + count);
}
function weightOf(count) {
    return Math.log(1 + count);
}
exports.onRatingWrite = (0, firestore_1.onDocumentWritten)({ region: REGION, document: "content/{contentId}/ratings/{raterId}" }, async (event) => {
    const contentId = String(event.params?.contentId || "");
    const after = event.data?.after;
    const before = event.data?.before;
    const ratingAfter = after?.exists ? after.data() : null;
    const ratingBefore = before?.exists ? before.data() : null;
    const authorId = ratingAfter?.authorId || ratingBefore?.authorId;
    if (!contentId || !authorId)
        return;
    const ratingsSnap = await db
        .collection("content")
        .doc(contentId)
        .collection("ratings")
        .get();
    let count = 0;
    let sum = 0;
    const byStar = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    ratingsSnap.forEach((d) => {
        const v = Number(d.data()?.value || 0);
        if (v >= 1 && v <= 5) {
            count += 1;
            sum += v;
            byStar[String(v)] += 1;
        }
    });
    const bayesScore = bayes(sum, count);
    const weight = weightOf(count);
    await db.collection("content").doc(contentId).set({
        agg: {
            count,
            sum,
            byStar,
            bayes: bayesScore,
            weight,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }
    }, { merge: true });
    await recomputeUserReputationInternal(String(authorId));
});
async function recomputeUserReputationInternal(uid) {
    const snap = await db.collection("content").where("authorId", "==", uid).get();
    let weightedSum = 0;
    let totalWeight = 0;
    let sample = 0;
    snap.forEach((d) => {
        const a = d.data()?.agg || {};
        const c = Number(a.count || 0);
        const s = Number(a.sum || 0);
        const b = typeof a.bayes === "number" ? a.bayes : bayes(s, c);
        const w = typeof a.weight === "number" ? a.weight : weightOf(c);
        sample += c;
        if (w > 0) {
            weightedSum += b * w;
            totalWeight += w;
        }
    });
    const raw = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const visible = Math.floor(raw * 10) / 10;
    const progress = raw * 10 - Math.floor(raw * 10);
    const gold = visible >= 4.5 && sample >= 1000;
    await db.collection("users").doc(uid).set({
        reputation: {
            raw,
            visible,
            progress,
            sample,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        },
        badges: {
            gold,
            since: gold ? admin.firestore.FieldValue.serverTimestamp() : null
        }
    }, { merge: true });
    return { raw, visible, progress, sample, gold };
}
exports.recomputeUserReputation = (0, https_1.onCall)({ region: REGION }, async (req) => {
    if (!req.auth?.uid)
        throw new https_1.HttpsError("unauthenticated", "Giriş yap.");
    const uid = String(req.data?.uid || req.auth.uid);
    const res = await recomputeUserReputationInternal(uid);
    return { ok: true, ...res };
});
