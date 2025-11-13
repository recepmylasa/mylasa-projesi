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
// functions/src/og.ts
// Node 20 / TS (firebase-functions v4 - v1 API)
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const satori_1 = __importDefault(require("satori"));
const resvg_js_1 = require("@resvg/resvg-js");
const og_map_1 = require("./og_map");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
// ---- Tuval boyutu
const WIDTH = 1200;
const HEIGHT = 630;
// ---- Mini-harita panel ölçüleri
const MAP_PANEL_W = 360;
const MAP_PANEL_H = 360; // istersen 400 yapabilirsin
const MAP_PAD = 16; // iç boşluk
const INNER_W = MAP_PANEL_W - MAP_PAD * 2;
const INNER_H = MAP_PANEL_H - MAP_PAD * 2;
// ---- Stil
const COLOR_BG_GRAD = "linear-gradient(135deg, #0b1020 0%, #1a1f33 50%, #2b2466 100%)";
const COLOR_CARD_BG = "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))";
const COLOR_INK = "#eef1f7";
const COLOR_MUTED = "#c9cde3";
const COLOR_MAP_BG = "#0E0F13";
const COLOR_POLY = "#6B5CFF";
// ---- Fontlar
function fontData(name) {
    const p = name === "Inter-Bold"
        ? (0, path_1.join)(__dirname, "../assets/fonts/Inter-Bold.ttf")
        : (0, path_1.join)(__dirname, "../assets/fonts/Inter-Regular.ttf");
    if (!(0, fs_1.existsSync)(p))
        return undefined;
    return (0, fs_1.readFileSync)(p);
}
// ---- Yardımcılar (metin/etiket)
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
function updatedMillis(d) {
    const u = d?.updatedAt?.toMillis?.() || Number(d?.updatedAt) || 0;
    const r = d?.ratingUpdatedAt?.toMillis?.() || Number(d?.ratingUpdatedAt) || 0;
    const m = d?.mediaUpdatedAt?.toMillis?.() || Number(d?.mediaUpdatedAt) || 0;
    // areasStatus string değişince de hash değişsin
    const a = String(d?.areasStatus || "");
    return Math.max(Number(u) || 0, Number(r) || 0, Number(m) || 0) + a.length;
}
// ---- Geometri çıkarımı
function asPoint(p) {
    if (!p)
        return null;
    if (Array.isArray(p) && p.length >= 2) {
        const [lat, lng] = p;
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    }
    if (typeof p === "object") {
        const lat = p.lat ?? p.latitude;
        const lng = p.lng ?? p.longitude ?? p.lon;
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    }
    return null;
}
function extractLatLngs(r) {
    const pts = [];
    if (Array.isArray(r.path) && r.path.length) {
        for (const it of r.path) {
            const p = asPoint(it);
            if (p)
                pts.push(p);
        }
    }
    if (!pts.length && Array.isArray(r.stops) && r.stops.length) {
        for (const s of r.stops) {
            const p = asPoint((s && s.location) || s);
            if (p)
                pts.push(p);
        }
    }
    if (!pts.length) {
        const a = asPoint(r.start) || asPoint(r.from);
        const b = asPoint(r.end) || asPoint(r.to);
        if (a)
            pts.push(a);
        if (b)
            pts.push(b);
    }
    // performans: 1000+ noktada basit örnekleme
    const MAX = 1200;
    if (pts.length > MAX) {
        const step = Math.ceil(pts.length / MAX);
        return pts.filter((_, i) => i % step === 0);
    }
    return pts;
}
// ---- Mini-harita SVG içerik üretimi (Satori ağacı)
function buildMiniMapNode(view) {
    // Panel
    const panel = {
        type: "div",
        props: {
            style: {
                position: "absolute",
                left: 40,
                top: 40,
                width: MAP_PANEL_W,
                height: MAP_PANEL_H,
                background: COLOR_MAP_BG,
                borderRadius: 12,
                padding: MAP_PAD,
                boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            },
            children: (() => {
                if (!view.allowGeometry) {
                    // gizli rota
                    return {
                        type: "div",
                        props: {
                            style: {
                                fontSize: 22,
                                color: "#9aa1b9",
                                opacity: 0.9,
                            },
                            children: "Gizli rota",
                        },
                    };
                }
                if (view.noData || !view.points || view.points.length < 2) {
                    return {
                        type: "div",
                        props: {
                            style: { fontSize: 20, color: "#9aa1b9", opacity: 0.9 },
                            children: "Veri yok",
                        },
                    };
                }
                // SVG path
                const d = [
                    `M ${view.points[0][0].toFixed(1)} ${view.points[0][1].toFixed(1)}`,
                    ...view.points.slice(1).map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`),
                ].join(" ");
                return {
                    type: "svg",
                    props: {
                        width: INNER_W,
                        height: INNER_H,
                        viewBox: `0 0 ${INNER_W} ${INNER_H}`,
                        children: [
                            // gölge
                            {
                                type: "path",
                                props: {
                                    d,
                                    fill: "none",
                                    stroke: "#000",
                                    strokeOpacity: 0.24,
                                    strokeWidth: Math.max(1, view.strokeW + 4),
                                    strokeLinecap: "round",
                                    strokeLinejoin: "round",
                                },
                            },
                            // ana çizgi
                            {
                                type: "path",
                                props: {
                                    d,
                                    fill: "none",
                                    stroke: COLOR_POLY,
                                    strokeOpacity: view.strokeOpacity,
                                    strokeWidth: view.strokeW,
                                    strokeLinecap: "round",
                                    strokeLinejoin: "round",
                                },
                            },
                        ],
                    },
                };
            })(),
        },
    };
    return panel;
}
// ---- OG PNG render
async function renderOgPng(view) {
    const FONT_BOLD = fontData("Inter-Bold");
    const FONT_REG = fontData("Inter-Regular");
    const root = {
        type: "div",
        props: {
            style: {
                width: WIDTH,
                height: HEIGHT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: COLOR_BG_GRAD,
                color: COLOR_INK,
                fontFamily: "Inter, Noto Sans, system-ui, sans-serif",
                position: "relative",
            },
            children: [
                // Mini-harita panel (sol üst)
                buildMiniMapNode({
                    allowGeometry: !view.privateMode && view.mini.allowGeometry,
                    points: view.mini.points,
                    noData: view.mini.noData,
                    strokeW: view.mini.strokeW,
                    strokeOpacity: view.mini.strokeOpacity,
                }),
                // Sağdaki ana pano (960x540)
                {
                    type: "div",
                    props: {
                        style: {
                            position: "absolute",
                            right: 40,
                            top: 45,
                            width: 960,
                            height: 540,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            borderRadius: 32,
                            padding: 48,
                            background: COLOR_CARD_BG,
                            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                        },
                        children: [
                            // üst bilgi
                            {
                                type: "div",
                                props: {
                                    style: {
                                        fontSize: 28,
                                        fontWeight: 600,
                                        opacity: view.privateMode ? 0.8 : 0.9,
                                    },
                                    children: view.privateMode ? "Gizli rota" : (view.place || "").slice(0, 60),
                                },
                            },
                            // başlık
                            {
                                type: "div",
                                props: {
                                    style: {
                                        fontSize: 64,
                                        fontWeight: 800,
                                        lineHeight: 1.1,
                                        letterSpacing: -0.5,
                                        marginTop: 8,
                                        marginBottom: 16,
                                        whiteSpace: "pre-wrap",
                                    },
                                    children: (view.title || "Rota").slice(0, 120),
                                },
                            },
                            // alt bant: km/süre/puan
                            {
                                type: "div",
                                props: {
                                    style: {
                                        display: "flex",
                                        gap: 18,
                                        fontSize: 28,
                                        color: COLOR_MUTED,
                                    },
                                    children: [view.km ? `${view.km} km` : null, view.dur || null, view.ratingLabel || null]
                                        .filter(Boolean)
                                        .join(" • "),
                                },
                            },
                            // köşe logo
                            {
                                type: "div",
                                props: {
                                    style: {
                                        position: "absolute",
                                        right: 48,
                                        bottom: 40,
                                        fontSize: 28,
                                        opacity: 0.8,
                                    },
                                    children: "mylasa",
                                },
                            },
                        ],
                    },
                },
            ],
        },
    };
    const svg = await (0, satori_1.default)(root, {
        width: WIDTH,
        height: HEIGHT,
        fonts: [
            FONT_BOLD ? { name: "Inter", data: FONT_BOLD, weight: 700 } : undefined,
            FONT_REG ? { name: "Inter", data: FONT_REG, weight: 400 } : undefined,
        ].filter(Boolean),
    });
    const resvg = new resvg_js_1.Resvg(svg, { background: "rgba(0,0,0,0)" });
    return resvg.render().asPng();
}
// ---- HTTP endpoint
exports.routeOgImage = functions
    .region("us-central1")
    .https.onRequest(async (req, res) => {
    try {
        const bits = (req.path || "").split("/").filter(Boolean);
        const routeId = bits[bits.length - 1];
        if (!routeId) {
            res.status(404).setHeader("Content-Type", "image/png");
            res.send(Buffer.from(await renderOgPng({ title: "Bulunamadı", mini: { allowGeometry: false, strokeW: 6, strokeOpacity: 0.9 } })));
            return;
        }
        const snap = await db.collection("routes").doc(routeId).get();
        if (!snap.exists) {
            res.status(404).setHeader("Content-Type", "image/png");
            res.send(Buffer.from(await renderOgPng({ title: "Bulunamadı", mini: { allowGeometry: false, strokeW: 6, strokeOpacity: 0.9 } })));
            return;
        }
        const r = (snap.data() || {});
        const vis = String(r.visibility || "public");
        // ETag: updatedAt | ratingUpdatedAt | mediaUpdatedAt | areasStatus
        const etag = makeETag(`${routeId}:${updatedMillis(r)}:${vis}:${r.title || ""}:${r.ratingAvg || ""}:${r.ratingCount || ""}:${r.totalDistanceM || ""}:${r.durationMs || ""}:${r.areasStatus || ""}`);
        if (req.get("if-none-match") === etag) {
            res.status(304).end();
            return;
        }
        const km = toKm(r.totalDistanceM);
        const dur = formatDuration(r.durationMs);
        const ratingLabel = Number(r.ratingCount || 0) > 0
            ? `${Number(r.ratingAvg || 0).toFixed(1)}★ (${r.ratingCount})`
            : "";
        // Mini-harita verisi (public değilse geometri çizilmez)
        let allowGeometry = vis === "public";
        let miniPoints;
        let miniNoData = false;
        let strokeW = 6;
        let strokeOpacity = 0.9;
        if (allowGeometry) {
            const latlngs = extractLatLngs(r);
            if (latlngs.length >= 2) {
                // kutuya sığdır
                const { points } = (0, og_map_1.projectPathToBox)(latlngs, { w: INNER_W, h: INNER_H, pad: 0 });
                miniPoints = points;
                // kısa rota (bbox < 50 m) → 4px & opak 1.0
                const spanM = (0, og_map_1.approxBBoxMeters)(latlngs);
                if (spanM > 0 && spanM < 50) {
                    strokeW = 4;
                    strokeOpacity = 1.0;
                }
            }
            else {
                // tek nokta / veri yok
                miniNoData = true;
            }
        }
        const png = await renderOgPng({
            title: allowGeometry ? String(r.title || "Rota") : "Bu rota özeldir",
            place: allowGeometry
                ? [r.areas?.city, r.areas?.countryCode || r.areas?.country].filter(Boolean).join(" — ")
                : undefined,
            km,
            dur,
            ratingLabel,
            privateMode: !allowGeometry,
            mini: {
                allowGeometry,
                points: miniPoints,
                noData: miniNoData,
                strokeW,
                strokeOpacity,
            },
        });
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
        res.setHeader("ETag", etag);
        res.status(200).send(Buffer.from(png));
    }
    catch (e) {
        functions.logger.error("[routeOgImage] error", e);
        const png = await renderOgPng({
            title: "Hata",
            mini: { allowGeometry: false, noData: true, strokeW: 6, strokeOpacity: 0.9 },
        });
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=120");
        res.status(500).send(Buffer.from(png));
    }
});
