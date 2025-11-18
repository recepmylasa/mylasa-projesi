// Node 20 / TS – OG PNG + vektör mini-harita
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { projectPathToBox, LatLng } from "./og.map";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const WIDTH = 1200;
const HEIGHT = 630;

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

type OgView = {
  title: string;
  place?: string;
  km?: string;
  dur?: string;
  ratingLabel?: string;
  privateMode?: boolean;
  miniMapPath?: LatLng[];
};

function fontData(name: "Inter-Bold" | "Inter-Regular") {
  const p =
    name === "Inter-Bold"
      ? join(__dirname, "../assets/fonts/Inter-Bold.ttf")
      : join(__dirname, "../assets/fonts/Inter-Regular.ttf");
  if (!existsSync(p)) return undefined;
  return readFileSync(p);
}

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

function tsToMillis(t: any): number {
  if (!t) return 0;
  if (typeof t === "number") return t;
  if (typeof t === "string") return Number(t) || 0;
  if (typeof (t as any).toMillis === "function") {
    return Number((t as any).toMillis()) || 0;
  }
  if ((t as any)._seconds) {
    return Number((t as any)._seconds) * 1000;
  }
  return 0;
}

function updatedMillis(d: RouteDoc): number {
  const base = Math.max(
    tsToMillis(d.updatedAt),
    tsToMillis(d.ratingUpdatedAt),
    tsToMillis(d.mediaUpdatedAt)
  );
  const bump = d.areasStatus ? 17 : 0;
  return base + bump;
}

/* ---------- path/stops → LatLng[] helpers ---------- */

function asPoint(p: any): LatLng | null {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) {
    const [lat, lng] = p;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  if (typeof p === "object") {
    const lat = (p as any).lat ?? (p as any).latitude;
    const lng =
      (p as any).lng ?? (p as any).longitude ?? (p as any).lon;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  return null;
}

function extractPathPoints(route: RouteDoc): LatLng[] {
  const pts: LatLng[] = [];
  if (Array.isArray(route.path)) {
    for (const item of route.path) {
      const p = asPoint(item);
      if (p) pts.push(p);
    }
  }
  if (pts.length === 0 && Array.isArray(route.stops)) {
    for (const s of route.stops) {
      const p = asPoint((s as any)?.location || s);
      if (p) pts.push(p);
    }
  }
  return pts;
}

/* ---------- SVG render ---------- */

async function renderOgPng(view: OgView): Promise<Uint8Array> {
  const FONT_BOLD = fontData("Inter-Bold");
  const FONT_REG = fontData("Inter-Regular");

  // Mini-harita paneli
  const MAP_W = 360;
  const MAP_H = 360;
  const MAP_PAD = Math.round(Math.min(MAP_W, MAP_H) * 0.08);

  let miniMapNode: any = null;

  if (!view.privateMode) {
    const pts = (view.miniMapPath || []).slice();
    if (pts.length >= 2) {
      const { points } = projectPathToBox(pts, {
        w: MAP_W,
        h: MAP_H,
        pad: MAP_PAD,
      });

      const pathD =
        points.length >= 2
          ? points
              .map(
                ([x, y], i) =>
                  `${i === 0 ? "M" : "L"}${x.toFixed(
                    1
                  )} ${y.toFixed(1)}`
              )
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
    } else {
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

  const root: any = {
    type: "div",
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg,#0b1020 0%,#1a1f33 50%,#2b2466 100%)",
        color: "#eef1f7",
        fontFamily:
          "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      },
      children: {
        type: "div",
        props: {
          style: {
            width: WIDTH - 160,
            height: HEIGHT - 160,
            borderRadius: 32,
            padding: 40,
            background:
              "linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))",
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

  const svg = await (satori as any)(root, {
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

  const resvg = new Resvg(svg, { background: "rgba(0,0,0,0)" });
  return resvg.render().asPng();
}

/* ---------- HTTP Cloud Function ---------- */

export const routeOgImage = functions
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

      const r = (snap.data() || {}) as RouteDoc;
      const vis = String(r.visibility || "public");
      const isPrivate = vis !== "public";

      const etag = makeETag(
        [
          routeId,
          updatedMillis(r),
          vis,
          r.title || "",
          r.ratingAvg || "",
          r.ratingCount || "",
          r.totalDistanceM || "",
          r.durationMs || "",
        ].join(":")
      );
      if (req.get("if-none-match") === etag) {
        res.status(304).end();
        return;
      }

      const km = toKm(r.totalDistanceM);
      const dur = formatDuration(r.durationMs);
      const ratingLabel =
        Number(r.ratingCount || 0) > 0
          ? `${Number(r.ratingAvg || 0).toFixed(1)}★ (${r.ratingCount})`
          : "";

      const pathPoints = !isPrivate ? extractPathPoints(r) : [];

      const png = await renderOgPng({
        title: isPrivate ? "Bu rota özeldir" : String(r.title || "Rota"),
        place:
          isPrivate || !r.areas
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
      res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
      );
      res.setHeader("ETag", etag);
      res.status(200).send(Buffer.from(png));
    } catch (e) {
      functions.logger.error("[routeOgImage] error", e);
      const png = await renderOgPng({ title: "Hata", privateMode: false });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=120");
      res.status(500).send(Buffer.from(png));
    }
  });
