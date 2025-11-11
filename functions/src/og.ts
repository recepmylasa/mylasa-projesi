// functions/src/og.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "fs/promises";
import { join } from "path";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const WIDTH = 1200;
const HEIGHT = 630;

let FONT_REG: Uint8Array | null = null;
let FONT_BOLD: Uint8Array | null = null;

async function loadFont(localFile: string, remoteUrl: string) {
  try {
    const p = join(__dirname, "..", "assets", "fonts", localFile);
    return await readFile(p);
  } catch {
    const r = await fetch(remoteUrl);
    return new Uint8Array(await r.arrayBuffer());
  }
}
async function ensureFonts() {
  if (!FONT_REG)
    FONT_REG = await loadFont(
      "Inter-Regular.ttf",
      "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans-Regular.ttf"
    );
  if (!FONT_BOLD)
    FONT_BOLD = await loadFont(
      "Inter-Bold.ttf",
      "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans-Bold.ttf"
    );
}

function kmLabel(totalDistanceM?: number) {
  const km = (Number(totalDistanceM) || 0) / 1000;
  return km >= 1 ? `${km.toFixed(1)} km` : `${(km).toFixed(2)} km`;
}
function durLabel(durationMs?: number) {
  const s = Math.max(0, Math.round((Number(durationMs) || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} sa ${m} dk` : `${m} dk`;
}
function safeText(v: any, def = ""): string {
  const t = String(v ?? "").trim();
  return t || def;
}

function bgStyle(): any {
  return {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(135deg, #0b1020 0%, #141a32 45%, #1d2546 100%)",
  };
}

async function renderSvg(data: {
  title: string;
  city?: string;
  country?: string;
  km?: string;
  dura?: string;
  avg?: string | null;
  cnt?: number | null;
}) {
  await ensureFonts();

  const band =
    [data.km, data.dura, data.avg ? `${data.avg}★${data.cnt ? ` (${data.cnt})` : ""}` : ""]
      .filter(Boolean)
      .join(" • ");

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: WIDTH,
          height: HEIGHT,
          position: "relative",
          display: "flex",
          fontFamily: "Inter, Noto Sans, system-ui, sans-serif",
          color: "#eef2ff",
        },
        children: [
          { type: "div", props: { style: bgStyle() } },
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                inset: 24,
                borderRadius: 24,
                background: "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02))",
              },
            },
          },
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                inset: 48,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              },
              children: [
                (data.city || data.country) && {
                  type: "div",
                  props: {
                    style: {
                      alignSelf: "flex-start",
                      fontSize: 28,
                      fontWeight: 700,
                      padding: "10px 16px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,.08)",
                      letterSpacing: 0.4,
                    },
                    children: `${data.city ?? ""}${data.city && data.country ? " · " : ""}${data.country ?? ""}`,
                  },
                },
                {
                  type: "div",
                  props: {
                    style: { display: "flex", flexDirection: "column", gap: 18 },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: {
                            fontSize: 64,
                            fontWeight: 800,
                            lineHeight: 1.1,
                            maxWidth: 980,
                            wordBreak: "break-word",
                            overflow: "hidden",
                          },
                          children: data.title,
                        },
                      },
                    ],
                  },
                },
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: {
                            fontSize: 32,
                            fontWeight: 700,
                            padding: "12px 18px",
                            borderRadius: 14,
                            background: "rgba(255,255,255,.10)",
                            color: "#e6e9ff",
                            maxWidth: 980,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          },
                          children: band || " ",
                        },
                      },
                      {
                        type: "div",
                        props: { style: { fontSize: 24, opacity: 0.85, fontWeight: 700 }, children: "mylasa" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Inter", data: FONT_REG as Uint8Array, weight: 400 },
        { name: "Inter", data: FONT_BOLD as Uint8Array, weight: 700 },
      ],
    }
  );
  return svg;
}

async function renderSimpleSvg(label: string) {
  await ensureFonts();
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
          background: "linear-gradient(135deg, #0b1020 0%, #1a1f33 100%)",
          color: "#e5e7eb",
          fontFamily: "Inter, Noto Sans, system-ui, sans-serif",
        },
        children: [{ type: "div", props: { style: { fontSize: 56, fontWeight: 800 }, children: label } }],
      },
    },
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Inter", data: FONT_BOLD as Uint8Array, weight: 700 },
        { name: "Inter", data: FONT_REG as Uint8Array, weight: 400 },
      ],
    }
  );
  return svg;
}

function svgToPng(svg: string): Uint8Array {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } });
  return resvg.render().asPng();
}

function etagFor(routeId: string, stamp: number, vis: string) {
  return `W/"og-${routeId}-${vis}-${stamp}"`;
}

export const routeOgImage = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    try {
      const m = (req.path || req.url || "").match(/\/og\/r\/([^/?#]+)/i);
      const routeId = (m && m[1]) || String(req.query.id || "").trim();
      if (!routeId) {
        res.set("Cache-Control", "public, max-age=0, s-maxage=300");
        const png = svgToPng(await renderSimpleSvg("Bulunamadı"));
        res.status(404).set("Content-Type", "image/png").end(png);
        return;
      }

      const snap = await db.doc(`routes/${routeId}`).get();
      if (!snap.exists) {
        res.set("Cache-Control", "public, max-age=0, s-maxage=300");
        const png = svgToPng(await renderSimpleSvg("Bulunamadı"));
        res.status(404).set("Content-Type", "image/png").end(png);
        return;
      }

      const r = snap.data() || {};
      const visibility = String(r.visibility || "public").toLowerCase();
      if (visibility !== "public") {
        res.set("Cache-Control", "public, max-age=0, s-maxage=300");
        const png = svgToPng(await renderSimpleSvg("Gizli Rota"));
        res.status(404).set("Content-Type", "image/png").end(png);
        return;
      }

      const title = safeText(r.title, "Rota");
      const city = safeText(r?.areas?.city);
      const country = safeText(r?.areas?.countryCode || r?.areas?.country);
      const km = kmLabel(r.totalDistanceM);
      const dura = durLabel(r.durationMs);
      const cnt = Number(r.ratingCount || 0);
      const avg = cnt > 0 ? (Number(r.ratingSum || 0) / cnt).toFixed(1) : null;

      const up =
        Number(r.updatedAt?.toMillis?.() || 0) ||
        Number(r.updatedAt?.seconds ? r.updatedAt.seconds * 1000 : 0);
      const rup =
        Number(r.ratingUpdatedAt?.toMillis?.() || 0) ||
        Number(r.ratingUpdatedAt?.seconds ? r.ratingUpdatedAt.seconds * 1000 : 0);
      const snapUpd = Number(snap.updateTime?.toMillis?.() || 0);
      const stamp = Math.max(up, rup, snapUpd, 1);
      const etag = etagFor(routeId, stamp, visibility);

      if (req.headers["if-none-match"] === etag) {
        res.status(304);
        res.set("ETag", etag);
        res.set("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
        res.end();
        return;
      }

      const svg = await renderSvg({ title, city, country, km, dura, avg, cnt });
      const png = svgToPng(svg);

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
      res.setHeader("ETag", etag);
      if (stamp) res.setHeader("Last-Modified", new Date(stamp).toUTCString());
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(200).end(png);
    } catch (e) {
      console.error("routeOgImage error:", e);
      res.set("Cache-Control", "public, max-age=0, s-maxage=300");
      const png = svgToPng(await renderSimpleSvg("Hata"));
      res.status(500).set("Content-Type", "image/png").end(png);
    }
  });
