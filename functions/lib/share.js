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
exports.renderRouteShare = void 0;
// Node 20 / TS
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
/** Varsayılan OG görseli (Storage public) */
const DEFAULT_OG_IMAGE = "https://firebasestorage.googleapis.com/v0/b/mylasa-final.firebasestorage.app/o/public%2Fshare%2Fdefault-route.png?alt=media";
exports.renderRouteShare = functions
    .region("us-central1")
    .https.onRequest(async (req, res) => {
    try {
        // /s/r/:id → rewrite ile geliyor
        const bits = (req.path || "").split("/").filter(Boolean);
        const routeId = bits[bits.length - 1];
        if (!routeId)
            return send404(res);
        const snap = await db.collection("routes").doc(routeId).get();
        if (!snap.exists)
            return send404(res);
        const r = (snap.data() || {});
        const vis = String(r.visibility || "public");
        if (vis === "private")
            return send404(res, true); // owner-only → 404 + noindex
        const title = String(r.title || "Rota");
        const city = r.areas?.city || "";
        const country = r.areas?.country || "";
        const place = [city, country].filter(Boolean).join(" — ");
        const km = toKm(r.totalDistanceM);
        const dur = formatDuration(r.durationMs);
        const hasRating = Number(r.ratingCount || 0) > 0;
        const ogTitle = `Rota • ${title}${place ? " — " + place : ""}`;
        const ogDesc = [km ? `${km} km` : null, dur || null, hasRating ? `${Number(r.ratingAvg || 0).toFixed(1)}★ (${r.ratingCount})` : null]
            .filter(Boolean)
            .join(" • ") || "Mylasa rota paylaşımı";
        const ogImage = firstNonEmpty(r.route_media?.[0]?.url, r.route_media?.[0]?.imageUrl, r.route_media?.[0]?.thumbUrl, r.route_media?.[0]?.poster, r.coverUrl, r.coverImage, r.imageUrl, r.poster, r.thumbUrl, r.media?.[0]?.url, r.media?.[0]?.imageUrl, r.media?.[0]?.thumbUrl) || DEFAULT_OG_IMAGE;
        const canonical = `https://${req.get("host")}/s/r/${routeId}`;
        const robots = vis === "public" ? "index,follow" : "noindex,nofollow";
        // ETag
        const etag = makeETag(`${routeId}:${snap.updateTime?.toMillis?.() || ""}:${vis}:${title}:${ogImage}:${ogDesc}`);
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
            humanPlace: place,
        });
        res.status(200).send(html);
    }
    catch (e) {
        console.error("renderRouteShare error:", e);
        return send404(res);
    }
});
/* ---------------- helpers ---------------- */
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
function firstNonEmpty(...vals) {
    for (const v of vals) {
        const s = String(v ?? "");
        if (s && s !== "undefined" && s !== "null")
            return v;
    }
    return undefined;
}
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function makeETag(s) {
    return `"${(0, crypto_1.createHash)("sha1").update(s).digest("hex")}"`;
}
function send404(res, privateMode = false) {
    res.setHeader("Cache-Control", "public, max-age=120");
    res.status(404).send(`<!doctype html>
<html lang="tr"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<title>Rota bulunamadı</title><body>
<h1>404</h1><p>${privateMode ? "Bu rota özeldir." : "Rota bulunamadı veya erişim yok."}</p></body></html>`);
}
function renderHtml(p) {
    const appOpenUrl = `/r/${encodeURIComponent(p.routeId)}`;
    const T = escapeHtml(p.title);
    const D = escapeHtml(p.desc);
    const C = escapeHtml(p.canonical);
    const I = escapeHtml(p.image);
    const HT = escapeHtml(p.humanTitle || "Rota");
    const HP = escapeHtml(p.humanPlace || "");
    const RID = escapeHtml(p.routeId);
    return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${C}"><meta name="robots" content="${p.robots}">
<title>${T}</title><meta name="description" content="${D}">
<meta property="og:type" content="article"><meta property="og:title" content="${T}">
<meta property="og:description" content="${D}"><meta property="og:image" content="${I}">
<meta property="og:url" content="${C}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${T}"><meta name="twitter:description" content="${D}">
<meta name="twitter:image" content="${I}"><meta name="twitter:url" content="${C}">
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px}
.card{max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:12px;padding:16px}
.title{font-weight:800;font-size:18px;margin:6px 0}
.place{color:#666;margin-bottom:10px}.cta{display:inline-block;padding:12px 16px;background:#111;color:#fff;border-radius:10px;text-decoration:none;cursor:pointer}
.thumb{width:100%;max-width:560px;border-radius:10px;border:1px solid #eee;margin-bottom:12px}
</style>
</head>
<body>
  <div class="card">
    <img class="thumb" src="${I}" alt="">
    <div class="title">${HT}</div>
    ${HP ? `<div class="place">${HP}</div>` : ``}
    <a
      id="open-in-app"
      class="cta"
      href="${appOpenUrl}"
      role="button"
      title="Mylasa uygulamasında aç"
      data-route-id="${RID}"
    >Uygulamada Aç</a>
  </div>
<script>
(function(){
  var btn = document.getElementById('open-in-app');
  if (!btn) return;

  var LOG_ENDPOINT = '/t/share-open';

  function sendEvent(evt, mode){
    try{
      var ua = navigator.userAgent || '';
      var rid = btn.getAttribute('data-route-id') || '';
      var payload = {
        evt: evt,
        event: evt,
        mode: mode || null,
        open_mode: mode || null,
        routeId: rid,
        ua: ua,
        ts: Date.now()
      };
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(LOG_ENDPOINT, body);
      } else {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', LOG_ENDPOINT, true);
        xhr.setRequestHeader('Content-Type','application/json');
        xhr.send(body);
      }
    } catch(e){}
  }

  // Sayfa görüntülenmesi (page view)
  sendEvent('share_page_view', null);

  btn.addEventListener('click', function(ev){
    ev.preventDefault();
    var rid = btn.getAttribute('data-route-id');
    if (!rid) {
      window.location.href = '/';
      return;
    }

    var origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
    if (!origin) origin = '';
    origin = origin.replace(/\\/$/, '');
    var routeUrl = origin + '/r/' + rid;

    // PWA (standalone) ise direkt rota URL'sine git
    var isStandalone =
      (window.navigator && (window.navigator.standalone === true)) ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

    if (isStandalone) {
      sendEvent('share_open_click', 'pwa');
      window.location.href = routeUrl;
      return;
    }

    var ua = navigator.userAgent || '';
    var isAndroid = ua.indexOf('Android') !== -1;

    // Android Chrome intent:// denemesi
    if (isAndroid) {
      var intentUrl =
        'intent://r/' + rid +
        '#Intent;scheme=https;package=com.android.chrome;' +
        'S.browser_fallback_url=' + encodeURIComponent(routeUrl) + ';end';

      var fallbackFired = false;
      var fallbackTimer = setTimeout(function(){
        if (fallbackFired) return;
        fallbackFired = true;
        try {
          // Gerçekleşen yol: SPA fallback
          sendEvent('open_result', 'spa');
          window.location.href = routeUrl;
        } catch(_) {}
      }, 700);

      try {
        // Tıklama anındaki niyet: intent
        sendEvent('share_open_click', 'intent');
        window.location.href = intentUrl;
      } catch(_) {
        clearTimeout(fallbackTimer);
        sendEvent('share_open_click', 'spa');
        sendEvent('open_result', 'spa');
        window.location.href = routeUrl;
      }
      return;
    }

    // Genel fallback: aynı origin'de /r/:id
    sendEvent('share_open_click', 'spa');
    sendEvent('open_result', 'spa');
    window.location.href = routeUrl;
  });
})();
</script>
</body></html>`;
}
