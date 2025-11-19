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
exports.aggregateShareMetricsDaily = exports.logShareEvent = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
function detectPlatform(uaRaw) {
    if (!uaRaw)
        return "other";
    const ua = uaRaw.toLowerCase();
    if (ua.includes("android"))
        return "android";
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod"))
        return "ios";
    if (ua.includes("macintosh") || ua.includes("windows") || ua.includes("linux"))
        return "desktop";
    return "other";
}
exports.logShareEvent = functions
    .region("us-central1")
    .runWith({ secrets: ["TELEMETRY_SALT"] })
    .https.onRequest(async (req, res) => {
    // CORS + sendBeacon uyumlu
    const origin = req.headers.origin || "*";
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    try {
        const rawBody = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
        const evt = String(rawBody.evt || rawBody.event || "").slice(0, 64);
        if (!evt) {
            res.status(400).send("Missing evt");
            return;
        }
        const rawMode = (rawBody.mode || rawBody.open_mode || "").toString();
        const mode = rawMode ? String(rawMode).slice(0, 32) : null;
        const uaHeader = req.headers["user-agent"] || "";
        const uaBody = (rawBody.ua || "");
        const ua = (uaBody || uaHeader || "").slice(0, 512) || null;
        const tsMsRaw = Number(rawBody.ts || Date.now());
        const tsMs = Number.isFinite(tsMsRaw) ? tsMsRaw : Date.now();
        const ts = admin.firestore.Timestamp.fromMillis(tsMs);
        const rawRouteId = typeof rawBody.routeId === "string" ? rawBody.routeId : "";
        const salt = process.env.TELEMETRY_SALT || "";
        const routeIdHash = rawRouteId
            ? (0, crypto_1.createHash)("sha1").update(rawRouteId + ":" + salt).digest("hex")
            : null;
        const doc = {
            evt,
            mode,
            ua,
            routeIdHash,
            ts,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection("metrics_share_events").add(doc);
        // sendBeacon beklediği için body’siz hızlı dönüş
        res.status(204).send("");
    }
    catch (e) {
        console.error("logShareEvent error", e);
        // Telemetri kritik değil; sessiz düş
        res.status(204).send("");
    }
});
exports.aggregateShareMetricsDaily = functions
    .region("us-central1")
    .pubsub.schedule("10 0 * * *") // Her gece 00:10 Europe/Istanbul
    .timeZone("Europe/Istanbul")
    .onRun(async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const y = yesterday.getFullYear();
    const m = yesterday.getMonth(); // 0-based
    const d = yesterday.getDate();
    const start = new Date(y, m, d, 0, 0, 0, 0);
    const end = new Date(y, m, d + 1, 0, 0, 0, 0);
    const startTs = admin.firestore.Timestamp.fromDate(start);
    const endTs = admin.firestore.Timestamp.fromDate(end);
    const dayStr = [
        y.toString(),
        String(m + 1).padStart(2, "0"),
        String(d).padStart(2, "0"),
    ].join("-");
    const snap = await db
        .collection("metrics_share_events")
        .where("ts", ">=", startTs)
        .where("ts", "<", endTs)
        .get();
    let totalClicks = 0;
    const byMode = {};
    const byPlatform = {};
    const routeCounts = new Map();
    let firstTs = null;
    let lastTs = null;
    snap.forEach((docSnap) => {
        const data = docSnap.data();
        const evt = (data.evt || "").toString();
        const ts = data.ts;
        if (ts) {
            if (!firstTs || ts.toMillis() < firstTs.toMillis())
                firstTs = ts;
            if (!lastTs || ts.toMillis() > lastTs.toMillis())
                lastTs = ts;
        }
        if (evt === "share_open_click") {
            totalClicks++;
            const rawMode = (data.mode || "").toString();
            const normMode = rawMode === "spa-fallback" ? "spa" : rawMode || "unknown";
            byMode[normMode] = (byMode[normMode] || 0) + 1;
            const platform = detectPlatform(data.ua);
            byPlatform[platform] = (byPlatform[platform] || 0) + 1;
            const rh = data.routeIdHash;
            if (rh) {
                routeCounts.set(rh, (routeCounts.get(rh) || 0) + 1);
            }
        }
    });
    const routesTop = Array.from(routeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([routeHash, count]) => ({ routeHash, count }));
    const aggDoc = {
        date: dayStr,
        total_clicks: totalClicks,
        by_mode: byMode,
        by_platform: byPlatform,
        routes_top: routesTop,
        first_ts: firstTs || null,
        last_ts: lastTs || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection("metrics_share_agg").doc(dayStr).set(aggDoc, { merge: true });
    return null;
});
