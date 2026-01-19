// FILE: src/ProfileRoutesMobile.js
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ProfileRoutesMobile.css";
import useUserRoutes from "./hooks/useUserRoutes";

import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";

const __DEV__ = process.env.NODE_ENV !== "production";
const DEFAULT_ROUTE_COVER_URL = (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg";

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

function isHttpHttpsOrDataUrl(v) {
  const s = (v || "").toString().trim();
  if (!s) return false;
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

  // ✅ "/foo.png" public asset olabilir → storage sanma
  if (s.startsWith("/")) return false;

  // relative storage path hissi
  if (s.includes("\\\\")) return true;
  if (s.includes("..")) return true;
  if (s.includes("/")) return true;

  return false;
}

function parseFirebaseStorageHttpUrlToGs(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = (u.hostname || "").toLowerCase();

    // firebasestorage.googleapis.com/v0/b/<bucket>/o/<pathEncoded>?...
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

    // storage.googleapis.com/<bucket>/<path>
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
      if (typeof window !== "undefined" && window.location && window.location.origin) {
        return `${window.location.origin}${s}`;
      }
    } catch {
      // no-op
    }
    return s;
  }

  return s;
}

// --------- Storage URL resolver (cache + proof logs) ---------
const __resolvedUrlCache = new Map(); // key -> { ok:boolean, url:string, errorCode?:string }
const __inflight = new Map(); // key -> Promise

async function resolveToHttpsUrl(input) {
  const raw0 = (input || "").toString().trim();
  if (!raw0) return "";

  // data:image ise direkt kabul
  if (/^data:image\//i.test(raw0)) return raw0;

  // ✅ "/route-default-cover.jpg" ya da "/app/route-default-cover.jpg" gibi public asset → same-origin absolute URL
  if (raw0.startsWith("/")) {
    try {
      if (typeof window !== "undefined" && window.location && window.location.origin) {
        return `${window.location.origin}${raw0}`;
      }
    } catch {
      // no-op
    }
    return raw0;
  }

  // http(s) ise:
  // - Firebase Storage download URL ise mümkünse refresh (token/rules)
  // - değilse aynen kullan
  if (/^https?:\/\//i.test(raw0)) {
    const gsFromHttp = parseFirebaseStorageHttpUrlToGs(raw0);
    if (!gsFromHttp) return raw0;

    try {
      const storage = getStorage();
      const r = storageRef(storage, gsFromHttp);
      const https = await getDownloadURL(r);
      return typeof https === "string" && /^https?:\/\//i.test(https) ? https : raw0;
    } catch (e) {
      const code = e?.code ? String(e.code) : "unknown";

      // ✅ yetki/permission spam kır (tek sefer warn)
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

  // gs:// veya relative storage path
  if (isGsUrl(raw0) || looksLikeRelativeStoragePath(raw0)) {
    const base = raw0.split(/[?#]/)[0];
    const path = base.startsWith("/") ? base.slice(1) : base;

    try {
      const storage = getStorage();
      const r = storageRef(storage, path); // path hem gs:// hem relative kabul
      const https = await getDownloadURL(r);
      return typeof https === "string" && /^https?:\/\//i.test(https) ? https : "";
    } catch (e) {
      const code = e?.code ? String(e.code) : "unknown";

      // ✅ yetki/permission spam kır (tek sefer warn)
      if (
        code === "permission-denied" ||
        code === "storage/unauthorized" ||
        code === "storage/unauthenticated"
      ) {
        warnOnce(
          `dlwarn_gs_${code}`,
          `[ProfileRoutesMobile] getDownloadURL blocked (${code}) — default cover kullanılacak.`
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
    if (cached) return { ...cached, input: key, status: cached.ok ? "ok" : "fail" };
    return { input: key, status: key ? "idle" : "empty", url: "", ok: false, errorCode: "" };
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
      kmFromStats >= 10 ? Math.round(kmFromStats) : Math.round(kmFromStats * 10) / 10;
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

function getAudienceIcon(visibilityRaw) {
  const raw = (visibilityRaw || "").toString().toLowerCase();
  if (!raw || raw === "public" || raw === "everyone") return "🌍";
  if (
    raw.includes("follower") ||
    raw === "friends" ||
    raw === "followers_only" ||
    raw === "followers-only" ||
    raw === "followers"
  )
    return "👥";
  if (raw === "private" || raw === "only_me") return "🔒";
  return "🔒";
}

function isDefaultRouteTitle(titleRaw) {
  const t = (titleRaw || "").toString().trim();
  if (!t) return true;
  if (!/^rota\b/i.test(t)) return false;

  return /(\d{1,2}:\d{2})|(\d{1,2}[./-]\d{1,2})|(\d{4}[./-]\d{1,2}[./-]\d{1,2})|\d{2,}/.test(
    t
  );
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
  if (typeof raw?.place === "string" && raw.place.trim())
    return { name: raw.place.trim(), source: "raw.place(string)" };

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

  // ✅ tek durak / aynı isim → ok yok
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

function inferStopCount(route) {
  const direct =
    route?.stats?.stopCount ??
    route?.stats?.stops ??
    route?.stopCount ??
    route?.stopsCount ??
    route?.durakSayisi ??
    route?.raw?.stats?.stopCount ??
    route?.raw?.stats?.stops ??
    route?.raw?.stopCount ??
    route?.raw?.stopsCount ??
    null;

  const n = toFiniteNumber(direct);
  if (n != null && n > 0) return Math.round(n);

  const stops = getStopsArray(route);
  return stops.length;
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
          if (posterStr && !isVideoUrl(posterStr) && !isKnownAppLogoUrl(posterStr)) {
            return { url: posterStr, fromVideoPoster: true };
          }
          continue;
        }

        const cand = urlStr || posterStr;
        if (cand && !isVideoUrl(cand) && !isKnownAppLogoUrl(cand)) return { url: cand, fromVideoPoster: false };
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

// ✅ Kapak (EMİR): cover.url → (cover meta varsa onu oku) → legacy → stopMedia → default
function pickCoverCandidate(route) {
  if (!route)
    return {
      kind: "default",
      url: DEFAULT_ROUTE_COVER_URL,
      hasVideo: false,
      sourceField: "default",
    };

  // (A0) Model cover meta’sı (useUserRoutes / routeCardModel set edebilir)
  const coverObj = route?.cover && typeof route.cover === "object" ? route.cover : null;
  const coverMetaUrl = isNonEmptyString(coverObj?.url) ? String(coverObj.url).trim() : "";
  const coverMetaField = isNonEmptyString(coverObj?.sourceField) ? String(coverObj.sourceField).trim() : "";
  const coverMetaHasVideo = !!coverObj?.fromVideoPoster || !!coverObj?.hasVideoPoster;

  if (coverMetaUrl && !isKnownAppLogoUrl(coverMetaUrl) && !isVideoUrl(coverMetaUrl)) {
    return {
      kind: "image",
      url: coverMetaUrl,
      hasVideo: coverMetaHasVideo,
      sourceField: coverMetaField || "cover.url",
      stopId: isNonEmptyString(coverObj?.stopId) ? String(coverObj.stopId) : "",
    };
  }

  // (A) Yeni standart: route.cover.url (tek doğru kaynak)
  const coverUrl = isNonEmptyString(route?.cover?.url) ? String(route.cover.url).trim() : "";
  if (coverUrl && !isKnownAppLogoUrl(coverUrl) && !isVideoUrl(coverUrl)) {
    return { kind: "image", url: coverUrl, hasVideo: false, sourceField: "cover.url" };
  }

  // (B) Legacy alanlar (read-only geriye uyum)
  const legacy = resolveLegacyCoverUrl(route);
  if (legacy && !isKnownAppLogoUrl(legacy) && !isVideoUrl(legacy)) {
    return { kind: "image", url: legacy, hasVideo: false, sourceField: "legacy" };
  }

  // (C) Otomatik fallback: ilk durak görseli / video poster
  const stopPick = pickStopCoverCandidate(route);
  if (stopPick.url && !isKnownAppLogoUrl(stopPick.url) && !isVideoUrl(stopPick.url)) {
    return {
      kind: "image",
      url: stopPick.url,
      hasVideo: !!stopPick.fromVideoPoster, // ✅ sadece video posteri ise play rozeti
      sourceField: "stopMedia",
      stopId: stopPick.stopId || "",
    };
  }

  // (D) Default placeholder
  return { kind: "default", url: DEFAULT_ROUTE_COVER_URL, hasVideo: false, sourceField: "default" };
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

  // ✅ cover standart objeyi taşı (RouteDetail ilk render “pırıl pırıl” olsun)
  if (route?.cover && typeof route.cover === "object") prefill.cover = route.cover;

  // legacy alanlar (geriye uyum / eski okuyucular)
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
  console.log("8) img olay:", imgLoadEvent || "pending", "→ DevTools > Network’te hem kapak hem default request’i doğrula.");
  // eslint-disable-next-line no-console
  console.log("9) Network tab kanıtı:", "DevTools > Network > Img request → status (200/403/404) burada doğrula.");
  // eslint-disable-next-line no-console
  console.log("10) Başlık start/end kaynağı:", {
    smartTitle: smartTitleProof?.smartTitle,
    startName: smartTitleProof?.startName,
    endName: smartTitleProof?.endName,
    startSource: smartTitleProof?.startSource,
    endSource: smartTitleProof?.endSource,
  });
  // eslint-disable-next-line no-console
  console.groupEnd();
}

function RouteTileMedia({ routeId, coverCandidate, onLoadEvent }) {
  const rawInput = coverCandidate?.url || "";
  const resolved = useResolvedMediaUrl(rawInput);

  const fallbackAbs = useMemo(() => toSameOriginAbsoluteUrl(DEFAULT_ROUTE_COVER_URL), []);
  const [imgSrc, setImgSrc] = useState("");

  const [imgOk, setImgOk] = useState(false);
  const [imgFinalFailed, setImgFinalFailed] = useState(false);

  const didFallbackRef = useRef(false);
  const reportedRef = useRef(false);

  useEffect(() => {
    setImgOk(false);
    setImgFinalFailed(false);
    didFallbackRef.current = false;
    reportedRef.current = false;
    setImgSrc("");
  }, [rawInput, resolved?.url]);

  useEffect(() => {
    // primary yoksa direkt default
    if (!rawInput) {
      didFallbackRef.current = true;
      setImgSrc(fallbackAbs);
      return;
    }

    if (resolved?.status === "ok" && resolved?.ok && isHttpHttpsOrDataUrl(resolved.url)) {
      setImgSrc(resolved.url);
      return;
    }

    // resolve fail → default dene (EMİR-2: gradient'te kalma)
    if (resolved?.status === "fail") {
      didFallbackRef.current = true;
      setImgSrc(fallbackAbs);
    }
  }, [rawInput, resolved?.status, resolved?.ok, resolved?.url, fallbackAbs]);

  const shouldRenderImg = isHttpHttpsOrDataUrl(imgSrc) && !imgFinalFailed;

  const placeholderStyle = {
    position: "absolute",
    inset: 0,
    borderRadius: 14,
    background:
      "linear-gradient(135deg, rgba(245,245,245,1) 0%, rgba(235,235,235,1) 40%, rgba(250,250,250,1) 100%)",
  };

  const mediaWrapStyle = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "#f2f2f2",
  };

  return (
    <div className="profile-route-tile-media" aria-hidden="true" data-route-id={routeId} style={mediaWrapStyle}>
      <div className="profile-route-tile-placeholder" style={placeholderStyle} />

      {shouldRenderImg ? (
        <img
          src={imgSrc}
          alt=""
          loading="lazy"
          decoding="async"
          className="profile-route-tile-img"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: imgOk ? 1 : 0,
            transition: "opacity 180ms ease",
          }}
          onLoad={() => {
            setImgOk(true);
            reportedRef.current = true;
            onLoadEvent?.(didFallbackRef.current ? "fallback_load" : "load", imgSrc);
          }}
          onError={() => {
            // 1) primary patladı → default'a düş (tek sefer)
            if (!didFallbackRef.current) {
              didFallbackRef.current = true;
              setImgOk(false);
              setImgFinalFailed(false);
              setImgSrc(fallbackAbs);
              return;
            }

            // 2) default da patladı → total fail
            setImgOk(false);
            setImgFinalFailed(true);
            if (!reportedRef.current) {
              reportedRef.current = true;
              onLoadEvent?.("error_all", imgSrc);
            } else {
              onLoadEvent?.("error_all", imgSrc);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function LockedRoutesCard({ variant = "login_required" }) {
  const title = "Rotalar gizli";
  const subtitle =
    variant === "login_required"
      ? "Görmek için giriş yap."
      : "Bu rotaları görüntülemek için yetkin yok.";

  const mediaWrapStyle = {
    position: "relative",
    width: "100%",
    height: 220,
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "#f2f2f2",
  };

  const placeholderStyle = {
    position: "absolute",
    inset: 0,
    borderRadius: 14,
    background:
      "linear-gradient(135deg, rgba(245,245,245,1) 0%, rgba(235,235,235,1) 40%, rgba(250,250,250,1) 100%)",
  };

  return (
    <div className="profile-routes-list" aria-label="Rotalar kilitli">
      <div className="profile-route-tile" role="note" aria-label={`${title}. ${subtitle}`}>
        <div className="profile-route-tile-media" aria-hidden="true" style={mediaWrapStyle}>
          <div className="profile-route-tile-placeholder" style={placeholderStyle} />
        </div>

        <div className="profile-route-tile-badges" aria-hidden="true">
          <div className="profile-route-tile-badge profile-route-tile-badge--left">
            <span className="profile-route-tile-emoji">🔒</span>
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

export default function ProfileRoutesMobile({ userId, isSelf = false, viewerId = null, isFollowing = false }) {
  const { routes, loading, loadingMore, hasMore, error, loadMore, isEmpty, accessStatus } = useUserRoutes(userId, {
    pageSize: 20,
    isSelf,
    isFollowing,
    viewerId,
  });

  const proofRouteIdRef = useRef("");
  const [proofImgLoadEvent, setProofImgLoadEvent] = useState(""); // load | fallback_load | error_all
  const [proofImgSrc, setProofImgSrc] = useState("");

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
    } catch {
      // no-op
    }
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

    // ✅ Dev proof: route bazlı tek sefer
    if (__devProofLoggedRouteIds.has(rid)) return;

    if (!proofRouteIdRef.current) proofRouteIdRef.current = rid;

    // event gelmeden basmayalım
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

  if (!userId) {
    return (
      <div className="profile-routes-empty">
        <span>Profil yükleniyor…</span>
      </div>
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
      <div className="profile-routes-empty">
        <span>Rotalar yüklenirken bir sorun oluştu.</span>
      </div>
    );
  }

  if (loading && !routes.length) {
    return (
      <div className="profile-routes-list">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="profile-routes-skel" />
        ))}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="profile-routes-empty">
        <span>
          {isSelf
            ? "Henüz kaydettiğin bir rotan yok. Haritada bir rota oluşturduğunda burada görünecek."
            : "Bu kullanıcının henüz paylaştığı bir rota yok."}
        </span>
      </div>
    );
  }

  return (
    <div className="profile-routes-list">
      {routes.map((route) => {
        const rid = route?.id ? String(route.id) : "";

        const rawTitle =
          (route?.title && route.title.toString().trim()) ||
          (route?.raw?.title && route.raw.title.toString().trim()) ||
          (route?.raw?.name && route.raw.name.toString().trim()) ||
          (route?.name && route.name.toString().trim()) ||
          "Adsız rota";

        const smartTitleProof = buildSmartTitleProof(route, rawTitle);
        const smartTitle = smartTitleProof.smartTitle;

        const stopCount = inferStopCount(route);
        const distanceText = formatDistanceKmFromRoute(route);

        const infoText =
          stopCount > 0 && distanceText
            ? `📍 ${stopCount} durak · 📏 ${distanceText}`
            : stopCount > 0
            ? `📍 ${stopCount} durak`
            : distanceText
            ? `📏 ${distanceText}`
            : "";

        const coverCandidate = pickCoverCandidate(route);
        const visibilityIcon = getAudienceIcon(route?.visibility);

        return (
          <button
            key={rid || route.id}
            type="button"
            className="profile-route-tile"
            onClick={() => handleClick(route)}
            aria-label={`${smartTitle} rotasını aç`}
          >
            <RouteTileMedia
              routeId={rid}
              coverCandidate={coverCandidate}
              onLoadEvent={(evt, src) => {
                if (proofRouteIdRef.current && rid === proofRouteIdRef.current) {
                  setProofImgLoadEvent(evt || "");
                  setProofImgSrc(src || "");
                }
              }}
            />

            <div className="profile-route-tile-badges" aria-hidden="true">
              <div className="profile-route-tile-badge profile-route-tile-badge--left">
                <span className="profile-route-tile-emoji">{visibilityIcon}</span>
              </div>

              {/* ✅ sadece video posteri ise */}
              {coverCandidate?.hasVideo && (
                <div className="profile-route-tile-badge profile-route-tile-badge--right">▶</div>
              )}
            </div>

            <div className="profile-route-tile-overlay" aria-hidden="true">
              {infoText && <div className="profile-route-tile-meta">{infoText}</div>}
              <div className="profile-route-tile-title">{smartTitle}</div>
            </div>
          </button>
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
  );
}
