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
exports.backfillContentStubs = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
const REGION = "europe-west3";
const PRIOR_MEAN = 3.5;
exports.backfillContentStubs = (0, https_1.onCall)({ region: REGION, timeoutSeconds: 540 }, async (req) => {
    if (!req.auth?.uid)
        throw new https_1.HttpsError("unauthenticated", "Giriş yap.");
    const limitPerType = Number(req.data?.maxPerType || 1000);
    const defAgg = {
        count: 0,
        sum: 0,
        byStar: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        bayes: PRIOR_MEAN,
        weight: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };
    async function backfill(collName, type) {
        const snap = await db.collection(collName).limit(limitPerType).get();
        let n = 0;
        let batch = db.batch();
        for (const docSnap of snap.docs) {
            const id = docSnap.id;
            const data = docSnap.data() || {};
            const authorId = data.authorId || data.userId || data.uid;
            if (!authorId)
                continue;
            const contentRef = db.collection("content").doc(id);
            batch.set(contentRef, {
                authorId,
                type,
                createdAt: data.createdAt ||
                    data.tarih ||
                    admin.firestore.FieldValue.serverTimestamp(),
                agg: defAgg
            }, { merge: true });
            n++;
            if (n % 400 === 0) {
                await batch.commit();
                batch = db.batch();
            }
        }
        if (n % 400 !== 0)
            await batch.commit();
        return n;
    }
    const createdPosts = await backfill("posts", "post");
    const createdStories = await backfill("hikayeler", "story");
    const createdClips = await backfill("clips", "clip");
    return {
        ok: true,
        created: { posts: createdPosts, hikayeler: createdStories, clips: createdClips }
    };
});
