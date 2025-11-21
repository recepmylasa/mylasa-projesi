// functions/src/share.ts
// /s/r/:routeId paylaşım sayfası + “Uygulamada Aç” CTA + telemetri

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { createHash } from "crypto";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** Varsayılan OG görseli (Storage public) */
const DEFAULT_OG_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/mylasa-final.firebasestorage.app/o/public%2Fshare%2Fdefault-route.png?alt=media";

type RouteDoc = {
  title?: string;
  visibility?: "public" | "followers" | "private";
  areas?: { city?: string; country?: string };
  totalDistanceM?: number;
  durationMs?: number;
  ratingAvg?: number;
  ratingCount?: number;
  route_media?: Array<{ url?: string; imageUrl?: string; thumbUrl?: string; poster?: string }>;
  coverUrl?: string;
  coverImage?: string;
  imageUrl?: string;
  poster?: string;
  thumbUrl?: string;
  media?: Array<{ url?: string; imageUrl?: string; thumbUrl?: string }>;
};

export const renderRouteShare = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    try {
      // /s/r/:id → rewrite ile geliyor
      const bits = (req.path || "").split("/").filter(Boolean);
      const routeId = bits[bits.length - 1];
      if (!routeId) return send404(res);

      const snap = await db.collection("routes").doc(routeId).get();
      if (!snap.exists) return send404(res);

      const r = (snap.data() || {}) as RouteDoc;
      const vis = String(r.visibility || "public");
      if (vis === "private") return send404(res, true); // owner-only → 404 + noindex

      const title = String(r.title || "Rota");
      const city = r.areas?.city || "";
      const country = r.areas?.country || "";
      const place = [city, country].filter(Boolean).join(" — ");

      const km = toKm(r.totalDistanceM);
      const dur = formatDuration(r.durationMs);
      const hasRating = Number(r.ratingCount || 0) > 0;

      const ogTitle = `Rota • ${title}${place ? " — " + place : ""}`;
      const ogDesc =
        [
          km ? `${km} km` : null,
          dur || null,
          hasRating ? `${Number(r.ratingAvg || 0).toFixed(1)}★ (${r.ratingCount})` : null
        ]
          .filter(Boolean)
          .join(" • ") || "Mylasa rota paylaşımı";

      const ogImage =
        firstNonEmpty(
          r.route_media?.[0]?.url,
          r.route_media?.[0]?.imageUrl,
          r.route_media?.[0]?.thumbUrl,
          r.route_media?.[0]?.poster,
          r.coverUrl,
          r.coverImage,
          r.imageUrl,
          r.poster,
          r.thumbUrl,
          r.media?.[0]?.url,
          r.media?.[0]?.imageUrl,
          r.media?.[0]?.thumbUrl
        ) || DEFAULT_OG_IMAGE;

      const canonical = `https://${req.get("host")}/s/r/${routeId}`;
      const robots = vis === "public" ? "index,follow" : "noindex,nofollow";

      // ETag (OG + başlık değişirse invalid olsun)
      const etag = makeETag(
        `${routeId}:${snap.updateTime?.toMillis?.() || ""}:${vis}:${title}:${ogImage}:${ogDesc}`
      );
      if (req.get("if-none-match") === etag) {
        res.status(304).end();
        return;
      }

      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
      res.setHeader("ETag", etag);
      res.setHeader("Vary", "Accept-Encoding");

      const html = renderHtml({
        title: ogTitle,
        desc: ogDesc,
        image: ogImage,
        robots,
        canonical,
        routeId,
        humanTitle: title,
        humanPlace: place
      });

      res.status(200).send(html);
    } catch (e) {
      console.error("renderRouteShare error:", e);
      return send404(res);
    }
  });

/* ---------------- helpers ---------------- */

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

function firstNonEmpty<T>(...vals: Array<T | undefined | null>): T | undefined {
  for (const v of vals) {
    const s = String(v ?? "");
    if (s && s !== "undefined" && s !== "null") return v as T;
  }
  return undefined;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeETag(s: string) {
  return `"${createHash("sha1").update(s).digest("hex")}"`;
}

function send404(res: functions.Response, privateMode = false) {
  res.setHeader("Cache-Control", "public, max-age=120");
  res
    .status(404)
    .send(`<!doctype html>
<html lang="tr"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<title>Rota bulunamadı</title><body>
<h1>404</h1><p>${privateMode ? "Bu rota özeldir." : "Rota bulunamadı veya erişim yok."}</p></body></html>`);
}

function renderHtml(p: {
  title: string;
  desc: string;
  image: string;
  robots: string;
  canonical: string;
  routeId: string;
  humanTitle: string;
  humanPlace: string;
}) {
  const T = escapeHtml(p.title);
  const D = escapeHtml(p.desc);
  const C = escapeHtml(p.canonical);
  const I = escapeHtml(p.image);
  const HT = escapeHtml(p.humanTitle || "Rota");
  const HP = escapeHtml(p.humanPlace || "");

  const encodedRouteId = encodeURIComponent(p.routeId);
  const routePath = `/r/${encodedRouteId}`;
  const protoHref = `web+mylasa:route?id=${encodedRouteId}`;

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${C}">
<meta name="robots" content="${p.robots}">
<title>${T}</title>
<meta name="description" content="${D}">
<meta property="og:type" content="article">
<meta property="og:title" content="${T}">
<meta property="og:description" content="${D}">
<meta property="og:image" content="${I}">
<meta property="og:url" content="${C}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${T}">
<meta name="twitter:description" content="${D}">
<meta name="twitter:image" content="${I}">
<meta name="twitter:url" content="${C}">
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;background:#f6f6f6}
.card{max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:12px;padding:16px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.04)}
.title{font-weight:800;font-size:18px;margin:6px 0}
.place{color:#666;margin-bottom:10px}
.thumb{width:100%;max-width:560px;border-radius:10px;border:1px solid #eee;margin-bottom:12px;object-fit:cover}
.actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.cta{display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;cursor:pointer;border:1px solid transparent}
.cta.primary{background:#111;color:#fff}
.cta.secondary{background:#fff;color:#111;border-color:#ddd}
.footer-note{margin-top:12px;font-size:12px;color:#777}
</style>
</head>
<body>
  <div class="card">
    <img class="thumb" src="${I}" alt="">
    <div class="title">${HT}</div>
    ${HP ? `<div class="place">${HP}</div>` : ``}
    <div class="actions">
      <a id="openInAppCta" class="cta primary" href="${protoHref}" role="button" title="Mylasa uygulamasında aç">Uygulamada Aç</a>
      <a id="openOnWebCta" class="cta secondary" href="${routePath}">Web'de aç</a>
    </div>
    <div class="footer-note">
      Mylasa hesabında oturum açtıysan, “Uygulamada Aç” ile rotayı uygulama içinde görüntüleyebilirsin.
    </div>
  </div>
<script>
(function(){
  var ROUTE_ID = "${p.routeId}";
  var ROUTE_PATH = "${routePath}";
  var PROTO_HREF = "${protoHref}";
  var LOG_ENDPOINT = "/t/share-open";

  function getPlatform(){
    var ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) return "android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    return "desktop";
  }

  function sendEvent(evt, mode){
    try{
      var payload = JSON.stringify({
        evt: evt,
        mode: mode || null,
        platform: getPlatform(),
        ua: navigator.userAgent || "",
        routeId: ROUTE_ID,
        ts: Date.now()
      });
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(LOG_ENDPOINT, blob);
      } else {
        fetch(LOG_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true
        }).catch(function(){});
      }
    } catch(e){}
  }

  // Sayfa görüntülendi
  sendEvent("share_page_view", "spa");

  var openBtn = document.getElementById("openInAppCta");
  var webBtn = document.getElementById("openOnWebCta");

  if (!openBtn) return;

  function fallbackToWeb(){
    try{
      sendEvent("open_in_app_fallback_web", "spa");
    } catch(e){}
    if (webBtn) {
      webBtn.click();
    } else {
      window.location.href = ROUTE_PATH;
    }
  }

  openBtn.addEventListener("click", function(e){
    e.preventDefault();
    // Eski telemetri ile uyum için
    sendEvent("share_open_click", "pwa");
    // Yeni olay isimleri
    sendEvent("open_in_app_attempt", "pwa");

    var didFallback = false;
    var timer = setTimeout(function(){
      if (didFallback) return;
      didFallback = true;
      fallbackToWeb();
    }, 450);

    try{
      // web+mylasa: handler'ı tetikle
      var a = document.createElement("a");
      a.style.display = "none";
      a.href = PROTO_HREF;
      document.body.appendChild(a);
      a.click();
      setTimeout(function(){
        if (a && a.parentNode) a.parentNode.removeChild(a);
      }, 0);
    } catch(e){
      clearTimeout(timer);
      didFallback = true;
      fallbackToWeb();
    }
  });

  // Klavye erişilebilirliği (Enter/Space)
  openBtn.addEventListener("keydown", function(e){
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openBtn.click();
    }
  });
})();
</script>
</body>
</html>`;
}
