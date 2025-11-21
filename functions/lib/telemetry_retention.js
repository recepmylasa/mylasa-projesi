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
exports.exportShareAggCsv = exports.purgeOldShareEvents = void 0;
// Node 20 / TS
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
/**
 * Günlük çalışır, metrics_share_events içindeki 30 günden eski kayıtları siler.
 * Kaynak: metrics_share_events/{autoId}
 */
exports.purgeOldShareEvents = functions
    .region("us-central1")
    .pubsub.schedule("0 3 * * *") // her gün 03:00 UTC
    .timeZone("UTC")
    .onRun(async () => {
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(now - THIRTY_DAYS_MS);
    const cutoffTs = admin.firestore.Timestamp.fromDate(cutoffDate);
    const col = db.collection("metrics_share_events");
    let scanned = 0;
    let deleted = 0;
    // 500'lük batch'lerle eski kayıtları sil
    // ts alanı < cutoffTs olanlar
    while (true) {
        const snap = await col
            .where("ts", "<", cutoffTs)
            .orderBy("ts", "asc")
            .limit(500)
            .get();
        if (snap.empty)
            break;
        scanned += snap.size;
        const batch = db.batch();
        for (const doc of snap.docs) {
            batch.delete(doc.ref);
        }
        await batch.commit();
        deleted += snap.size;
        // Çok sık tetiklememek için minik bekleme
        await new Promise((r) => setTimeout(r, 50));
    }
    const kept = scanned - deleted;
    const result = { scanned, deleted, kept };
    console.log("purgeOldShareEvents result", result);
    return result;
});
/**
 * metrics_share_agg/daily/{YYYY-MM-DD} altındaki günlük özetlerden CSV üretir.
 * Sadece admin claim'li kullanıcı çağırabilir.
 *
 * Girdi: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } (her iki gün dahil)
 * Çıktı: { csvBase64: string }
 */
exports.exportShareAggCsv = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Kimlik doğrulaması gerekli.");
    }
    const claims = context.auth.token || {};
    if (!claims.admin) {
        throw new functions.https.HttpsError("permission-denied", "Sadece admin kullanıcılar erişebilir.");
    }
    const from = String(data?.from || "").trim();
    const to = String(data?.to || "").trim();
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(from) || !re.test(to) || from > to) {
        throw new functions.https.HttpsError("invalid-argument", "Geçersiz tarih aralığı.");
    }
    const fp = admin.firestore.FieldPath.documentId();
    const dailyCol = db.collection("metrics_share_agg/daily");
    const snap = await dailyCol
        .where(fp, ">=", from)
        .where(fp, "<=", to)
        .orderBy(fp, "asc")
        .get();
    const header = "date,total_clicks,mode_pwa,mode_intent,mode_spa,platform_android,platform_ios,platform_desktop,first_ts,last_ts";
    const rows = [header];
    snap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        const date = docSnap.id;
        const totalClicks = Number(d.total_clicks || 0);
        const byMode = d.by_mode || {};
        const modePwa = Number(byMode.pwa || 0);
        const modeIntent = Number(byMode.intent || 0);
        const modeSpa = Number(byMode.spa || 0);
        const byPlatform = d.by_platform || {};
        const platAndroid = Number(byPlatform.android || 0);
        const platIos = Number(byPlatform.ios || 0);
        const platDesktop = Number(byPlatform.desktop || 0);
        const firstTs = d.first_ts && d.first_ts.toDate
            ? d.first_ts.toDate().toISOString()
            : "";
        const lastTs = d.last_ts && d.last_ts.toDate
            ? d.last_ts.toDate().toISOString()
            : "";
        const csvRow = [
            date,
            totalClicks,
            modePwa,
            modeIntent,
            modeSpa,
            platAndroid,
            platIos,
            platDesktop,
            firstTs,
            lastTs,
        ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(",");
        rows.push(csvRow);
    });
    const csv = rows.join("\n");
    const csvBase64 = Buffer.from(csv, "utf8").toString("base64");
    return { csvBase64 };
});
