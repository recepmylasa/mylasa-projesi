// src/ProfileRoutesMobile.js
// Profil "Rotalarım" sekmesi – profil sahibine ait rotaları premium grid olarak listeler (read-only).
// Kapak 3 seviye: (A) user cover -> (B) first stop / route media -> (C) placeholder (asla beyaz yok)
// - <img src> ASLA gs:// / storage path / relative path olmaz; her zaman http(s):// veya data:image:
// - Kanıt logu: RouteTileProof (10 satır)

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ProfileRoutesMobile.css";
import useUserRoutes from "./hooks/useUserRoutes";

import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";

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

function isKnownAppLogoUrl(v) {
  const base = stripQueryAndHash(v).toLowerCase();
  if (!base) return false;
  const file = base.split("/").pop();
  return file === "mylasa-logo.png" || file === "mylasa-logo.svg";
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
  const s = s0.split(/[?#]/)[0]; // küçük sağlamlık

  if (isHttpHttpsOrDataUrl(s)) return false;
  if (s.startsWith("gs://")) return true;

  // ✅ "/foo.png" public asset olabilir → storage sanma
  if (s.startsWith("/")) return false;

  // relative path hissi
  if (s.includes("\\\\")) return true;
  if (s.includes("..")) return true;
  if (s.includes("/")) return true;

  return false;
}

function parseFirebaseStorageHttpUrlToGs(urlStr) {
  // firebasestorage.googleapis.com/v0/b/<bucket>/o/<pathEncoded>?...
  try {
    const u = new URL(urlStr);
    const host = (u.hostname || "").toLowerCase();

    if (host.includes("firebasestorage.googleapis.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      // ["v0","b","<bucket>","o","<encoded>"]
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

// --------- Storage URL resolver (cache + proof logs) ---------
const __resolvedUrlCache = new Map(); // key -> { ok:boolean, url:string, errorCode?:string }
const __inflight = new Map(); // key -> Promise

async function resolveToHttpsUrl(input) {
  const raw0 = (input || "").toString().trim();
  if (!raw0) return "";

  // data:image ise direkt kabul
  if (/^data:image\//i.test(raw0)) return raw0;

  // ✅ "/mylasa-logo.png" gibi public asset → same-origin absolute URL
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
    const k = key; // ✅ input referansı yok → exhaustive-deps uyarısı bitti
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
    const fixed = kmFromStats >= 10 ? Math.round(kmFromStats) : Math.round(kmFromStats * 10) / 10;
    return `${fixed} km`;
  }

  const m = s.distanceM ?? s.distanceMeters ?? route.totalDistanceM ?? route.distanceMeters ?? route.distance ?? null;

  const mm = toFiniteNumber(m);
  if (mm == null || mm <= 0) return "";

  const km = mm / 1000;
  const fixed = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${fixed} km`;
}

function getAudienceIcon(visibilityRaw) {
  const raw = (visibilityRaw || "").toString().toLowerCase();
  if (!raw || raw === "public" || raw === "everyone") return "🌍";
  if (raw.includes("follower") || raw === "friends" || raw === "followers_only" || raw === "followers-only" || raw === "followers") return "👥";
  if (raw === "private" || raw === "only_me") return "🔒";
  return "🔒";
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

  const d = toDate(route?.finishedAt || route?.createdAt || route?.raw?.finishedAt || route?.raw?.createdAt || route?.data?.finishedAt || route?.data?.createdAt);
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

function normalizeMediaItem(item) {
  if (!item) return null;

  if (typeof item === "string") {
    const url = item.trim();
    if (!url) return null;
    const type = isVideoUrl(url) ? "video" : "image";
    return { type, url, thumb: null, rawUrl: url };
  }

  const url =
    item.url ||
    item.src ||
    item.mediaUrl ||
    item.downloadURL ||
    item.downloadUrl ||
    item.imageUrl ||
    item.photoUrl ||
    item.videoUrl ||
    item.fileUrl ||
    item.path ||
    item.uri;

  const thumb =
    item.thumbnail ||
    item.thumb ||
    item.poster ||
    item.preview ||
    item.previewUrl ||
    item.thumbnailUrl ||
    item.posterUrl;

  const typeRaw = (item.type || item.mediaType || item.kind || item.mime || "").toString().toLowerCase();

  const urlStr = typeof url === "string" ? url.trim() : "";
  const thumbStr = typeof thumb === "string" ? thumb.trim() : "";

  if (!urlStr && !thumbStr) return null;

  const isVid =
    typeRaw.includes("video") ||
    typeRaw.includes("mp4") ||
    typeRaw.includes("webm") ||
    (urlStr ? isVideoUrl(urlStr) : false);

  return {
    type: isVid ? "video" : "image",
    url: urlStr || thumbStr,
    thumb: thumbStr || null,
    rawUrl: urlStr || null,
  };
}

function collectMediaFromValue(value, out) {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const it of value) {
      const m = normalizeMediaItem(it);
      if (m) out.push(m);
    }
    return;
  }

  if (typeof value === "string") {
    const m = normalizeMediaItem(value);
    if (m) out.push(m);
    return;
  }

  if (typeof value === "object") {
    const packs = [
      value.images,
      value.imageUrls,
      value.photos,
      value.photoUrls,
      value.videos,
      value.videoUrls,
      value.mediaUrls,
      value.urls,
      value.items,
      value.mediaItems,
      value.gallery,
    ].filter(Boolean);

    if (packs.length) {
      for (const p of packs) collectMediaFromValue(p, out);
      return;
    }

    const singles = [
      value.imageUrl,
      value.photoUrl,
      value.videoUrl,
      value.url,
      value.src,
      value.thumbnailUrl,
      value.thumbnail,
      value.poster,
      value.posterUrl,
      value.previewUrl,
      value.mediaUrl,
    ].filter(Boolean);

    for (const s of singles) collectMediaFromValue(s, out);
  }
}

function extractMedia(route) {
  const out = [];
  if (!route) return out;

  const r = route;
  const raw = route.raw || route.data || route.doc || null;
  const data = route.data || route.raw?.data || route.doc?.data || null;

  collectMediaFromValue(r.media, out);
  collectMediaFromValue(r.mediaItems, out);
  collectMediaFromValue(r.gallery, out);
  collectMediaFromValue(r.mediaPreview, out);
  collectMediaFromValue(r.images, out);
  collectMediaFromValue(r.imageUrls, out);
  collectMediaFromValue(r.photos, out);
  collectMediaFromValue(r.photoUrls, out);
  collectMediaFromValue(r.videos, out);
  collectMediaFromValue(r.videoUrls, out);
  collectMediaFromValue(r.mediaUrls, out);

  collectMediaFromValue(raw?.media, out);
  collectMediaFromValue(raw?.mediaItems, out);
  collectMediaFromValue(raw?.gallery, out);
  collectMediaFromValue(raw?.mediaPreview, out);
  collectMediaFromValue(raw?.images, out);
  collectMediaFromValue(raw?.imageUrls, out);
  collectMediaFromValue(raw?.photos, out);
  collectMediaFromValue(raw?.photoUrls, out);
  collectMediaFromValue(raw?.videos, out);
  collectMediaFromValue(raw?.videoUrls, out);
  collectMediaFromValue(raw?.mediaUrls, out);

  collectMediaFromValue(data?.media, out);
  collectMediaFromValue(data?.mediaItems, out);
  collectMediaFromValue(data?.gallery, out);
  collectMediaFromValue(data?.mediaPreview, out);
  collectMediaFromValue(data?.images, out);
  collectMediaFromValue(data?.imageUrls, out);
  collectMediaFromValue(data?.photos, out);
  collectMediaFromValue(data?.photoUrls, out);
  collectMediaFromValue(data?.videos, out);
  collectMediaFromValue(data?.videoUrls, out);
  collectMediaFromValue(data?.mediaUrls, out);

  const lateCandidates = [
    r.coverUrl,
    r.coverPhotoUrl,
    r.coverImageUrl,
    r.coverURL,
    r.thumbnailUrl,
    r.thumbUrl,
    r.previewUrl,
    r.posterUrl,
    r.mediaUrl,
    raw?.coverUrl,
    raw?.coverPhotoUrl,
    raw?.coverImageUrl,
    raw?.thumbnailUrl,
    data?.coverUrl,
    data?.coverPhotoUrl,
    data?.coverImageUrl,
    data?.thumbnailUrl,
  ].filter(Boolean);

  for (const it of lateCandidates) collectMediaFromValue(it, out);

  const stops = getStopsArray(route);
  for (const st of stops) {
    if (!st) continue;

    collectMediaFromValue(st.media, out);
    collectMediaFromValue(st.mediaUrl, out);

    const sraw = st.raw || st.data || null;
    if (sraw) {
      collectMediaFromValue(sraw.media, out);
      collectMediaFromValue(sraw.mediaUrl, out);
      if (sraw.data) {
        collectMediaFromValue(sraw.data.media, out);
        collectMediaFromValue(sraw.data.mediaUrl, out);
      }
    }

    collectMediaFromValue(st.medias, out);
    collectMediaFromValue(st.mediaItems, out);
    collectMediaFromValue(st.gallery, out);
    collectMediaFromValue(st.items, out);
    collectMediaFromValue(st.photos, out);
    collectMediaFromValue(st.photoUrls, out);
    collectMediaFromValue(st.imageUrl, out);
    collectMediaFromValue(st.photoUrl, out);
    collectMediaFromValue(st.thumbnailUrl, out);
    collectMediaFromValue(st.poster, out);
    collectMediaFromValue(st.videoUrl, out);

    collectMediaFromValue(st.images, out);
    collectMediaFromValue(st.imageUrls, out);
    collectMediaFromValue(st.videos, out);
    collectMediaFromValue(st.videoUrls, out);
    collectMediaFromValue(st.mediaUrls, out);

    if (sraw) {
      collectMediaFromValue(sraw.medias, out);
      collectMediaFromValue(sraw.mediaItems, out);
      collectMediaFromValue(sraw.gallery, out);
      collectMediaFromValue(sraw.items, out);
      collectMediaFromValue(sraw.photos, out);
      collectMediaFromValue(sraw.photoUrls, out);
      collectMediaFromValue(sraw.images, out);
      collectMediaFromValue(sraw.imageUrls, out);
      collectMediaFromValue(sraw.videos, out);
      collectMediaFromValue(sraw.videoUrls, out);
      collectMediaFromValue(sraw.mediaUrls, out);
    }
  }

  return out;
}

// ✅ Kapak 3 seviye + sourceField (StaticMap YOK) + "mylasa-logo.png" placeholder sayılır
function pickCoverCandidate(route) {
  if (!route) return { kind: "placeholder", url: "", hasVideo: false, sourceField: "placeholder" };

  // (A) User cover alanları
  const coverFields = [
    ["coverUrl", route.coverUrl],
    ["coverPhotoUrl", route.coverPhotoUrl],
    ["coverImageUrl", route.coverImageUrl],
    ["previewUrl", route.previewUrl],
    ["thumbnailUrl", route.thumbnailUrl],
    ["thumbUrl", route.thumbUrl],
    ["imageUrl", route.imageUrl],
    ["photoUrl", route.photoUrl],
    ["mediaUrl", route.mediaUrl],
    ["raw.coverUrl", route?.raw?.coverUrl],
    ["raw.coverPhotoUrl", route?.raw?.coverPhotoUrl],
    ["raw.coverImageUrl", route?.raw?.coverImageUrl],
    ["raw.previewUrl", route?.raw?.previewUrl],
    ["raw.thumbnailUrl", route?.raw?.thumbnailUrl],
    ["raw.mediaUrl", route?.raw?.mediaUrl],
  ];

  for (const [field, val] of coverFields) {
    if (isNonEmptyString(val)) {
      const url = String(val).trim();
      if (isKnownAppLogoUrl(url)) continue; // ✅ placeholder kabul etme
      const hasVideo = isVideoUrl(url);
      return { kind: hasVideo ? "video" : "image", url, hasVideo, sourceField: field };
    }
  }

  // (B) stop/route media (first image > video thumb)
  const media = extractMedia(route);
  const hasVideo = media.some((m) => m.type === "video");

  const firstImage = media.find((m) => m.type === "image" && m.url && !isKnownAppLogoUrl(m.url));
  if (firstImage) return { kind: "image", url: firstImage.url, hasVideo, sourceField: "media:firstImage" };

  const firstVideo = media.find((m) => m.type === "video" && (m.thumb || m.rawUrl || m.url));
  if (firstVideo) {
    if (firstVideo.thumb && !isKnownAppLogoUrl(firstVideo.thumb)) {
      return { kind: "image", url: firstVideo.thumb, hasVideo: true, sourceField: "media:videoThumb" };
    }
    return { kind: "video", url: firstVideo.rawUrl || firstVideo.url, hasVideo: true, sourceField: "media:videoUrl" };
  }

  // (C) placeholder
  return { kind: "placeholder", url: "", hasVideo: false, sourceField: "placeholder" };
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
  // 1
  // eslint-disable-next-line no-console
  console.log("1) route.id:", route?.id);
  // 2
  // eslint-disable-next-line no-console
  console.log("2) route.title/name:", { title: route?.title, name: route?.name, rawTitle });
  // 3
  // eslint-disable-next-line no-console
  console.log("3) route.stopsPreview:", { has: spLen > 0, length: spLen, first: spFirst });
  // 4
  // eslint-disable-next-line no-console
  console.log("4) route.raw plain object mi?", { rawPlain, hasRaw: !!raw, rawStopsPreviewLen: rawSpLen });
  // 5
  // eslint-disable-next-line no-console
  console.log("5) cover alanları (route + raw):", covers);
  // 6
  // eslint-disable-next-line no-console
  console.log("6) pickCoverCandidate(route):", { kind: coverCandidate?.kind, url: coverCandidate?.url, sourceField: coverCandidate?.sourceField });
  // 7
  // eslint-disable-next-line no-console
  console.log("7) imgSrc (<img src>):", imgSrc || "");
  // 8
  // eslint-disable-next-line no-console
  console.log("8) img load sonucu (event):", imgLoadEvent || "pending", "→ imgSrc’yi yeni sekmede aç ve görsel geliyor mu kontrol et.");
  // 9
  // eslint-disable-next-line no-console
  console.log("9) Network tab kanıtı:", "DevTools > Network > Img request → status (200/403/404) burada doğrula.");
  // 10
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

  const [imgOk, setImgOk] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const reportedRef = useRef(false);

  useEffect(() => {
    setImgOk(false);
    setImgFailed(false);
    reportedRef.current = false;
  }, [rawInput, resolved?.url]);

  // ✅ resolve fail olduğunda proof için event üret (img hiç render edilmese bile)
  useEffect(() => {
    if (reportedRef.current) return;

    if (!rawInput) {
      reportedRef.current = true;
      onLoadEvent?.("no_input", "");
      return;
    }

    if (resolved?.status === "fail") {
      reportedRef.current = true;
      onLoadEvent?.("resolve_fail", "");
      return;
    }

    // ok ise img load/error zaten raporlayacak
  }, [rawInput, resolved?.status, onLoadEvent]);

  const shouldRenderImg = resolved?.ok && isHttpHttpsOrDataUrl(resolved.url) && !imgFailed;

  const placeholderStyle = {
    position: "absolute",
    inset: 0,
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(245,245,245,1) 0%, rgba(235,235,235,1) 40%, rgba(250,250,250,1) 100%)",
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
          src={resolved.url}
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
            onLoadEvent?.("load", resolved.url);
          }}
          onError={() => {
            setImgFailed(true);
            setImgOk(false);
            reportedRef.current = true;
            onLoadEvent?.("error", resolved.url);
          }}
        />
      ) : null}
    </div>
  );
}

export default function ProfileRoutesMobile({ userId, isSelf = false, viewerId = null, isFollowing = false }) {
  const { routes, loading, loadingMore, hasMore, error, loadMore, isEmpty } = useUserRoutes(userId, {
    pageSize: 20,
    isSelf,
    isFollowing,
    viewerId,
  });

  const proofPrintedRef = useRef(false);
  const proofRouteIdRef = useRef("");

  const [proofImgLoadEvent, setProofImgLoadEvent] = useState(""); // load | error | resolve_fail | no_input
  const [proofImgSrc, setProofImgSrc] = useState("");

  const handleClick = useCallback((route) => {
    if (!route || !route.id) return;
    const id = String(route.id);

    const routePrefill = buildRoutePrefill(route);

    try {
      window.dispatchEvent(
        new CustomEvent("open-route-modal", {
          detail: {
            routeId: id,
            route: routePrefill,
            source: "profile",
          },
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
    if (!proofTarget) return;
    if (proofPrintedRef.current) return;

    const rid = proofTarget?.id ? String(proofTarget.id) : "";
    if (!rid) return;

    if (!proofRouteIdRef.current) proofRouteIdRef.current = rid;

    // ✅ event gelmeden de basmayalım; ama resolve_fail/no_input gelince de basılacak
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

    proofPrintedRef.current = true;
  }, [proofTarget, proofImgSrc, proofImgLoadEvent]);

  if (!userId) {
    return (
      <div className="profile-routes-empty">
        <span>Profil yükleniyor…</span>
      </div>
    );
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
          {isSelf ? "Henüz kaydettiğin bir rotan yok. Haritada bir rota oluşturduğunda burada görünecek." : "Bu kullanıcının henüz paylaştığı bir rota yok."}
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
          stopCount > 0 && distanceText ? `📍 ${stopCount} durak · 📏 ${distanceText}` : stopCount > 0 ? `📍 ${stopCount} durak` : distanceText ? `📏 ${distanceText}` : "";

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

              {coverCandidate?.hasVideo && <div className="profile-route-tile-badge profile-route-tile-badge--right">▶</div>}
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
