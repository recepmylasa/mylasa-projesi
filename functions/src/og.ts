// Node 20 / TS (firebase-functions v4 - v1 API)
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import { projectPathToBox } from "./og_map";          // Adım 18 yardımcıları (mevcut)
import {
  fitBoundsToCenterZoom,
  buildMapTilerUrl,
  fetchTilePng,
} from "./og_tiles";                                  // Adım 19 (yeni)

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

type LatLng = { lat: number; lng: number };
type RouteDoc = {
  title?: string;
  visibility?: "public" | "followers" | "private";
  areas?: { city?: string; country?: string; countryCode?: string };
  totalDistanceM?: number;
  durationMs?: number;
  ratingAvg?: number;
  ratingCount?: number;
  updatedAt?: any;
  ratingUpdatedAt?: any;
  mediaUpdatedAt?: any;
  areasStatus?: string;
  path?: any[];
  stops?: any[];
};

const WIDTH = 1200;
const HEIGHT = 630;
const CARD_W = 960;
const CARD_H = 540;

const MAP_W = 360;
const MAP_H = 360;
const MAP_PAD = 16;
const MAP_BG = "#0E0F13";
const MAP_LINE = "#6B5CFF";

const TILES_ENABLED = !!process.env.MAPTILER_API_KEY;
const MAPTILER_STYLE = process.env.MAPTILER_STYLE || "streets-v2";

// -------- font loader ----------
function fontData(name: "Inter-Bold" | "Inter-Regular") {
  const p =
    name === "Inter-Bold"
      ? join(__dirname, "../assets/fonts/Inter-Bold.ttf")
      : join(__dirname, "../assets/fonts/Inter-Regular.ttf");
  if (!existsSync(p)) return undefined;
  return readFileSync(p);
}

// -------- helpers ---------------
function toKm(m?: number) {
  const mm = Number(m || 0);
  if (!mm) return "";
  return String(Math.round(mm / 100) / 10);
}
function formatDuration(ms?: number) {
  const m = Math.round(Number(ms || 0) / 60000);
  if (!m) return "";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h} sa ${mm} dk` : `${mm} dk`;
}
function makeETag(s: string) {
  return `"${createHash("sha1").update(s).digest("hex")}"`;
}
function tsToMillis(x: any) {
  return (x as any)?.toMillis?.() || Number(x) || 0;
}
function updatedMillis(d: RouteDoc) {
  const u = tsToMillis(d.updatedAt);
  const r = tsToMillis(d.ratingUpdatedAt);
  const m = tsToMillis(d.mediaUpdatedAt);
  // areasStatus timestamp değil; hash’e string olarak katacağız (ETag içinde)
  return Math.max(u, r, m);
}
function asPoint(p: any): LatLng | null {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) {
    const [lat, lng] = p;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  if (typeof p === "object") {
    const lat = p.lat ?? (p.latitude as number);
    const lng = p.lng ?? p.longitude ?? p.lon;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  return null;
}
function pathFromRoute(r: RouteDoc): LatLng[] {
  const out: LatLng[] = [];
  if (Array.isArray(r.path) && r.path.length > 0) {
    for (const p of r.path) {
      const pp = asPoint(p);
      if (pp) out.push(pp);
    }
  }
  return out;
}
function centroidOfStops(stops?: any[]): LatLng | null {
  if (!Array.isArray(stops) || stops.length === 0) return null;
  let sx = 0,
    sy = 0,
    n = 0;
  for (const s of stops) {
    const p = asPoint(s?.location || s);
    if (p) {
      sx += p.lat;
      sy += p.lng;
      n++;
    }
  }
  if (!n) return null;
  return { lat: sx / n, lng: sy / n };
}
function bboxOf(latlngs: LatLng[]) {
  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;
  for (const p of latlngs) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

// -------------- render core -----------------
async function renderOgPng(view: {
  title: string;
  place?: string;
  km?: string;
  dur?: string;
  ratingLabel?: string;
  privateMode?: boolean;
  // mini-map paint data
  mapPath?: LatLng[];
  mapTileDataUrl?: string; // data:image/png;base64,...
}) {
  const FONT_BOLD = fontData("Inter-Bold");
  const FONT_REG = fontData("Inter-Regular");

  // Build mini-map panel child list
  const mapChildren: any[] = [];

  // background (tile or solid)
  if (view.mapTileDataUrl) {
    mapChildren.push({
      type: "img",
      props: {
        src: view.mapTileDataUrl,
        width: MAP_W - MAP_PAD * 2,
        height: MAP_H - MAP_PAD * 2,
        style: {
          position: "absolute",
          left: MAP_PAD,
          top: MAP_PAD,
          width: MAP_W - MAP_PAD * 2,
          height: MAP_H - MAP_PAD * 2,
          objectFit: "cover",
          borderRadius: 10 as any,
        },
      },
    });
  }

  // vector overlay (polyline)
  if (view.mapPath && view.mapPath.length >= 2 && !view.privateMode) {
    const { points } = projectPathToBox(view.mapPath, {
      w: MAP_W - MAP_PAD * 2,
      h: MAP_H - MAP_PAD * 2,
      pad: 0,
    });
    const d =
      points.length >= 2
        ? "M " +
          points
            .map(([x, y]) => `${(MAP_PAD + x).toFixed(1)} ${(MAP_PAD + y).toFixed(1)}`)
            .join(" L ")
        : "";

    if (d) {
      mapChildren.push({
        type: "svg",
        props: {
          width: MAP_W,
          height: MAP_H,
          style: { position: "absolute", left: 0, top: 0 },
          children: {
            type: "path",
            props: {
              d,
              stroke: MAP_LINE,
              "stroke-width": 6,
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              fill: "none",
            },
          },
        },
      });
    }
  }

  if ((!view.mapPath || view.mapPath.length < 2) && !view.privateMode) {
    // Veri yok placeholder
    mapChildren.push({
      type: "div",
      props: {
        style: {
          position: "absolute",
          left: 0,
          top: 0,
          width: MAP_W,
          height: MAP_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#7f8496",
          fontSize: 20,
        },
        children: "Veri yok",
      },
    });
  }

  const svg = await satori(
    {
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
          fontFamily: "Inter, Noto Sans, system-ui, sans-serif",
          position: "relative",
        },
        children: [
          // ana pano
          {
            type: "div",
            props: {
              style: {
                width: CARD_W,
                height: CARD_H,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderRadius: 32,
                padding: 48,
                background: "linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02))",
                boxShadow: "0 20px 60px rgba(0,0,0,.35)",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: { fontSize: 28, fontWeight: 600, opacity: view.privateMode ? 0.8 : 0.9 },
                    children: view.privateMode ? "Gizli rota" : (view.place || "").slice(0, 60),
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: 64,
                      fontWeight: 800 as any,
                      lineHeight: 1.1,
                      letterSpacing: -0.5,
                      marginTop: 8,
                      marginBottom: 16,
                      whiteSpace: "pre-wrap" as any,
                    },
                    children: (view.title || "Rota").slice(0, 120),
                  },
                },
                {
                  type: "div",
                  props: {
                    style: { display: "flex", gap: 18, fontSize: 28, color: "#c9cde3" },
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
                    style: { position: "absolute", right: 48, bottom: 40, fontSize: 28, opacity: 0.8 },
                    children: "mylasa",
                  },
                },
              ],
            },
          },
          // mini-harita paneli
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                left: 48,
                top: 48,
                width: MAP_W,
                height: MAP_H,
                background: MAP_BG,
                borderRadius: 12,
                boxShadow: "0 12px 30px rgba(0,0,0,.35)",
                overflow: "hidden" as any,
              },
              children: mapChildren,
            },
          },
        ],
      },
    } as any,
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        FONT_BOLD ? { name: "Inter", data: FONT_BOLD, weight: 700 } : undefined,
        FONT_REG ? { name: "Inter", data: FONT_REG, weight: 400 } : undefined,
      ].filter(Boolean) as any[],
    }
  );

  const resvg = new Resvg(svg, { background: "rgba(0,0,0,0)" });
  return resvg.render().asPng();
}

// -------------- HTTP handler ----------------
export const routeOgImage = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    try {
      const bits = (req.path || "").split("/").filter(Boolean);
      const routeId = bits[bits.length - 1];
      if (!routeId) {
        res.status(404).setHeader("Content-Type", "image/png");
        res.send(Buffer.from(await renderOgPng({ title: "Bulunamadı" })));
        return;
      }

      const snap = await db.collection("routes").doc(routeId).get();
      if (!snap.exists) {
        res.status(404).setHeader("Content-Type", "image/png");
        res.send(Buffer.from(await renderOgPng({ title: "Bulunamadı" })));
        return;
      }

      const r = (snap.data() || {}) as RouteDoc;
      const vis = String(r.visibility || "public");
      const isPrivate = vis !== "public";

      // ETag (tile görseli ETag'e dahil edilmez)
      const etag = makeETag(
        `${routeId}:${updatedMillis(r)}:${vis}:${r.title || ""}:${r.ratingAvg || ""}:${r.ratingCount || ""}:${r.totalDistanceM || ""}:${r.durationMs || ""}:${r.areasStatus || ""}`
      );
      if (req.get("if-none-match") === etag) {
        res.status(304).end();
        return;
      }

      // metin alanları
      const km = toKm(r.totalDistanceM);
      const dur = formatDuration(r.durationMs);
      const ratingLabel =
        Number(r.ratingCount || 0) > 0 ? `${Number(r.ratingAvg || 0).toFixed(1)}★ (${r.ratingCount})` : "";
      const place =
        [r.areas?.city, r.areas?.countryCode || r.areas?.country].filter(Boolean).join(" — ") || undefined;

      // polyline kaynak
      const path = pathFromRoute(r);
      const hasLine = path.length >= 2 && !isPrivate;

      // tile (opsiyonel)
      let tileDataUrl: string | undefined;
      if (hasLine && TILES_ENABLED) {
        try {
          const bb = bboxOf(path);
          const fit = fitBoundsToCenterZoom(
            { minLat: bb.minLat, minLng: bb.minLng, maxLat: bb.maxLat, maxLng: bb.maxLng },
            { w: MAP_W - MAP_PAD * 2, h: MAP_H - MAP_PAD * 2, pad: Math.floor(Math.min(MAP_W, MAP_H) * 0.08) }
          );
          const url = buildMapTilerUrl({
            center: fit.center,
            zoom: fit.zoom,
            w: MAP_W - MAP_PAD * 2,
            h: MAP_H - MAP_PAD * 2,
            style: MAPTILER_STYLE,
            key: String(process.env.MAPTILER_API_KEY),
          });
          const buf = await fetchTilePng(url);
          if (buf && buf.length > 0) {
            tileDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
          }
        } catch {
          // fallback: vektör-only
          tileDataUrl = undefined;
        }
      }

      const png = await renderOgPng({
        title: isPrivate ? "Bu rota özeldir" : String(r.title || "Rota"),
        place: isPrivate ? undefined : place,
        km,
        dur,
        ratingLabel,
        privateMode: isPrivate,
        mapPath: hasLine ? path : undefined,
        mapTileDataUrl: tileDataUrl,
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
      res.setHeader("ETag", etag);
      res.status(200).send(Buffer.from(png));
    } catch (e) {
      functions.logger.error("[routeOgImage] error", e);
      const png = await renderOgPng({ title: "Hata" });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=120");
      res.status(500).send(Buffer.from(png));
    }
  });
