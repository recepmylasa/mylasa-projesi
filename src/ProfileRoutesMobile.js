/* FILE: src/ProfileRoutesMobile.js */
// Profil "Rotalarım" sekmesi – profil sahibine ait rotaları premium grid olarak listeler (read-only).
// Kapak (EMİR-1 + EMİR-2 uyumlu):
// A) route.cover.url (tek doğru kaynak)
// B) legacy: coverUrl/coverPhotoUrl/coverImageUrl/previewUrl/thumbnailUrl...
// C) fallback: ilk durağın ilk uygun görseli (image) / video varsa poster (image)
// D) default: /route-default-cover.jpg (PUBLIC_URL base-path uyumlu)
//
// EMİR-2: resolve OK olsa bile <img> 403/404/CORS ile patlarsa otomatik default cover'a düş.
// - <img src> ASLA gs:// / storage path / relative path olmaz; her zaman http(s):// veya data:image:
// - Kanıt logu: RouteTileProof (DEV only + route bazlı tek sefer)
//
// ✅ HOTFIX (REV): SVG cover render edilmez (data/image svg veya svg içerikli data-url) → "<path d>" console hatasını keser.
// ✅ Ayrıca: "default cover" görselini <img> olarak render ETMİYORUZ (placeholder gradient zaten var).
//   Çünkü console’daki "Expected number … 4V4a1…" hatası büyük olasılıkla <img> ile parse edilen SVG’den geliyor.
//
// ✅ EMİR 05: Inline SVG yerine merkezi Phosphor ikon sistemi (src/icons.js) kullanılır.
//
// ✅ ARGE7 — EMİR PAKETİ 1/3 (GENİŞLETİLMİŞ)
// Profile “Rotalarım” = TEK + (FAB) + Direkt builder (CreateSheet yok)
// - FAB tık: token set → map’e git → builder (Durak Ekle/Bitir)
// - Ara menüler yok
// - 700ms spam guard

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ProfileRoutesMobile.css";
import useUserRoutes from "./hooks/useUserRoutes";
import { Icon } from "./icons";

import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";
import RouteCardManusMobile from "./routes/RouteCardManusMobile";

const __DEV__ = process.env.NODE_ENV !== "production";
const DEFAULT_ROUTE_COVER_URL =
  (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg";

// StrictMode / remount spamını kesmek için (DEV only) modül seviyesinde tek sefer log
const __devProofLoggedRouteIds = new Set();

// ✅ getDownloadURL spamını kes (özellikle unauthorized / permission)
const __dlWarnOnce = new Set();
function warnOnce(key, ...args) {
  if (!__DEV__) return;
  if (__dlWarnOnce.has(key)) return;
  __dlWarnOnce.add(key);
  // eslint-disable-next-line no-console
  console.warn(...args);
}

function toDate(dt) {
  if (!dt) return null;
  try {
    if (dt instanceof Date) return dt;
    if (typeof dt.toDate === "function") return dt.toDate();
    if (typeof dt.seconds === "number") return new Date(dt.seconds * 1000);
    if (typeof dt === "number") return new Date(dt); // ms
    return new Date(dt);
  } catch {
    return null;
  }
}

function toFiniteNumber(x) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function stripQueryAndHash(v) {
  const s = (v || "").toString().trim();
  if (!s) return "";
  return s.split(/[?#]/)[0];
}

function safeDecodeURIComponent(v) {
  const s = (v || "").toString();
  if (!s) return "";
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ✅ URL içinde gizlenmiş ".svg" (firebase o/<encodedPath> gibi) yakala
function urlContainsSvgMarker(v) {
  const s0 = (v || "").toString().trim();
  if (!s0) return false;
  const s = safeDecodeURIComponent(s0).toLowerCase();
  return (
    s.includes(".svg") ||
    s.includes(".svgz") ||
    s.includes("image/svg+xml") ||
    s.includes("format=svg")
  );
}

// ✅ EMİR: placeholder cover say (mylasa-logo.* + route-default-cover.jpg)
function isKnownAppLogoUrl(v) {
  const base = stripQueryAndHash(v).toLowerCase();
  if (!base) return false;
  const file = base.split("/").pop();
  return (
    file === "mylasa-logo.png" ||
    file === "mylasa-logo.svg" ||
    file === "route-default-cover.jpg"
  );
}

// ✅ SVG tespit (console "<path d>" hatası için HOTFIX)
function isSvgDataUrl(v) {
  const s = (v || "").toString().trim().toLowerCase();
  return s.startsWith("data:image/svg+xml") || s.startsWith("data:image/svg");
}

function isSvgHttpUrl(v) {
  const base0 = stripQueryAndHash(v);
  const base = base0.toLowerCase();
  if (!base) return false;

  if (
    base.endsWith(".svg") ||
    base.endsWith(".svgz") ||
    base.includes("image/svg+xml") ||
    base.includes("format=svg")
  )
    return true;

  if (urlContainsSvgMarker(base0)) return true;

  return false;
}

function looksLikeSvgDataUrl(v) {
  const s0 = (v || "").toString().trim();
  if (!s0) return false;
  const s = s0.toLowerCase();
  if (!s.startsWith("data:image/")) return false;

  if (s.startsWith("data:image/svg")) return true;

  const comma = s.indexOf(",");
  if (comma === -1) return false;

  const payload = s.slice(comma + 1, comma + 1 + 240);
  if (!payload) return false;

  if (
    payload.includes("<svg") ||
    payload.includes("%3csvg") ||
    payload.includes("xmlns%3d") ||
    payload.includes("xmlns=")
  )
    return true;

  if (payload.includes("phn2zy")) return true;

  return false;
}

function isSvgAny(v) {
  if (!isNonEmptyString(v)) return false;
  return isSvgDataUrl(v) || isSvgHttpUrl(v) || looksLikeSvgDataUrl(v);
}

function isHttpHttpsOrDataUrl(v) {
  const s = (v || "").toString().trim();
  if (!s) return false;

  // ✅ HOTFIX: SVG render edilmez (gizli svg dahil)
  if (isSvgAny(s) || urlContainsSvgMarker(s)) return false;

  return /^https?:\/\//i.test(s) || /^data:image\//i.test(s);
}

function isGsUrl(v) {
  return typeof v === "string" && v.trim().toLowerCase().startsWith("gs://");
}

function looksLikeRelativeStoragePath(v) {
  if (!isNonEmptyString(v)) return false;
  const s0 = v.trim();
  const s = s0.split(/[?#]/)[0];

  if (isHttpHttpsOrDataUrl(s)) return false;
  if (s.startsWith("gs://")) return true;

  if (s.startsWith("/")) return false;

  if (s.includes("\\\\")) return true;
  if (s.includes("..")) return true;
  if (s.includes("/")) return true;

  return false;
}

function parseFirebaseStorageHttpUrlToGs(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = (u.hostname || "").toLowerCase();

    if (host.includes("firebasestorage.googleapis.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const bi = parts.indexOf("b");
      const oi = parts.indexOf("o");
      if (bi !== -1 && oi !== -1 && parts[bi + 1] && parts[oi + 1]) {
        const bucket = parts[bi + 1];
        const encoded = parts.slice(oi + 1).join("/");
        const objectPath = decodeURIComponent(encoded);
        return `gs://${bucket}/${objectPath}`;
      }
    }

    if (host === "storage.googleapis.com") {
      const p = u.pathname.split("/").filter(Boolean);
      if (p.length >= 2) {
        const bucket = p[0];
        const objectPath = p.slice(1).join("/");
        return `gs://${bucket}/${objectPath}`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function toSameOriginAbsoluteUrl(v) {
  const s = (v || "").toString().trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;

  if (s.startsWith("/")) {
    try {
      if (
        typeof window !== "undefined" &&
        window.location &&
        window.location.origin
      ) {
        return `${window.location.origin}${s}`;
      }
    } catch {}
    return s;
  }

  return s;
}

// --------- Storage URL resolver (cache + proof logs) ---------
const __resolvedUrlCache = new Map(); // key -> { ok:boolean, url:string, errorCode?:string }
const __inflight = new Map(); // key -> Promise

function storagePathLooksSvg(gsOrPath) {
  const s = (gsOrPath || "").toString().trim();
  if (!s) return false;
  const low = safeDecodeURIComponent(s).toLowerCase();
  return low.includes(".svg") || low.includes(".svgz");
}

async function resolveToHttpsUrl(input) {
  const raw0 = (input || "").toString().trim();
  if (!raw0) return "";

  if (isSvgAny(raw0) || urlContainsSvgMarker(raw0)) return "";

  if (/^data:image\//i.test(raw0)) return raw0;

  if (raw0.startsWith("/")) {
    const abs = toSameOriginAbsoluteUrl(raw0);
    if (isSvgAny(abs) || urlContainsSvgMarker(abs)) return "";
    return abs;
  }

  if (/^https?:\/\//i.test(raw0)) {
    if (isSvgAny(raw0) || urlContainsSvgMarker(raw0)) return "";

    const gsFromHttp = parseFirebaseStorageHttpUrlToGs(raw0);
    if (!gsFromHttp) {
      if (urlContainsSvgMarker(raw0)) return "";
      return raw0;
    }

    if (storagePathLooksSvg(gsFromHttp)) return "";

    try {
      const storage = getStorage();
      const r = storageRef(storage, gsFromHttp);
      const https = await getDownloadURL(r);

      if (
        isSvgAny(https) ||
        urlContainsSvgMarker(https) ||
        storagePathLooksSvg(gsFromHttp)
      )
        return "";
      return typeof https === "string" && /^https?:\/\//i.test(https)
        ? https
        : raw0;
    } catch (e) {
      const code = e?.code ? String(e.code) : "unknown";

      if (
        code === "permission-denied" ||
        code === "storage/unauthorized" ||
        code === "storage/unauthenticated" ||
        code === "storage/unknown"
      ) {
        warnOnce(
          `dlwarn_http_${code}`,
          `[ProfileRoutesMobile] getDownloadURL blocked (${code}) — fallback’a düşülecek.`
        );
        return raw0;
      }

      // eslint-disable-next-line no-console
      console.warn(`getDownloadURL FAILED: ${gsFromHttp} ${code}`);
      return raw0;
    }
  }

  if (isGsUrl(raw0) || looksLikeRelativeStoragePath(raw0)) {
    const base = raw0.split(/[?#]/)[0];
    const path = base.startsWith("/") ? base.slice(1) : base;

    if (storagePathLooksSvg(path)) return "";

    try {
      const storage = getStorage();
      const r = storageRef(storage, path);
      const https = await getDownloadURL(r);

      if (isSvgAny(https) || urlContainsSvgMarker(https) || storagePathLooksSvg(path))
        return "";
      return typeof https === "string" && /^https?:\/\//i.test(https) ? https : "";
    } catch (e) {
      const code = e?.code ? String(e.code) : "unknown";

      if (
        code === "permission-denied" ||
        code === "storage/unauthorized" ||
        code === "storage/unauthenticated"
      ) {
        warnOnce(
          `dlwarn_gs_${code}`,
          `[ProfileRoutesMobile] getDownloadURL blocked (${code}) — placeholder kullanılacak.`
        );
        return "";
      }

      // eslint-disable-next-line no-console
      console.warn(`getDownloadURL FAILED: ${path} ${code}`);
      return "";
    }
  }

  return "";
}

function useResolvedMediaUrl(input) {
  const key = (input || "").toString().trim();
  const [state, setState] = useState(() => {
    const cached = __resolvedUrlCache.get(key);
    if (cached)
      return { ...cached, input: key, status: cached.ok ? "ok" : "fail" };
    return {
      input: key,
      status: key ? "idle" : "empty",
      url: "",
      ok: false,
      errorCode: "",
    };
  });

  useEffect(() => {
    const k = key;
    if (!k) {
      setState({ input: "", status: "empty", url: "", ok: false, errorCode: "" });
      return;
    }

    const cached = __resolvedUrlCache.get(k);
    if (cached) {
      setState({ input: k, status: cached.ok ? "ok" : "fail", ...cached });
      return;
    }

    let cancelled = false;

    const run = async () => {
      if (__inflight.has(k)) {
        try {
          const url = await __inflight.get(k);
          if (cancelled) return;
          const ok = isHttpHttpsOrDataUrl(url);
          const rec = { ok, url: ok ? url : "", errorCode: ok ? "" : "resolve_failed" };
          __resolvedUrlCache.set(k, rec);
          setState({ input: k, status: ok ? "ok" : "fail", ...rec });
        } catch {
          if (cancelled) return;
          const rec = { ok: false, url: "", errorCode: "resolve_failed" };
          __resolvedUrlCache.set(k, rec);
          setState({ input: k, status: "fail", ...rec });
        }
        return;
      }

      setState((p) => ({ ...p, input: k, status: "resolving" }));

      const p = resolveToHttpsUrl(k);
      __inflight.set(k, p);

      try {
        const url = await p;
        __inflight.delete(k);
        if (cancelled) return;

        const ok = isHttpHttpsOrDataUrl(url);
        const rec = { ok, url: ok ? url : "", errorCode: ok ? "" : "resolve_failed" };
        __resolvedUrlCache.set(k, rec);

        setState({ input: k, status: ok ? "ok" : "fail", ...rec });
      } catch (e) {
        __inflight.delete(k);
        if (cancelled) return;
        const code = e?.code ? String(e.code) : "resolve_failed";
        const rec = { ok: false, url: "", errorCode: code };
        __resolvedUrlCache.set(k, rec);
        setState({ input: k, status: "fail", ...rec });
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}

function formatDistanceKmFromRoute(route) {
  if (!route) return "";

  const s = route.stats || {};
  const kmFromStats = toFiniteNumber(s.distanceKm);
  if (kmFromStats != null && kmFromStats > 0) {
    const fixed =
      kmFromStats >= 10
        ? Math.round(kmFromStats)
        : Math.round(kmFromStats * 10) / 10;
    return `${fixed} km`;
  }

  const m =
    s.distanceM ??
    s.distanceMeters ??
    route.totalDistanceM ??
    route.distanceMeters ??
    route.distance ??
    null;

  const mm = toFiniteNumber(m);
  if (mm == null || mm <= 0) return "";

  const km = mm / 1000;
  const fixed = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${fixed} km`;
}

function formatDurationFromRoute(route) {
  const ms =
    toFiniteNumber(route?.stats?.durationMs) ??
    toFiniteNumber(route?.durationMs) ??
    (toFiniteNumber(route?.durationSeconds) != null
      ? toFiniteNumber(route?.durationSeconds) * 1000
      : null) ??
    (toFiniteNumber(route?.stats?.durationSeconds) != null
      ? toFiniteNumber(route?.stats?.durationSeconds) * 1000
      : null) ??
    null;

  if (ms == null || ms <= 0) return "";

  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} dk`;

  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  if (h <= 0) return `${totalMin} dk`;
  if (m <= 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

function formatCompactCount(nRaw) {
  const n = toFiniteNumber(nRaw);
  if (n == null || n < 0) return "";
  if (n < 1000) return String(Math.round(n));
  if (n < 1000000) return `${Math.round((n / 1000) * 10) / 10}K`;
  return `${Math.round((n / 1000000) * 10) / 10}M`;
}

function extractMetric(route, keys) {
  const r = route || {};
  const raw = r.raw || r.data || r.doc || {};
  const metrics = r.metrics || raw.metrics || raw.agg || {};
  for (const k of keys) {
    const v =
      (k.startsWith("metrics.") ? metrics?.[k.slice("metrics.".length)] : r?.[k]) ??
      raw?.[k] ??
      (k.startsWith("raw.") ? raw?.[k.slice("raw.".length)] : undefined);
    const n = toFiniteNumber(v);
    if (n != null) return n;
  }
  return null;
}

function inferCityOrTag(route) {
  const r = route || {};
  const raw = r.raw || {};
  const city =
    (r.areas && (r.areas.city || r.areas.town)) ||
    (raw.areas && (raw.areas.city || raw.areas.town)) ||
    r.city ||
    r.town ||
    raw.city ||
    raw.town ||
    "";
  if (isNonEmptyString(city)) return String(city).trim();

  const tags = Array.isArray(r.tags) ? r.tags : Array.isArray(raw.tags) ? raw.tags : [];
  const firstTag = tags.find((t) => typeof t === "string" && t.trim());
  return firstTag ? String(firstTag).trim() : "";
}

function inferAuthorName(route) {
  const r = route || {};
  const raw = r.raw || {};
  const cand =
    r.authorName ||
    r.ownerName ||
    r.userName ||
    raw.authorName ||
    raw.ownerName ||
    raw.userName ||
    (raw.owner && (raw.owner.name || raw.owner.username)) ||
    "";
  return isNonEmptyString(cand) ? String(cand).trim() : "";
}

function isDefaultRouteTitle(titleRaw) {
  const t = (titleRaw || "").toString().trim();
  if (!t) return true;
  if (!/^rota\b/i.test(t)) return false;

  return /(\d{1,2}:\d{2})|(\d{1,2}[./-]\d{1,2})|(\d{4}[./-]\d{1,2}[./-]\d{1,2})|\d{2,}/.test(t);
}

// ✅ GERÇEK VERİ YOLLARI + order/idx sort
function getStopsArray(route) {
  if (!route) return [];

  const take = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const copy = arr.slice();
    const hasOrder = copy.some((x) => x && (x.order !== undefined || x.idx !== undefined));
    if (!hasOrder) return copy;
    copy.sort((a, b) => {
      const ao = toFiniteNumber(a?.order ?? a?.idx) ?? 0;
      const bo = toFiniteNumber(b?.order ?? b?.idx) ?? 0;
      return ao - bo;
    });
    return copy;
  };

  if (Array.isArray(route.stopsPreview) && route.stopsPreview.length > 0) return take(route.stopsPreview);
  if (Array.isArray(route.stops) && route.stops.length > 0) return take(route.stops);

  const raw = route.raw || route.data || route.doc || null;
  if (raw) {
    if (Array.isArray(raw.stopsPreview) && raw.stopsPreview.length > 0) return take(raw.stopsPreview);
    if (Array.isArray(raw.stops) && raw.stops.length > 0) return take(raw.stops);
    if (raw.data && Array.isArray(raw.data.stopsPreview)) return take(raw.data.stopsPreview);
  }

  return [];
}

function getStopNameWithSource(stop) {
  if (!stop) return { name: "", source: "" };

  const s = stop;
  const raw = s.raw || s.data || null;

  const pairs = [
    ["title", s.title],
    ["name", s.name],
    ["placeName", s.placeName],
    ["addressName", s.addressName],
    ["locationName", s.locationName],
    ["label", s.label],

    ["place.mainText", s.place?.mainText],
    ["place.secondaryText", s.place?.secondaryText],
    ["place.structured_formatting.main_text", s.place?.structured_formatting?.main_text],
    ["place.structured_formatting.secondary_text", s.place?.structured_formatting?.secondary_text],

    ["place.name", s.place?.name],
    ["place.title", s.place?.title],
    ["place.label", s.place?.label],
    ["place.formattedAddress", s.place?.formattedAddress],
    ["place.formatted", s.place?.formatted],

    ["poi.name", s.poi?.name],
    ["poi.title", s.poi?.title],
    ["poiName", s.poiName],

    ["address.name", s.address?.name],
    ["address.title", s.address?.title],

    ["baslik", s.baslik],
    ["ad", s.ad],
    ["isim", s.isim],
    ["mekanAdi", s.mekanAdi],
    ["konumAdi", s.konumAdi],

    ["raw.title", raw?.title],
    ["raw.name", raw?.name],
    ["raw.placeName", raw?.placeName],
    ["raw.addressName", raw?.addressName],
    ["raw.place.mainText", raw?.place?.mainText],
    ["raw.place.name", raw?.place?.name],
    ["raw.poi.name", raw?.poi?.name],
    ["raw.baslik", raw?.baslik],
    ["raw.ad", raw?.ad],
    ["raw.isim", raw?.isim],
  ];

  for (const [src, v] of pairs) {
    if (typeof v === "string" && v.trim()) return { name: v.trim(), source: src };
  }

  if (typeof s.place === "string" && s.place.trim()) return { name: s.place.trim(), source: "place(string)" };
  if (typeof raw?.place === "string" && raw.place.trim()) return { name: raw.place.trim(), source: "raw.place(string)" };

  return { name: "", source: "" };
}

function buildSmartTitleProof(route, fallbackTitle) {
  const title = (fallbackTitle || "").toString().trim() || "Adsız rota";
  if (!isDefaultRouteTitle(title)) {
    return { smartTitle: title, startName: "", endName: "", startSource: "route.title", endSource: "" };
  }

  const stops = getStopsArray(route);
  const first = getStopNameWithSource(stops[0]);
  const last = getStopNameWithSource(stops[stops.length - 1]);

  if (first.name && last.name) {
    const a = first.name.trim();
    const b = last.name.trim();

    if (a.localeCompare(b, "tr", { sensitivity: "base" }) === 0) {
      return {
        smartTitle: a,
        startName: a,
        endName: b,
        startSource: first.source || "stopsPreview[0]",
        endSource: last.source || "stopsPreview[last]",
      };
    }

    return {
      smartTitle: `${a} ➜ ${b}`,
      startName: a,
      endName: b,
      startSource: first.source || "stopsPreview[0]",
      endSource: last.source || "stopsPreview[last]",
    };
  }

  if (first.name && !last.name) {
    return {
      smartTitle: first.name,
      startName: first.name,
      endName: "",
      startSource: first.source || "stopsPreview[0]",
      endSource: "",
    };
  }

  const d = toDate(
    route?.finishedAt ||
      route?.createdAt ||
      route?.raw?.finishedAt ||
      route?.raw?.createdAt ||
      route?.data?.finishedAt ||
      route?.data?.createdAt
  );
  if (!d) return { smartTitle: "Yeni sürüş", startName: "", endName: "", startSource: "dateFallback", endSource: "" };

  try {
    const dayMonth = d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
    return { smartTitle: `${dayMonth} Sürüşü`, startName: "", endName: "", startSource: "dateFallback", endSource: "" };
  } catch {
    return { smartTitle: "Yeni sürüş", startName: "", endName: "", startSource: "dateFallback", endSource: "" };
  }
}

function isVideoUrl(url) {
  const u = (url || "").toString().toLowerCase();
  return u.includes(".mp4") || u.includes(".webm") || u.includes(".mov") || u.includes(".m4v") || u.includes("video/");
}

// legacy alanlar (read-only)
function resolveLegacyCoverUrl(route) {
  if (!route) return "";

  const cand =
    route.coverUrl ||
    route.coverPhotoUrl ||
    route.coverImageUrl ||
    route.previewUrl ||
    route.thumbnailUrl ||
    route.thumbUrl ||
    route.imageUrl ||
    route.photoUrl ||
    route.mediaUrl ||
    route?.raw?.coverUrl ||
    route?.raw?.coverPhotoUrl ||
    route?.raw?.coverImageUrl ||
    route?.raw?.previewUrl ||
    route?.raw?.thumbnailUrl ||
    route?.raw?.mediaUrl ||
    "";

  return isNonEmptyString(cand) ? String(cand).trim() : "";
}

function pickFirstStopImageCandidate(stop) {
  if (!stop) return { url: "", fromVideoPoster: false };

  const getByPath = (obj, path) => {
    if (!obj || !path) return undefined;
    const parts = String(path).split(".");
    let cur = obj;
    for (const p of parts) {
      if (!cur || typeof cur !== "object") return undefined;
      cur = cur[p];
    }
    return cur;
  };

  const candidates = [
    "imageUrl",
    "photoUrl",
    "thumbnailUrl",
    "thumbUrl",
    "previewUrl",
    "posterUrl",
    "poster",
    "coverUrl",
    "mediaUrl",
    "downloadUrl",
    "downloadURL",
    "signedUrl",
    "publicUrl",
    "fileUrl",
    "uri",
    "path",
    "fullPath",
    "storagePath",
    "gsUrl",
    "url",
    "src",
    "file.url",
    "file.downloadUrl",
    "asset.url",
    "asset.downloadUrl",
  ];

  for (const key of candidates) {
    const v = key.includes(".") ? getByPath(stop, key) : stop?.[key];
    if (!isNonEmptyString(v)) continue;
    const u = String(v).trim();
    if (!u || isKnownAppLogoUrl(u)) continue;
    if (isVideoUrl(u)) continue;
    if (isSvgAny(u) || urlContainsSvgMarker(u)) continue;
    return { url: u, fromVideoPoster: false };
  }

  const packs = [
    stop.media,
    stop.medias,
    stop.gallery,
    stop.items,
    stop.photos,
    stop.images,
    stop.attachments,
    stop.files,
    stop.mediaItems,
  ].filter(Boolean);

  for (const pack of packs) {
    const arr = Array.isArray(pack) ? pack : null;
    if (!arr || !arr.length) continue;

    for (const it of arr) {
      if (!it) continue;

      if (typeof it === "string") {
        const u = it.trim();
        if (!u || isKnownAppLogoUrl(u)) continue;
        if (isVideoUrl(u)) continue;
        if (isSvgAny(u) || urlContainsSvgMarker(u)) continue;
        return { url: u, fromVideoPoster: false };
      }

      if (typeof it === "object") {
        const typeRaw = (it.type || it.mediaType || it.kind || it.mime || "").toString().toLowerCase();

        const url =
          (isNonEmptyString(it.url) ? it.url : "") ||
          (isNonEmptyString(it.src) ? it.src : "") ||
          (isNonEmptyString(it.mediaUrl) ? it.mediaUrl : "") ||
          (isNonEmptyString(it.imageUrl) ? it.imageUrl : "") ||
          (isNonEmptyString(it.photoUrl) ? it.photoUrl : "") ||
          (isNonEmptyString(it.videoUrl) ? it.videoUrl : "") ||
          (isNonEmptyString(it.fileUrl) ? it.fileUrl : "") ||
          (isNonEmptyString(it.path) ? it.path : "") ||
          (isNonEmptyString(it.uri) ? it.uri : "");

        const poster =
          (isNonEmptyString(it.posterUrl) ? it.posterUrl : "") ||
          (isNonEmptyString(it.poster) ? it.poster : "") ||
          (isNonEmptyString(it.thumbnailUrl) ? it.thumbnailUrl : "") ||
          (isNonEmptyString(it.thumbUrl) ? it.thumbUrl : "") ||
          (isNonEmptyString(it.previewUrl) ? it.previewUrl : "");

        const urlStr = isNonEmptyString(url) ? String(url).trim() : "";
        const posterStr = isNonEmptyString(poster) ? String(poster).trim() : "";

        const isVid =
          typeRaw.includes("video") ||
          typeRaw.includes("mp4") ||
          typeRaw.includes("webm") ||
          (urlStr ? isVideoUrl(urlStr) : false);

        if (isVid) {
          if (
            posterStr &&
            !isVideoUrl(posterStr) &&
            !isKnownAppLogoUrl(posterStr) &&
            !(isSvgAny(posterStr) || urlContainsSvgMarker(posterStr))
          ) {
            return { url: posterStr, fromVideoPoster: true };
          }
          continue;
        }

        const cand = urlStr || posterStr;
        if (cand && !isVideoUrl(cand) && !isKnownAppLogoUrl(cand) && !(isSvgAny(cand) || urlContainsSvgMarker(cand))) {
          return { url: cand, fromVideoPoster: false };
        }
      }
    }
  }

  return { url: "", fromVideoPoster: false };
}

function pickStopCoverCandidate(route) {
  const stops = getStopsArray(route);
  if (!stops.length) return { url: "", stopId: "", fromVideoPoster: false };

  for (const st of stops) {
    const { url, fromVideoPoster } = pickFirstStopImageCandidate(st);
    if (isNonEmptyString(url)) {
      const stopId = isNonEmptyString(st?.id)
        ? String(st.id)
        : isNonEmptyString(st?.stopId)
        ? String(st.stopId)
        : "";
      return { url, stopId, fromVideoPoster: !!fromVideoPoster };
    }
  }

  return { url: "", stopId: "", fromVideoPoster: false };
}

// ✅ Kapak (EMİR): cover.url → legacy → stopMedia → placeholder
function pickCoverCandidate(route) {
  if (!route)
    return {
      kind: "default",
      url: "", // ✅ default cover img basmıyoruz (placeholder var)
      hasVideo: false,
      sourceField: "default",
    };

  const coverObj = route?.cover && typeof route.cover === "object" ? route.cover : null;
  const coverMetaUrl = isNonEmptyString(coverObj?.url) ? String(coverObj.url).trim() : "";
  const coverMetaField = isNonEmptyString(coverObj?.sourceField) ? String(coverObj.sourceField).trim() : "";
  const coverMetaHasVideo = !!coverObj?.fromVideoPoster || !!coverObj?.hasVideoPoster;

  if (
    coverMetaUrl &&
    !isKnownAppLogoUrl(coverMetaUrl) &&
    !isVideoUrl(coverMetaUrl) &&
    !(isSvgAny(coverMetaUrl) || urlContainsSvgMarker(coverMetaUrl))
  ) {
    return {
      kind: "image",
      url: coverMetaUrl,
      hasVideo: coverMetaHasVideo,
      sourceField: coverMetaField || "cover.url",
      stopId: isNonEmptyString(coverObj?.stopId) ? String(coverObj.stopId) : "",
    };
  }

  const coverUrl = isNonEmptyString(route?.cover?.url) ? String(route.cover.url).trim() : "";
  if (
    coverUrl &&
    !isKnownAppLogoUrl(coverUrl) &&
    !isVideoUrl(coverUrl) &&
    !(isSvgAny(coverUrl) || urlContainsSvgMarker(coverUrl))
  ) {
    return { kind: "image", url: coverUrl, hasVideo: false, sourceField: "cover.url" };
  }

  const legacy = resolveLegacyCoverUrl(route);
  if (legacy && !isKnownAppLogoUrl(legacy) && !isVideoUrl(legacy) && !(isSvgAny(legacy) || urlContainsSvgMarker(legacy))) {
    return { kind: "image", url: legacy, hasVideo: false, sourceField: "legacy" };
  }

  const stopPick = pickStopCoverCandidate(route);
  if (
    stopPick.url &&
    !isKnownAppLogoUrl(stopPick.url) &&
    !isVideoUrl(stopPick.url) &&
    !(isSvgAny(stopPick.url) || urlContainsSvgMarker(stopPick.url))
  ) {
    return {
      kind: "image",
      url: stopPick.url,
      hasVideo: !!stopPick.fromVideoPoster,
      sourceField: "stopMedia",
      stopId: stopPick.stopId || "",
    };
  }

  return { kind: "default", url: "", hasVideo: false, sourceField: "default" };
}

function buildRoutePrefill(route) {
  const id = route?.id ? String(route.id) : "";

  const title =
    (route?.title && route.title.toString().trim()) ||
    (route?.raw?.title && route.raw.title.toString().trim()) ||
    (route?.raw?.name && route.raw.name.toString().trim()) ||
    (route?.name && route.name.toString().trim()) ||
    "Rota";

  const distanceMeters =
    typeof route?.stats?.distanceMeters === "number" && Number.isFinite(route.stats.distanceMeters)
      ? route.stats.distanceMeters
      : typeof route?.stats?.distanceM === "number" && Number.isFinite(route.stats.distanceM)
      ? route.stats.distanceM
      : typeof route?.totalDistanceM === "number" && Number.isFinite(route.totalDistanceM)
      ? route.totalDistanceM
      : typeof route?.distanceMeters === "number" && Number.isFinite(route.distanceMeters)
      ? route.distanceMeters
      : typeof route?.distance === "number" && Number.isFinite(route.distance)
      ? route.distance
      : null;

  const durationSeconds =
    typeof route?.stats?.durationSeconds === "number" && Number.isFinite(route.stats.durationSeconds)
      ? route.stats.durationSeconds
      : typeof route?.stats?.durationMs === "number" && Number.isFinite(route.stats.durationMs)
      ? Math.round(route.stats.durationMs / 1000)
      : typeof route?.durationSeconds === "number" && Number.isFinite(route.durationSeconds)
      ? route.durationSeconds
      : typeof route?.durationMs === "number" && Number.isFinite(route.durationMs)
      ? Math.round(route.durationMs / 1000)
      : typeof route?.duration === "number" && Number.isFinite(route.duration)
      ? route.duration
      : null;

  const ratingAvg =
    typeof route?.ratingAvg === "number" && Number.isFinite(route.ratingAvg)
      ? route.ratingAvg
      : typeof route?.avgRating === "number" && Number.isFinite(route.avgRating)
      ? route.avgRating
      : typeof route?.raw?.ratingAvg === "number" && Number.isFinite(route.raw.ratingAvg)
      ? route.raw.ratingAvg
      : null;

  const ratingCount =
    typeof route?.ratingCount === "number" && Number.isFinite(route.ratingCount)
      ? route.ratingCount
      : typeof route?.raw?.ratingCount === "number" && Number.isFinite(route.raw.ratingCount)
      ? route.raw.ratingCount
      : null;

  const areas = route?.areas ?? route?.raw?.areas ?? null;
  const tags = route?.tags ?? route?.raw?.tags ?? null;

  const prefill = {
    id,
    title,
    totalDistanceM: typeof distanceMeters === "number" ? distanceMeters : null,
    durationMs: typeof durationSeconds === "number" ? durationSeconds * 1000 : null,
    ratingAvg: typeof ratingAvg === "number" ? ratingAvg : null,
    ratingCount: typeof ratingCount === "number" ? ratingCount : null,
    areas,
    tags,
  };

  if (Array.isArray(route?.stopsPreview)) prefill.stopsPreview = route.stopsPreview;
  if (route?.cover && typeof route.cover === "object") prefill.cover = route.cover;

  if (typeof route?.coverUrl === "string") prefill.coverUrl = route.coverUrl;
  if (typeof route?.thumbnailUrl === "string") prefill.thumbnailUrl = route.thumbnailUrl;

  if (route?.visibility != null) prefill.visibility = route.visibility;
  if (route?.ownerId != null) prefill.ownerId = route.ownerId;

  return prefill;
}

function isPlainObject(x) {
  return !!x && typeof x === "object" && (x.constructor === Object || Object.getPrototypeOf(x) === Object.prototype);
}

function buildCoverFieldsSnapshot(route) {
  const raw = route?.raw;
  const pick = (v) => (isNonEmptyString(v) ? String(v).trim() : "");
  return {
    cover_kind: pick(route?.cover?.kind),
    cover_url: pick(route?.cover?.url),
    cover_stopId: pick(route?.cover?.stopId),
    cover_mediaId: pick(route?.cover?.mediaId),
    cover_source: pick(route?.cover?.source),
    cover_sourceField: pick(route?.cover?.sourceField),
    cover_fromVideoPoster: route?.cover?.fromVideoPoster === true,

    coverUrl: pick(route?.coverUrl),
    coverPhotoUrl: pick(route?.coverPhotoUrl),
    coverImageUrl: pick(route?.coverImageUrl),
    previewUrl: pick(route?.previewUrl),
    thumbnailUrl: pick(route?.thumbnailUrl),
    mediaUrl: pick(route?.mediaUrl),

    raw_coverUrl: pick(raw?.coverUrl),
    raw_previewUrl: pick(raw?.previewUrl),
    raw_thumbnailUrl: pick(raw?.thumbnailUrl),
    raw_mediaUrl: pick(raw?.mediaUrl),
  };
}

function printRouteTileProof({ route, rawTitle, smartTitleProof, coverCandidate, imgSrc, imgLoadEvent }) {
  if (!__DEV__) return;
  if (!route) return;

  const sp = route?.stopsPreview;
  const spLen = Array.isArray(sp) ? sp.length : 0;
  const spFirst = spLen ? sp[0] : null;

  const raw = route?.raw;
  const rawPlain = isPlainObject(raw);
  const rawSp = raw?.stopsPreview;
  const rawSpLen = Array.isArray(rawSp) ? rawSp.length : 0;

  const covers = buildCoverFieldsSnapshot(route);

  // eslint-disable-next-line no-console
  console.groupCollapsed("RouteTileProof");
  // eslint-disable-next-line no-console
  console.log("1) route.id:", route?.id);
  // eslint-disable-next-line no-console
  console.log("2) route.title/name:", { title: route?.title, name: route?.name, rawTitle });
  // eslint-disable-next-line no-console
  console.log("3) route.stopsPreview:", { has: spLen > 0, length: spLen, first: spFirst });
  // eslint-disable-next-line no-console
  console.log("4) route.raw plain object mi?", { rawPlain, hasRaw: !!raw, rawStopsPreviewLen: rawSpLen });
  // eslint-disable-next-line no-console
  console.log("5) cover alanları (cover + legacy + raw):", covers);
  // eslint-disable-next-line no-console
  console.log("6) pickCoverCandidate(route):", {
    kind: coverCandidate?.kind,
    url: coverCandidate?.url,
    sourceField: coverCandidate?.sourceField,
    stopId: coverCandidate?.stopId || "",
  });
  // eslint-disable-next-line no-console
  console.log("7) imgSrc (<img src>):", imgSrc || "");
  // eslint-disable-next-line no-console
  console.log("8) img olay:", imgLoadEvent || "pending");
  // eslint-disable-next-line no-console
  console.groupEnd();
}

function LockedRoutesCard({ variant = "login_required" }) {
  const title = "Rotalar gizli";
  const subtitle = variant === "login_required" ? "Görmek için giriş yap." : "Bu rotaları görüntülemek için yetkin yok.";

  const mediaWrapStyle = {
    position: "relative",
    width: "100%",
    height: 220,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#0b1220",
  };

  const placeholderStyle = {
    position: "absolute",
    inset: 0,
    borderRadius: 18,
    background:
      "radial-gradient(160px 140px at 20% 20%, rgba(255,255,255,0.18), transparent 62%), linear-gradient(135deg, rgba(10,10,12,1) 0%, rgba(17,24,39,1) 45%, rgba(15,23,42,1) 100%)",
  };

  return (
    <div className="profile-routes-list" aria-label="Rotalar kilitli" data-route-skin="manus">
      <div className="profile-route-tile" role="note" aria-label={`${title}. ${subtitle}`}>
        <div className="profile-route-tile-media" aria-hidden="true" style={mediaWrapStyle}>
          <div className="profile-route-tile-placeholder" style={placeholderStyle} />
        </div>

        <div className="profile-route-tile-badges" aria-hidden="true">
          <div
            className="profile-route-tile-badge profile-route-tile-badge--left"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="lock" size={18} weight="fill" />
          </div>
        </div>

        <div className="profile-route-tile-overlay" aria-hidden="true">
          <div className="profile-route-tile-meta">{title}</div>
          <div className="profile-route-tile-title">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

function ManusRouteCardTile({ route, onClick, isProofTarget, onProofLoadEvent }) {
  const rid = route?.id ? String(route.id) : "";

  const rawTitle =
    (route?.title && route.title.toString().trim()) ||
    (route?.raw?.title && route.raw.title.toString().trim()) ||
    (route?.raw?.name && route.raw.name.toString().trim()) ||
    (route?.name && route.name.toString().trim()) ||
    "Adsız rota";

  const smartTitleProof = buildSmartTitleProof(route, rawTitle);
  const title = smartTitleProof.smartTitle;

  const coverCandidate = pickCoverCandidate(route);
  const resolved = useResolvedMediaUrl(coverCandidate?.url || "");
  const coverResolved = resolved?.ok && resolved?.status === "ok" ? resolved.url : "";

  const cityOrTag = inferCityOrTag(route);
  const authorName = inferAuthorName(route);

  const ratingAvg =
    toFiniteNumber(route?.ratingAvg) ??
    toFiniteNumber(route?.avgRating) ??
    toFiniteNumber(route?.raw?.ratingAvg) ??
    0;

  const distanceText = formatDistanceKmFromRoute(route) || "—";
  const durationText = formatDurationFromRoute(route) || "—";

  const viewsN = extractMetric(route, [
    "views",
    "viewCount",
    "viewsCount",
    "metrics.views",
    "metrics.viewCount",
    "metrics.viewsCount",
  ]);
  const savesN = extractMetric(route, [
    "saves",
    "saveCount",
    "savesCount",
    "bookmarks",
    "bookmarkCount",
    "metrics.saves",
    "metrics.saveCount",
    "metrics.savesCount",
  ]);

  const viewsText = formatCompactCount(viewsN) || "—";
  const savesText = formatCompactCount(savesN) || "—";

  return (
    <RouteCardManusMobile
      title={title}
      coverUrl={coverResolved || ""}
      cityOrTag={cityOrTag}
      authorName={authorName}
      ratingAvg={ratingAvg}
      distanceText={distanceText}
      durationText={durationText}
      viewsText={viewsText}
      savesText={savesText}
      onClick={onClick}
      onCoverLoadEvent={(evt, src) => {
        if (!isProofTarget) return;
        try {
          onProofLoadEvent?.(evt, src);
        } catch {}
      }}
      data-route-id={rid}
    />
  );
}

/* ===========================
   ✅ ARGE7 — FAB → Direkt Builder helpers
   =========================== */

function tryNavigateToMap() {
  try {
    if (typeof window === "undefined") return false;
    const w = window;

    // (Varsa) doğrudan “map aç” fonksiyonu
    const navFns = [w.__MYLASA_OPEN_MAP__, w.__MYLASA_NAVIGATE_MAP__, w.__MYLASA_GO_MAP__].filter(Boolean);

    const fn = navFns.find((f) => typeof f === "function");
    if (fn) {
      try {
        fn({ source: "profile_routes_fab" });
      } catch {
        fn();
      }
      return true;
    }

    // Event tabanlı entegrasyon (listener varsa çalışır, yoksa no-op)
    try {
      w.dispatchEvent(new CustomEvent("mylasa:openMap", { detail: { source: "profile_routes_fab" } }));
      return true;
    } catch {}

    try {
      w.dispatchEvent(new CustomEvent("mylasa:navigate", { detail: { to: "map", source: "profile_routes_fab" } }));
      return true;
    } catch {}

    return false;
  } catch {
    return false;
  }
}

export default function ProfileRoutesMobile({ userId, isSelf = false, viewerId = null, isFollowing = false }) {
  const { routes, loading, loadingMore, hasMore, error, loadMore, isEmpty, accessStatus } = useUserRoutes(userId, {
    pageSize: 20,
    isSelf,
    isFollowing,
    viewerId,
  });

  const proofRouteIdRef = useRef("");
  const [proofImgLoadEvent, setProofImgLoadEvent] = useState(""); // load | error_all
  const [proofImgSrc, setProofImgSrc] = useState("");

  // ✅ ARGE7 — FAB spam guard + toast
  const [fabDisabled, setFabDisabled] = useState(false);
  const fabDisableTimerRef = useRef(0);

  const [createToast, setCreateToast] = useState("");
  const toastRef = useRef({ tmr: 0 });

  const showToast = useCallback((msg, ms = 2200) => {
    try {
      setCreateToast(String(msg || ""));
    } catch {}
    try {
      if (toastRef.current.tmr) clearTimeout(toastRef.current.tmr);
    } catch {}
    toastRef.current.tmr = window.setTimeout(() => {
      try {
        setCreateToast("");
      } catch {}
      toastRef.current.tmr = 0;
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (toastRef.current.tmr) clearTimeout(toastRef.current.tmr);
      } catch {}
      try {
        toastRef.current.tmr = 0;
      } catch {}
      try {
        if (fabDisableTimerRef.current) clearTimeout(fabDisableTimerRef.current);
      } catch {}
      fabDisableTimerRef.current = 0;
    };
  }, []);

  const handleClick = useCallback((route) => {
    if (!route || !route.id) return;
    const id = String(route.id);

    const routePrefill = buildRoutePrefill(route);

    try {
      window.dispatchEvent(
        new CustomEvent("open-route-modal", {
          detail: { routeId: id, route: routePrefill, source: "profile" },
        })
      );
    } catch {}
  }, []);

  const proofTarget = useMemo(() => {
    if (!routes || routes.length === 0) return null;
    return routes[0] || null;
  }, [routes]);

  useEffect(() => {
    if (!__DEV__) return;
    if (!proofTarget) return;

    const rid = proofTarget?.id ? String(proofTarget.id) : "";
    if (!rid) return;

    if (__devProofLoggedRouteIds.has(rid)) return;

    if (!proofRouteIdRef.current) proofRouteIdRef.current = rid;

    if (!proofImgLoadEvent && !proofImgSrc) return;

    const rawTitle =
      (proofTarget?.title && proofTarget.title.toString().trim()) ||
      (proofTarget?.raw?.title && proofTarget.raw.title.toString().trim()) ||
      (proofTarget?.raw?.name && proofTarget.raw.name.toString().trim()) ||
      (proofTarget?.name && proofTarget.name.toString().trim()) ||
      "Adsız rota";

    const smartTitleProof = buildSmartTitleProof(proofTarget, rawTitle);
    const coverCandidate = pickCoverCandidate(proofTarget);

    printRouteTileProof({
      route: proofTarget,
      rawTitle,
      smartTitleProof,
      coverCandidate,
      imgSrc: proofImgSrc,
      imgLoadEvent: proofImgLoadEvent,
    });

    __devProofLoggedRouteIds.add(rid);
  }, [proofTarget, proofImgSrc, proofImgLoadEvent]);

  const canShowFab = useMemo(() => {
    // yalnızca profil sahibi
    if (!isSelf) return false;

    // kilit ekranlarında görünmesin
    if (accessStatus === "login_required" || accessStatus === "forbidden") return false;

    return true;
  }, [isSelf, accessStatus]);

  const handleFabClick = useCallback(() => {
    if (fabDisabled) return;

    // ✅ 700ms spam guard
    setFabDisabled(true);
    try {
      if (fabDisableTimerRef.current) clearTimeout(fabDisableTimerRef.current);
    } catch {}
    fabDisableTimerRef.current = window.setTimeout(() => {
      setFabDisabled(false);
      fabDisableTimerRef.current = 0;
    }, 700);

    // (A) Launch token set (MapMobile consume ediyor)
    try {
      window.__MYLASA_ROUTE_BUILDER_LAUNCH__ = { ts: Date.now(), source: "profileFab" };
    } catch {}

    // (B) Map ekranına/tab’ına geç (mevcut mekanizma)
    const navOk = tryNavigateToMap();

    // (C) soft feedback (spam değil)
    if (!navOk) {
      showToast("Harita girişi bulunamadı.", 2400);
    }
  }, [fabDisabled, showToast]);

  const fabNode = canShowFab ? (
    <>
      <button
        type="button"
        className="prm-createFab"
        onClick={handleFabClick}
        aria-label="Rota oluştur"
        disabled={fabDisabled}
      >
        <span className="prm-createFabPlus" aria-hidden="true">
          +
        </span>
      </button>

      {!!createToast && <div className="prm-createToast">{createToast}</div>}
    </>
  ) : null;

  if (!userId) {
    return (
      <>
        <div className="profile-routes-empty">
          <span>Profil yükleniyor…</span>
        </div>
        {fabNode}
      </>
    );
  }

  // ✅ EMİR 5 — kilit modları
  if (accessStatus === "login_required") {
    return <LockedRoutesCard variant="login_required" />;
  }
  if (accessStatus === "forbidden") {
    return <LockedRoutesCard variant="forbidden" />;
  }

  if (error) {
    return (
      <>
        <div className="profile-routes-empty">
          <span>Rotalar yüklenirken bir sorun oluştu.</span>
        </div>
        {fabNode}
      </>
    );
  }

  if (loading && !routes.length) {
    return (
      <>
        <div className="profile-routes-list" data-route-skin="manus">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="profile-routes-skel" />
          ))}
        </div>
        {fabNode}
      </>
    );
  }

  if (isEmpty) {
    return (
      <>
        <div className="profile-routes-empty">
          <span>
            {isSelf
              ? "Henüz kaydettiğin bir rotan yok. Haritada bir rota oluşturduğunda burada görünecek."
              : "Bu kullanıcının henüz paylaştığı bir rota yok."}
          </span>
        </div>
        {fabNode}
      </>
    );
  }

  return (
    <>
      <div className="profile-routes-list" data-route-skin="manus">
        {routes.map((route) => {
          const rid = route?.id ? String(route.id) : "";
          const isProofTarget = !!(proofRouteIdRef.current && rid === proofRouteIdRef.current);

          return (
            <div key={rid || route.id} className="profile-route-cardWrap">
              <ManusRouteCardTile
                route={route}
                onClick={() => handleClick(route)}
                isProofTarget={isProofTarget}
                onProofLoadEvent={(evt, src) => {
                  if (!isProofTarget) return;
                  setProofImgLoadEvent(evt || "");
                  setProofImgSrc(src || "");
                }}
              />
            </div>
          );
        })}

        {hasMore && (
          <div className="profile-routes-more">
            <button type="button" onClick={loadMore} disabled={loadingMore} className="profile-routes-more-btn">
              {loadingMore ? "Yükleniyor…" : "Daha fazla göster"}
            </button>
          </div>
        )}
      </div>

      {fabNode}
    </>
  );
}