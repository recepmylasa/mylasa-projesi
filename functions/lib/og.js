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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeOgImage = void 0;
// Node 20 / TS – OG PNG + vektör mini-harita
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const satori_1 = __importDefault(require("satori"));
const resvg_js_1 = require("@resvg/resvg-js");
const og_map_1 = require("./og.map");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
const WIDTH = 1200;
const HEIGHT = 630;
function fontData(name) {
    const p = name === "Inter-Bold"
        ? (0, path_1.join)(__dirname, "../assets/fonts/Inter-Bold.ttf")
        : (0, path_1.join)(__dirname, "../assets/fonts/Inter-Regular.ttf");
    if (!(0, fs_1.existsSync)(p))
        return undefined;
    return (0, fs_1.readFileSync)(p);
}
function toKm(m) {
    const mm = Number(m || 0);
    if (!mm)
        return "";
    return String(Math.round(mm / 100) / 10);
}
function formatDuration(ms) {
    const m = Math.round(Number(ms || 0) / 60000);
    if (!m)
        return "";
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h > 0 ? `${h} sa ${mm} dk` : `${mm} dk`;
}
function makeETag(s) {
    return `"${(0, crypto_1.createHash)("sha1").update(s).digest("hex")}"`;
}
function tsToMillis(t) {
    if (!t)
        return 0;
    if (typeof t === "number")
        return t;
    if (typeof t === "string")
        return Number(t) || 0;
    if (typeof t.toMillis === "function") {
        return Number(t.toMillis()) || 0;
    }
    if (t._seconds) {
        return Number(t._seconds) * 1000;
    }
    return 0;
}
function updatedMillis(d) {
    const base = Math.max(tsToMillis(d.updatedAt), tsToMillis(d.ratingUpdatedAt), tsToMillis(d.mediaUpdatedAt));
    const bump = d.areasStatus ? 17 : 0;
    return base + bump;
}
/* ---------- path/stops → LatLng[] helpers ---------- */
function asPoint(p) {
    if (!p)
        return null;
    if (Array.isArray(p) && p.length >= 2) {
        const [lat, lng] = p;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
        }
    }
    if (typeof p === "object") {
        const lat = p.lat ?? p.latitude;
        const lng = p.lng ?? p.longitude ?? p.lon;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
        }
    }
    return null;
}
function extractPathPoints(route) {
    const pts = [];
    if (Array.isArray(route.path)) {
        for (const item of route.path) {
            const p = asPoint(item);
            if (p)
                pts.push(p);
        }
    }
    if (pts.length === 0 && Array.isArray(route.stops)) {
        for (const s of route.stops) {
            const p = asPoint(s?.location || s);
            if (p)
                pts.push(p);
        }
    }
    return pts;
}
/* ---------- SVG render ---------- */
async function renderOgPng(view) {
    const FONT_BOLD = fontData("Inter-Bold");
    const FONT_REG = fontData("Inter-Regular");
    // Mini-harita paneli
    const MAP_W = 360;
    const MAP_H = 360;
    const MAP_PAD = Math.round(Math.min(MAP_W, MAP_H) * 0.08);
    let miniMapNode = null;
    if (!view.privateMode) {
        const pts = (view.miniMapPath || []).slice();
        if (pts.length >= 2) {
            const { points } = (0, og_map_1.projectPathToBox)(pts, {
                w: MAP_W,
                h: MAP_H,
                pad: MAP_PAD,
            });
            const pathD = points.length >= 2
                ? points
                    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
                    .join(" ")
                : "";
            miniMapNode = {
                type: "div",
                props: {
                    style: {
                        width: MAP_W,
                        height: MAP_H,
                        borderRadius: 12,
                        padding: 16,
                        background: "#0E0F13",
                        boxShadow: "0 16px 40px rgba(0,0,0,.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    },
                    children: {
                        type: "svg",
                        props: {
                            width: MAP_W - 32,
                            height: MAP_H - 32,
                            viewBox: `0 0 ${MAP_W} ${MAP_H}`,
                            style: { display: "block" },
                            children: [
                                {
                                    type: "rect",
                                    props: {
                                        x: 0,
                                        y: 0,
                                        width: MAP_W,
                                        height: MAP_H,
                                        fill: "#050711",
                                    },
                                },
                                pathD
                                    ? {
                                        type: "path",
                                        props: {
                                            d: pathD,
                                            stroke: "#6B5CFF",
                                            strokeWidth: 6,
                                            fill: "none",
                                            strokeLinecap: "round",
                                            strokeLinejoin: "round",
                                        },
                                    }
                                    : null,
                            ].filter(Boolean),
                        },
                    },
                },
            };
        }
        else {
            // Veri yok placeholder
            miniMapNode = {
                type: "div",
                props: {
                    style: {
                        width: MAP_W,
                        height: MAP_H,
                        borderRadius: 12,
                        padding: 16,
                        background: "#0E0F13",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#6b6f85",
                        fontSize: 22,
                    },
                    children: "Veri yok",
                },
            };
        }
    }
    const root = {
        type: "div",
        props: {
            style: {
                width: WIDTH,
                height: HEIGHT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg,#0b1020 0%,#1a1f33 50%,#2b2466 100%)",
                color: "#eef1f7",
                fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
            },
            children: {
                type: "div",
                props: {
                    style: {
                        width: WIDTH - 160,
                        height: HEIGHT - 160,
                        borderRadius: 32,
                        padding: 40,
                        background: "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))",
                        boxShadow: "0 20px 60px rgba(0,0,0,.35)",
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "stretch",
                        justifyContent: "space-between",
                        gap: 32,
                        position: "relative",
                    },
                    children: [
                        {
                            type: "div",
                            props: {
                                style: {
                                    flex: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "space-between",
                                    minWidth: 0,
                                },
                                children: [
                                    {
                                        type: "div",
                                        props: {
                                            style: {
                                                fontSize: 24,
                                                opacity: 0.9,
                                                marginBottom: 8,
                                            },
                                            children: view.privateMode
                                                ? "Gizli rota"
                                                : (view.place || "").slice(0, 70),
                                        },
                                    },
                                    {
                                        type: "div",
                                        props: {
                                            style: {
                                                fontSize: 56,
                                                fontWeight: 800,
                                                lineHeight: 1.1,
                                                letterSpacing: -0.5,
                                                marginBottom: 16,
                                                whiteSpace: "pre-wrap",
                                            },
                                            children: (view.title || "Rota").slice(0, 120),
                                        },
                                    },
                                    {
                                        type: "div",
                                        props: {
                                            style: {
                                                fontSize: 26,
                                                color: "#c9cde3",
                                            },
                                            children: [
                                                view.km ? `${view.km} km` : null,
                                                view.dur || null,
                                                view.ratingLabel || null,
                                            ]
                                                .filter(Boolean)
                                                .join(" • "),
                                        },
                                    },
                                    {
                                        type: "div",
                                        props: {
                                            style: {
                                                marginTop: 32,
                                                fontSize: 24,
                                                color: "#9ca3c4",
                                            },
                                            children: "mylasa.app",
                                        },
                                    },
                                ],
                            },
                        },
                        miniMapNode,
                    ].filter(Boolean),
                },
            },
        },
    };
    const svg = await satori_1.default(root, {
        width: WIDTH,
        height: HEIGHT,
        fonts: [
            FONT_BOLD
                ? { name: "Inter", data: FONT_BOLD, weight: 700 }
                : undefined,
            FONT_REG
                ? { name: "Inter", data: FONT_REG, weight: 400 }
                : undefined,
        ].filter(Boolean),
    });
    const resvg = new resvg_js_1.Resvg(svg, { background: "rgba(0,0,0,0)" });
    return resvg.render().asPng();
}
/* ---------- HTTP Cloud Function ---------- */
exports.routeOgImage = functions
    .region("us-central1")
    .https.onRequest(async (req, res) => {
    try {
        const bits = (req.path || "").split("/").filter(Boolean);
        const routeId = bits[bits.length - 1];
        if (!routeId) {
            const png = await renderOgPng({ title: "Bulunamadı", privateMode: false });
            res.status(404).setHeader("Content-Type", "image/png");
            res.send(Buffer.from(png));
            return;
        }
        const snap = await db.collection("routes").doc(routeId).get();
        if (!snap.exists) {
            const png = await renderOgPng({ title: "Bulunamadı", privateMode: false });
            res.status(404).setHeader("Content-Type", "image/png");
            res.send(Buffer.from(png));
            return;
        }
        const r = (snap.data() || {});
        const vis = String(r.visibility || "public");
        const isPrivate = vis !== "public";
        const etag = makeETag([
            routeId,
            updatedMillis(r),
            vis,
            r.title || "",
            r.ratingAvg || "",
            r.ratingCount || "",
            r.totalDistanceM || "",
            r.durationMs || "",
        ].join(":"));
        if (req.get("if-none-match") === etag) {
            res.status(304).end();
            return;
        }
        const km = toKm(r.totalDistanceM);
        const dur = formatDuration(r.durationMs);
        const ratingLabel = Number(r.ratingCount || 0) > 0
            ? `${Number(r.ratingAvg || 0).toFixed(1)}★ (${r.ratingCount})`
            : "";
        const pathPoints = !isPrivate ? extractPathPoints(r) : [];
        const png = await renderOgPng({
            title: isPrivate ? "Bu rota özeldir" : String(r.title || "Rota"),
            place: isPrivate || !r.areas
                ? undefined
                : [
                    r.areas.city,
                    r.areas.countryCode || r.areas.country,
                ]
                    .filter(Boolean)
                    .join(" — "),
            km,
            dur,
            ratingLabel,
            privateMode: isPrivate,
            miniMapPath: pathPoints,
        });
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
        res.setHeader("ETag", etag);
        res.status(200).send(Buffer.from(png));
    }
    catch (e) {
        functions.logger.error("[routeOgImage] error", e);
        const png = await renderOgPng({ title: "Hata", privateMode: false });
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=120");
        res.status(500).send(Buffer.from(png));
    }
});
