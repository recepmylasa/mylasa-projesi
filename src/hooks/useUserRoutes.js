// FILE: src/hooks/useUserRoutes.js
// Profil “Rotalarım” sekmesi için rota listesi hook’u
// RouteCardMobile için standardize model (buildRouteCardModel).
// Grid’e PREVIEW veri bind edilecek (stopsPreview/cover/thumbnail). Gerekirse HYDRATE (lazy fetch).
//
// EMİR-1 notu (grid/read):
// - stopsPreview içinden "coverUrl" türetip modele yazma YOK (sadece gösterimde kullanılacak).
// - Yani coverUrl/thumbnailUrl yalnızca doc/model legacy alanlardan gelirse doldurulur.
// - Fallback (ilk durak görseli) UI tarafında pickCoverCandidate ile yapılır.
//
// EMİR 5 — permission-denied spam guard + UI lock mode (rules'a dokunmadan)
//
// ✅ EMİR PAKETİ 2/3 (Kalıcı Fix):
// - Firestore composite index yoksa self query (ownerId== + orderBy createdAt) failed-precondition verir.
// - Bu durumda liste “orderBy’sız fallback”e düşer ve yeni create edilen rota ilk sayfada görünmeyebilir.
// - ÇÖZÜM: create edilen routeId’yi localStorage’a yaz + reset load’da getDoc ile MERGE et.
// - Ayrıca orderBy self query’nin “index yok” hatasını bir kez tespit edip tekrar deneme → log spam kes.
//
// ✅ EMİR PAKETİ 1/3 (TEŞHİS KANITI):
// - Self list için çalıştırılan query mode + where/orderBy/limit/cursor tek log (DEV only)
// - failed-precondition / requires an index yakalanınca: tek sefer log + console.trace() (stack / hangi ekran tetikliyor)
// - NO_ORDER_FALLBACK kullanımı tek sefer kanıt log

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  buildRouteCardModel,
  getOwnerIdFromRaw,
  getVisibilityKey,
} from "../routes/routeCardModel";

// ✅ EMİR-6: optimistic cover event dinle + list patch
import {
  onRouteCoverUpdated,
  applyRouteCoverPatchToList,
} from "../utils/routeCoverEvents";

const __DEV__ = process.env.NODE_ENV !== "production";
const DEFAULT_PAGE_SIZE = 20;

// ✅ EMİR 5: dev log spam kırıcı (tek sefer)
const __permWarnOnce = new Set();
function warnPermOnce(key, msg, err) {
  if (!__DEV__) return;
  const k = String(key || "perm_once");
  if (__permWarnOnce.has(k)) return;
  __permWarnOnce.add(k);
  // eslint-disable-next-line no-console
  console.warn(msg, err || "");
}

// ✅ EMİR 1/3: index stack trace spam kırıcı (tek sefer)
const __idxTraceOnce = new Set();
function traceIndexOnce(key, label, meta) {
  if (!__DEV__) return;
  const k = String(key || "idx_trace");
  if (__idxTraceOnce.has(k)) return;
  __idxTraceOnce.add(k);

  // eslint-disable-next-line no-console
  console.groupCollapsed(label || "[RoutesDiag] requires index");
  // eslint-disable-next-line no-console
  console.log(meta || {});
  // eslint-disable-next-line no-console
  console.trace();
  // eslint-disable-next-line no-console
  console.groupEnd();
}

// ✅ EMİR 2/3: dev diag once
const __diagOnceKeys = new Set();
function diagOnce(key, ...args) {
  if (!__DEV__) return;
  const k = String(key || "diag_once");
  if (__diagOnceKeys.has(k)) return;
  __diagOnceKeys.add(k);
  // eslint-disable-next-line no-console
  console.log(...args);
}

function getErrCode(err) {
  const c = err?.code ? String(err.code) : "";
  return c || "";
}

function isPermissionDeniedError(err) {
  const code = getErrCode(err);
  if (code === "permission-denied") return true;

  const msg = err?.message ? String(err.message) : "";
  if (/missing or insufficient permissions/i.test(msg)) return true;
  if (/permission[- ]denied/i.test(msg)) return true;

  return false;
}

function isUnauthenticatedError(err) {
  const code = getErrCode(err);
  if (code === "unauthenticated") return true;
  const msg = err?.message ? String(err.message) : "";
  if (/unauthenticated/i.test(msg)) return true;
  return false;
}

function isFailedPreconditionIndexError(err) {
  const code = getErrCode(err);
  if (code === "failed-precondition") return true;
  const msg = err?.message ? String(err.message) : "";
  if (/requires an index/i.test(msg)) return true;
  return false;
}

// ---------- helpers (preview binding + hydrate) ----------
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function stripQueryAndHash(v) {
  const s = (v || "").toString().trim();
  if (!s) return "";
  return s.split(/[?#]/)[0];
}

// ✅ placeholder cover say (mylasa-logo.* + route-default-cover.*)
function isKnownAppLogoUrl(v) {
  const base = stripQueryAndHash(v).toLowerCase();
  if (!base) return false;
  const file = base.split("/").pop();
  return (
    file === "mylasa-logo.png" ||
    file === "mylasa-logo.svg" ||
    file === "route-default-cover.jpg" ||
    file === "route-default-cover.png"
  );
}

function normalizeCoverUrl(v) {
  if (!isNonEmptyString(v)) return "";
  const s = String(v).trim();
  return isKnownAppLogoUrl(s) ? "" : s;
}

function isVideoUrl(url) {
  const u = (url || "").toString().toLowerCase();
  return (
    u.includes(".mp4") ||
    u.includes(".webm") ||
    u.includes(".mov") ||
    u.includes(".m4v") ||
    u.includes("video/")
  );
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function pickFirst(obj, paths) {
  for (const p of paths || []) {
    const v = p.includes(".") ? getByPath(obj, p) : obj?.[p];
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      if (isNonEmptyString(v)) return v.trim();
      continue;
    }
    return v;
  }
  return undefined;
}

// ✅ cover objesinden (sadece cover objesi içinden) url seç — stopPreview türetme YOK
function pickCoverUrlFromCoverObj(coverObj) {
  if (!coverObj || typeof coverObj !== "object")
    return { url: "", sourceField: "" };

  const pairs = [
    ["cover.url", coverObj.url],
    ["cover.downloadUrl", coverObj.downloadUrl],
    ["cover.downloadURL", coverObj.downloadURL],
    ["cover.httpsUrl", coverObj.httpsUrl],
    ["cover.publicUrl", coverObj.publicUrl],

    // geriye uyum: bazı eski cover objeleri url yerine path tutabilir
    ["cover.storagePath", coverObj.storagePath],
    ["cover.fullPath", coverObj.fullPath],
    ["cover.path", coverObj.path],
    ["cover.gsUrl", coverObj.gsUrl],
    ["cover.gsURL", coverObj.gsURL],
  ];

  for (const [src, v] of pairs) {
    if (!isNonEmptyString(v)) continue;
    const u = normalizeCoverUrl(String(v).trim());
    if (!u) continue;
    if (isVideoUrl(u)) continue;
    return { url: u, sourceField: src };
  }

  return { url: "", sourceField: "" };
}

function normalizeStopTitle(s) {
  if (!s) return "";
  if (typeof s === "string") return s;
  const candidates = [
    "title",
    "name",
    "label",
    "place.mainText",
    "place.name",
    "place.title",
    "place.formattedAddress",
    "place.formatted",
    "poi.name",
    "poi.title",
  ];
  const v = pickFirst(s, candidates);
  return typeof v === "string" ? v : "";
}

// ✅ patch: lat/lng yakalama alanlarını genişlet (GeoPoint / position / coordinates)
function extractStopLatLng(s) {
  if (!s || typeof s !== "object") return { lat: null, lng: null };

  const lat =
    pickFirst(s, [
      "lat",
      "latitude",
      "location.lat",
      "location.latitude",
      "position.lat",
      "position.latitude",
      "coords.lat",
      "coords.latitude",
      "coordinates.lat",
      "coordinates.latitude",
    ]) ?? null;

  const lng =
    pickFirst(s, [
      "lng",
      "lon",
      "longitude",
      "location.lng",
      "location.longitude",
      "position.lng",
      "position.longitude",
      "coords.lng",
      "coords.longitude",
      "coordinates.lng",
      "coordinates.longitude",
    ]) ?? null;

  const nlat = typeof lat === "number" ? lat : Number(lat);
  const nlng = typeof lng === "number" ? lng : Number(lng);

  return {
    lat: Number.isFinite(nlat) ? nlat : null,
    lng: Number.isFinite(nlng) ? nlng : null,
  };
}

function isGoodImageCandidate(u) {
  if (!isNonEmptyString(u)) return false;
  const s = String(u).trim();
  if (!s) return false;
  if (isKnownAppLogoUrl(s)) return false;
  if (isVideoUrl(s)) return false;
  return true;
}

// ✅ FIX: stop içindeki medya url alanlarını “image/poster önce” + “video ise poster’a düş” şeklinde seç
function extractStopMediaUrl(s) {
  if (!s) return "";

  // 1) Önce image/poster/thumbnail gibi alanlar
  const imageFirstKeys = [
    "imageUrl",
    "imageURL",
    "photoUrl",
    "photoURL",
    "thumbnailUrl",
    "thumbUrl",
    "thumbURL",
    "previewUrl",
    "previewURL",
    "posterUrl",
    "poster",
    "coverUrl",
    "coverURL",
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
    "gsURL",
    "url",
    "src",
  ];

  for (const k of imageFirstKeys) {
    const v = k.includes(".") ? getByPath(s, k) : s?.[k];
    if (!isNonEmptyString(v)) continue;
    const u = String(v).trim();
    if (isGoodImageCandidate(u)) return u;
  }

  // 2) Sonra “genel medya” alanları (ama video ise kabul etme)
  const mediaKeys = ["mediaUrl", "mediaURL"];
  for (const k of mediaKeys) {
    const v = k.includes(".") ? getByPath(s, k) : s?.[k];
    if (!isNonEmptyString(v)) continue;
    const u = String(v).trim();
    if (isGoodImageCandidate(u)) return u;

    // video çıktıysa poster araması
    if (isVideoUrl(u)) {
      const posterTry = pickFirst(s, [
        "posterUrl",
        "poster",
        "thumbnailUrl",
        "thumbUrl",
        "previewUrl",
        "imageUrl",
        "photoUrl",
        "downloadUrl",
        "downloadURL",
      ]);
      if (isNonEmptyString(posterTry) && isGoodImageCandidate(posterTry)) {
        return String(posterTry).trim();
      }
    }
  }

  // 3) Array/packs
  const arr =
    pickFirst(s, [
      "media",
      "medias",
      "gallery",
      "items",
      "photos",
      "images",
      "imageUrls",
      "photoUrls",
      "mediaItems",
      "attachments",
      "files",
    ]) || null;

  if (Array.isArray(arr) && arr.length) {
    for (const it of arr) {
      if (!it) continue;

      if (typeof it === "string") {
        const u = it.trim();
        if (isGoodImageCandidate(u)) return u;
        continue;
      }

      if (typeof it === "object") {
        const typeRaw = (it.type || it.mediaType || it.kind || it.mime || "")
          .toString()
          .toLowerCase();

        const url =
          (isNonEmptyString(it.url) ? it.url : "") ||
          (isNonEmptyString(it.src) ? it.src : "") ||
          (isNonEmptyString(it.imageUrl) ? it.imageUrl : "") ||
          (isNonEmptyString(it.photoUrl) ? it.photoUrl : "") ||
          (isNonEmptyString(it.mediaUrl) ? it.mediaUrl : "") ||
          (isNonEmptyString(it.fileUrl) ? it.fileUrl : "") ||
          (isNonEmptyString(it.videoUrl) ? it.videoUrl : "") ||
          (isNonEmptyString(it.uri) ? it.uri : "") ||
          (isNonEmptyString(it.path) ? it.path : "");

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
          if (isGoodImageCandidate(posterStr)) return posterStr;

          const nestedPoster = pickFirst(it, [
            "file.url",
            "file.downloadUrl",
            "file.downloadURL",
            "asset.url",
            "asset.downloadUrl",
            "asset.downloadURL",
          ]);
          if (
            isNonEmptyString(nestedPoster) &&
            isGoodImageCandidate(nestedPoster)
          ) {
            return String(nestedPoster).trim();
          }
          continue;
        }

        if (isGoodImageCandidate(urlStr)) return urlStr;
        if (isGoodImageCandidate(posterStr)) return posterStr;

        const nested = pickFirst(it, [
          "file.url",
          "file.downloadUrl",
          "file.downloadURL",
          "file.path",
          "asset.url",
          "asset.downloadUrl",
          "asset.downloadURL",
        ]);
        if (isNonEmptyString(nested) && isGoodImageCandidate(nested)) {
          return String(nested).trim();
        }
      }
    }
  }

  return "";
}

function normalizeStopsPreviewValue(v) {
  if (!v) return [];
  let arr = [];
  if (Array.isArray(v)) arr = v.slice();
  else if (typeof v === "object") {
    const inner = pickFirst(v, ["items", "stops", "preview", "list"]);
    if (Array.isArray(inner)) arr = inner.slice();
  }

  const cleaned = arr
    .map((s) => {
      if (!s) return null;
      if (typeof s === "string") {
        const t = s.trim();
        if (!t) return null;
        return { title: t };
      }
      if (typeof s === "object") {
        const title = normalizeStopTitle(s);
        const { lat, lng } = extractStopLatLng(s);
        const mediaUrl = extractStopMediaUrl(s);

        const out = {};
        if (isNonEmptyString(title)) out.title = title;
        if (lat !== null) out.lat = lat;
        if (lng !== null) out.lng = lng;
        if (isNonEmptyString(mediaUrl)) out.mediaUrl = mediaUrl;
        if (s.id) out.id = s.id;
        if (s.order !== undefined) out.order = s.order;
        if (s.idx !== undefined && out.order === undefined) out.order = s.idx;
        return Object.keys(out).length ? out : null;
      }
      return null;
    })
    .filter(Boolean);

  const sorted = cleaned.slice().sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : Number(a.order);
    const bo = typeof b.order === "number" ? b.order : Number(b.order);
    const na = Number.isFinite(ao) ? ao : 0;
    const nb = Number.isFinite(bo) ? bo : 0;
    return na - nb;
  });

  if (sorted.length > 2) return [sorted[0], sorted[sorted.length - 1]];
  return sorted;
}

function extractPreviewFromRouteDoc(raw) {
  if (!raw || typeof raw !== "object") {
    return { stopsPreview: [], coverUrl: "", thumbnailUrl: "" };
  }

  const stopsPreviewRaw = pickFirst(raw, [
    "stopsPreview",
    "stops_preview",
    "previewStops",
    "stopsLite",
    "stopsLitePreview",
    "stopsShort",
    "preview.stops",
    "preview.stopsPreview",
    "preview.items",
    "stops",
  ]);

  const stopsPreview = normalizeStopsPreviewValue(stopsPreviewRaw);

  const coverUrlVal = pickFirst(raw, [
    "coverUrl",
    "coverURL",
    "coverPhotoUrl",
    "coverImageUrl",
    "previewUrl",
    "previewURL",
    "thumbnailUrl",
    "thumbUrl",
    "imageUrl",
    "photoUrl",
    "mediaUrl",
    "downloadUrl",
    "downloadURL",
    "preview.coverUrl",
    "preview.thumbnailUrl",
    "preview.url",
  ]);

  let coverUrl = normalizeCoverUrl(coverUrlVal);
  if (coverUrl && isVideoUrl(coverUrl)) coverUrl = "";

  const thumbVal = pickFirst(raw, [
    "thumbnailUrl",
    "thumbUrl",
    "thumbURL",
    "preview.thumbnailUrl",
    "preview.thumbUrl",
    "previewUrl",
    "coverUrl",
    "downloadUrl",
    "downloadURL",
  ]);
  let thumbnailUrl = normalizeCoverUrl(thumbVal);
  if (thumbnailUrl && isVideoUrl(thumbnailUrl)) thumbnailUrl = "";

  if (!isNonEmptyString(thumbnailUrl)) {
    thumbnailUrl = coverUrl || "";
  }

  return { stopsPreview, coverUrl, thumbnailUrl };
}

function needsHydratePreview(route) {
  if (!route) return false;
  if (route.__previewHydrated) return false;

  const sp = route.stopsPreview;
  const hasStopsPreview = Array.isArray(sp) && sp.length >= 1;

  const coverFromCanonical = normalizeCoverUrl(route?.cover?.url);
  const coverLegacyRaw =
    route.coverUrl ||
    route.previewUrl ||
    route.thumbnailUrl ||
    route.thumbUrl ||
    route.imageUrl ||
    route.photoUrl ||
    route.mediaUrl ||
    "";

  const coverLegacy = normalizeCoverUrl(coverLegacyRaw);

  const hasCover =
    isNonEmptyString(coverFromCanonical) || isNonEmptyString(coverLegacy);

  return !hasStopsPreview || !hasCover;
}

// ✅ Create-index linkini GİZLEME: ama permission-denied spam yapma
function logFirestoreQueryError(tag, err, extraMeta = null) {
  const code = getErrCode(err) || "unknown";
  const message = err?.message ? String(err.message) : "";

  if (isPermissionDeniedError(err) || isUnauthenticatedError(err)) {
    warnPermOnce(
      `perm_${tag}_${code}`,
      `[useUserRoutes] ${tag} — erişim yok (${code})`,
      __DEV__ ? err : null
    );
    return;
  }

  // ✅ EMİR 1/3: index hatası → tek sefer trace + fallback kanıtı
  if (isFailedPreconditionIndexError(err)) {
    warnPermOnce(
      `idx_${tag}_${code}`,
      `[useUserRoutes] ${tag} — query index istiyor (${code}). Fallback uygulanacak.`,
      __DEV__ ? err : null
    );

    traceIndexOnce(
      `idx_trace_${tag}_${code}`,
      "[RoutesDiag] requires an index → NO_ORDER_FALLBACK tetiklendi (stack kanıtı)",
      {
        tag,
        code,
        message,
        ...(extraMeta ? { meta: extraMeta } : {}),
      }
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.groupCollapsed(`${tag} (${code})`);
  // eslint-disable-next-line no-console
  console.error(err);
  // eslint-disable-next-line no-console
  console.log("err.code:", code);
  // eslint-disable-next-line no-console
  console.log("err.message:", message);
  if (extraMeta) {
    // eslint-disable-next-line no-console
    console.log("meta:", extraMeta);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();

  if (message) {
    // eslint-disable-next-line no-console
    console.warn(`${tag} message:`, message);
  }
}

// --------- EMİR 2/3: recent-created routeId cache (localStorage) ---------
const RECENT_ROUTES_KEY_PREFIX = "mylasa_recent_routes_v1:";
function recentRoutesKey(ownerKey) {
  return `${RECENT_ROUTES_KEY_PREFIX}${String(ownerKey || "")}`;
}

function safeJsonParse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function readRecentRouteIds(ownerKey) {
  try {
    if (typeof window === "undefined") return [];
    const k = recentRoutesKey(ownerKey);
    const raw = window.localStorage ? window.localStorage.getItem(k) : "";
    if (!raw) return [];
    const parsed = safeJsonParse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    const cleaned = arr
      .map((x) => (x == null ? "" : String(x).trim()))
      .filter(Boolean);
    // dedupe (keep order)
    const seen = new Set();
    const out = [];
    for (const id of cleaned) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out.slice(0, 20);
  } catch {
    return [];
  }
}

function writeRecentRouteIds(ownerKey, ids) {
  try {
    if (typeof window === "undefined") return;
    const k = recentRoutesKey(ownerKey);
    const arr = Array.isArray(ids) ? ids : [];
    const cleaned = arr
      .map((x) => (x == null ? "" : String(x).trim()))
      .filter(Boolean)
      .slice(0, 20);
    if (window.localStorage) {
      window.localStorage.setItem(k, JSON.stringify(cleaned));
    }
  } catch {
    // ignore
  }
}

function rememberRecentRouteId(ownerKey, routeId) {
  const rid = routeId == null ? "" : String(routeId).trim();
  if (!rid) return;
  const prev = readRecentRouteIds(ownerKey);
  const next = [rid, ...prev.filter((x) => x !== rid)].slice(0, 20);
  writeRecentRouteIds(ownerKey, next);
}

function getRouteTimeMs(route) {
  const r = route || {};
  const raw = r.raw || {};
  const pickTs = (v) => {
    try {
      if (!v) return null;
      if (typeof v.toDate === "function") return v.toDate().getTime();
      if (typeof v.seconds === "number") return v.seconds * 1000;
      if (v instanceof Date) return v.getTime();
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };

  const a =
    pickTs(r.createdAt) ??
    pickTs(raw.createdAt) ??
    pickTs(r.finishedAt) ??
    pickTs(raw.finishedAt) ??
    null;

  return a != null ? a : 0;
}

function dedupeRoutesById(list) {
  const out = [];
  const seen = new Set();
  for (const it of list || []) {
    const id = it?.id ? String(it.id) : "";
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(it);
  }
  return out;
}

function buildPatchedRouteModel({
  id,
  raw,
  ownerKey,
  viewerId,
  isSelf,
  isFollowing,
}) {
  if (!id || !raw || typeof raw !== "object") return null;

  const docOwnerId = getOwnerIdFromRaw(raw, ownerKey);
  const docOwnerKey = docOwnerId ? String(docOwnerId) : "";
  if (!docOwnerKey || docOwnerKey !== ownerKey) return null;

  const deleted =
    raw.deleted === true ||
    !!raw.deletedAt ||
    !!raw.isDeleted ||
    !!raw.archivedAt;
  if (deleted) return null;

  const status = (raw.status || "").toString().toLowerCase();

  if (!isSelf) {
    if (status && status !== "finished") return null;
  }

  const visibilityKey = getVisibilityKey(raw);

  if (!isSelf) {
    if (visibilityKey === "private") return null;
    if (!isFollowing && visibilityKey === "followers") return null;
    if (visibilityKey === "unknown") return null;
  }

  const model = buildRouteCardModel({
    id,
    raw,
    ownerIdFallback: docOwnerKey,
    viewerId,
  });

  const { stopsPreview, coverUrl, thumbnailUrl } = extractPreviewFromRouteDoc(raw);

  const modelCover = normalizeCoverUrl(model?.coverUrl);
  const modelPreview = normalizeCoverUrl(model?.previewUrl);
  const modelThumb = normalizeCoverUrl(model?.thumbnailUrl);
  const modelThumb2 = normalizeCoverUrl(model?.thumbUrl);
  const modelImage = normalizeCoverUrl(model?.imageUrl);
  const modelMedia = normalizeCoverUrl(model?.mediaUrl);

  const docCover = normalizeCoverUrl(coverUrl);
  const docThumb = normalizeCoverUrl(thumbnailUrl);

  const finalCoverRaw =
    modelCover || modelPreview || modelImage || modelMedia || docCover || "";
  const finalCover = finalCoverRaw && !isVideoUrl(finalCoverRaw) ? finalCoverRaw : "";

  const finalThumbRaw = modelThumb || modelThumb2 || docThumb || finalCover || "";
  const finalThumb = finalThumbRaw && !isVideoUrl(finalThumbRaw) ? finalThumbRaw : "";

  const rawCoverObj = raw?.cover && typeof raw.cover === "object" ? raw.cover : null;
  const modelCoverObj = model?.cover && typeof model.cover === "object" ? model.cover : null;
  const baseCoverObj = modelCoverObj || rawCoverObj;

  let nextCoverObj = baseCoverObj;
  if (baseCoverObj && typeof baseCoverObj === "object") {
    const picked = pickCoverUrlFromCoverObj(baseCoverObj);
    const safeUrl = picked.url && !isVideoUrl(picked.url) ? picked.url : "";
    nextCoverObj = {
      ...baseCoverObj,
      url: safeUrl,
      sourceField:
        (isNonEmptyString(baseCoverObj.sourceField) && String(baseCoverObj.sourceField)) ||
        picked.sourceField ||
        "cover.url",
    };
  }

  return {
    ...model,
    ...(nextCoverObj ? { cover: nextCoverObj } : {}),
    stopsPreview:
      Array.isArray(model?.stopsPreview) && model.stopsPreview.length
        ? model.stopsPreview
        : stopsPreview,
    coverUrl: finalCover,
    thumbnailUrl: finalThumb,
    previewUrl: modelPreview || finalCover || "",
    thumbUrl: modelThumb2 || finalThumb || "",
    imageUrl: modelImage || finalCover || "",
    mediaUrl: modelMedia || finalCover || "",
    raw: model?.raw && typeof model.raw === "object" ? model.raw : raw,
  };
}

export default function useUserRoutes(ownerId, options = {}) {
  const {
    pageSize = DEFAULT_PAGE_SIZE,
    isSelf = false,
    isFollowing = false,
    viewerId = null,
  } = options;

  const [routes, setRoutes] = useState([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  // ✅ EMİR 5: erişim durumu
  const [accessStatus, setAccessStatus] = useState("idle"); // idle | loading | ready | login_required | forbidden | error
  const lockRef = useRef({ key: "", reason: "" }); // reason: login_required | forbidden

  const cursorRef = useRef(null);
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  // HYDRATE cache + job guard
  const hydrateCacheRef = useRef(new Map()); // routeId -> { status: "inflight"|"done" }
  const hydrateJobIdRef = useRef(0);

  // ✅ query mode: optimized vs legacy vs self
  const queryModeRef = useRef("unknown"); // "unknown" | "optimized" | "legacy" | "self"

  // ✅ EMİR 2/3: self orderBy index yoksa bir daha deneme (spam kır)
  const selfOrderBrokenRef = useRef(false);

  // ✅ refresh spam guard
  const refreshGateRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ✅ EMİR-6: event listener (mount/unmount) — UI hızlandırma (snapshot/refresh gerçek doğruluk)
  useEffect(() => {
    const unsub = onRouteCoverUpdated((payload) => {
      if (!payload?.routeId || !payload?.cover) return;
      setRoutes((prev) => applyRouteCoverPatchToList(prev, payload));
    });

    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, []);

  // ✅ EMİR 2/3: create sonrası open-route-modal event’inden routeId yakala
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isSelf) return;
    if (!ownerId) return;

    const ownerKey = String(ownerId);
    const onOpenRouteModal = (e) => {
      try {
        const d = e?.detail || {};
        const rid = d?.routeId ? String(d.routeId).trim() : "";
        const src = d?.source ? String(d.source).toLowerCase() : "";
        const prefillOwner =
          d?.route?.ownerId != null
            ? String(d.route.ownerId)
            : d?.ownerId != null
            ? String(d.ownerId)
            : "";

        if (!rid) return;

        // sadece create akışında kaydet
        if (!src.includes("profile_create") && !src.includes("create")) return;

        // owner uyuşmuyorsa dokunma
        if (prefillOwner && String(prefillOwner) !== ownerKey) return;

        rememberRecentRouteId(ownerKey, rid);

        // ✅ hafif refresh (anında grid’e düşsün)
        const now = Date.now();
        if (now - refreshGateRef.current < 650) return;
        refreshGateRef.current = now;

        try {
          // refresh reset: yeni rota listede görünsün
          // (loadPage declare aşağıda; closure safe)
        } catch {}
      } catch {}
    };

    window.addEventListener("open-route-modal", onOpenRouteModal);
    return () => {
      try {
        window.removeEventListener("open-route-modal", onOpenRouteModal);
      } catch {}
    };
  }, [isSelf, ownerId]);

  // owner değişince hydrate cache + query mode + lock sıfırla
  useEffect(() => {
    hydrateCacheRef.current = new Map();
    hydrateJobIdRef.current += 1;
    queryModeRef.current = "unknown";
    selfOrderBrokenRef.current = false;

    lockRef.current = { key: "", reason: "" };
    setAccessStatus("idle");
    setError(null);
  }, [ownerId]);

  const runQueryPage = useCallback(
    async ({ ownerKey, localCursor, modeToUse }) => {
      const colRef = collection(db, "routes");

      const mkOptimized = () => {
        const diag = [
          { type: "where", field: "ownerId", op: "==", value: ownerKey },
          { type: "where", field: "status", op: "==", value: "finished" },
          { type: "orderBy", field: "createdAt", dir: "desc" },
        ];

        const constraints = [
          where("ownerId", "==", ownerKey),
          where("status", "==", "finished"),
          orderBy("createdAt", "desc"),
        ];
        if (localCursor) constraints.push(startAfter(localCursor));
        constraints.push(limit(pageSize + 1));

        return {
          q: query(colRef, ...constraints),
          diag,
          supportsCursor: true,
          used: "optimized",
          usedLabel: "optimized",
        };
      };

      const mkSelf = () => {
        // ✅ SELF: status filtresi YOK (draft/empty status da gelsin)
        const diag = [
          { type: "where", field: "ownerId", op: "==", value: ownerKey },
          { type: "orderBy", field: "createdAt", dir: "desc" },
        ];

        const constraints = [
          where("ownerId", "==", ownerKey),
          orderBy("createdAt", "desc"),
        ];
        if (localCursor) constraints.push(startAfter(localCursor));
        constraints.push(limit(pageSize + 1));

        return {
          q: query(colRef, ...constraints),
          diag,
          supportsCursor: true,
          used: "self",
          usedLabel: "self",
        };
      };

      const mkSelfNoOrderFallback = () => {
        // ✅ index yoksa: orderBy’sız (cursor yok)
        const diag = [
          { type: "where", field: "ownerId", op: "==", value: ownerKey },
          { type: "limit", n: pageSize + 1 },
          { type: "note", value: "NO_ORDER_FALLBACK" },
        ];
        const constraints = [
          where("ownerId", "==", ownerKey),
          limit(pageSize + 1),
        ];
        return {
          q: query(colRef, ...constraints),
          diag,
          supportsCursor: false,
          used: "self",
          usedLabel: "fallback",
        };
      };

      const mkLegacy = () => {
        const diag = [{ type: "orderBy", field: "createdAt", dir: "desc" }];

        const constraints = [orderBy("createdAt", "desc")];
        if (localCursor) constraints.push(startAfter(localCursor));
        constraints.push(limit(pageSize + 1));

        return {
          q: query(colRef, ...constraints),
          diag,
          supportsCursor: true,
          used: "legacy",
          usedLabel: "legacy",
        };
      };

      if (modeToUse === "legacy") {
        const built = mkLegacy();
        const snap = await getDocs(built.q);
        return { snap, used: built.used, usedLabel: built.usedLabel, diag: built.diag, supportsCursor: built.supportsCursor };
      }

      if (modeToUse === "self") {
        // ✅ EMİR 1/3: NO_ORDER_FALLBACK kanıtı (index yok → bir daha orderBy deneme)
        if (selfOrderBrokenRef.current) {
          const built = mkSelfNoOrderFallback();
          diagOnce(
            `RoutesDiag_NO_ORDER_FALLBACK_${ownerKey}`,
            "[RoutesDiag] NO_ORDER_FALLBACK aktif (selfOrderBrokenRef=true)",
            { ownerId: ownerKey, diag: built.diag }
          );
          const snap = await getDocs(built.q);
          return { snap, used: built.used, usedLabel: built.usedLabel, diag: built.diag, supportsCursor: built.supportsCursor };
        }

        try {
          const built = mkSelf();
          const snap = await getDocs(built.q);
          return { snap, used: built.used, usedLabel: built.usedLabel, diag: built.diag, supportsCursor: built.supportsCursor };
        } catch (e) {
          if (isPermissionDeniedError(e) || isUnauthenticatedError(e)) throw e;

          // ✅ index yoksa bir daha orderBy deneme + STACK TRACE (tek sefer)
          if (isFailedPreconditionIndexError(e)) {
            selfOrderBrokenRef.current = true;

            diagOnce(
              `RoutesDiag_selfOrderBroken_${ownerKey}`,
              "[RoutesDiag] self orderBy(createdAt) index yok → bundan sonra NO_ORDER_FALLBACK kullanılacak."
            );

            traceIndexOnce(
              `idx_trace_self_${ownerKey}`,
              "[RoutesDiag] self query requires an index (stack kanıtı)",
              {
                ownerId: ownerKey,
                mode: "self",
                intended: "where(ownerId==) + orderBy(createdAt desc)",
                errCode: getErrCode(e) || "failed-precondition",
                errMsg: e?.message ? String(e.message) : "",
              }
            );
          }

          logFirestoreQueryError("[useUserRoutes] self query failed", e, {
            ownerId: ownerKey,
            mode: "self",
            step: "orderBy(createdAt desc)",
          });

          try {
            const built = mkSelfNoOrderFallback();
            diagOnce(
              `RoutesDiag_NO_ORDER_FALLBACK_apply_${ownerKey}`,
              "[RoutesDiag] NO_ORDER_FALLBACK uygulanıyor (self query fail sonrası)",
              { ownerId: ownerKey, diag: built.diag }
            );
            const snap = await getDocs(built.q);
            return { snap, used: built.used, usedLabel: built.usedLabel, diag: built.diag, supportsCursor: built.supportsCursor };
          } catch (e2) {
            logFirestoreQueryError("[useUserRoutes] self no-order fallback failed", e2, {
              ownerId: ownerKey,
              mode: "self",
              step: "NO_ORDER_FALLBACK",
            });
            throw e2;
          }
        }
      }

      // default: optimized
      try {
        const built = mkOptimized();
        const snap = await getDocs(built.q);
        return { snap, used: built.used, usedLabel: built.usedLabel, diag: built.diag, supportsCursor: built.supportsCursor };
      } catch (e) {
        // ✅ permission/unauthenticated ise gereksiz fallback deneme (spam ve ekstra istek yok)
        if (isPermissionDeniedError(e) || isUnauthenticatedError(e)) {
          throw e;
        }

        logFirestoreQueryError("[useUserRoutes] optimized query failed", e, {
          ownerId: ownerKey,
          mode: "optimized",
        });

        try {
          const built = mkLegacy();
          const snap = await getDocs(built.q);
          return { snap, used: built.used, usedLabel: built.usedLabel, diag: built.diag, supportsCursor: built.supportsCursor };
        } catch (e2) {
          logFirestoreQueryError("[useUserRoutes] legacy fallback failed", e2, {
            ownerId: ownerKey,
            mode: "legacy",
          });
          throw e2;
        }
      }
    },
    [pageSize]
  );

  const loadPage = useCallback(
    async (mode = "reset") => {
      if (!ownerId || !db) {
        if (mode === "reset") {
          setRoutes([]);
          setHasMore(false);
          setError(null);
          setInitialLoading(false);
          setLoadingMore(false);
          setAccessStatus("idle");
        }
        return;
      }

      const ownerKey = String(ownerId);
      const lockKey = `${ownerKey}|${viewerId ? String(viewerId) : "anon"}`;

      // ✅ EMİR 5: login yoksa hiç sorgu başlatma → UI "giriş gerekli"
      if (!viewerId) {
        if (
          lockRef.current.key === lockKey &&
          lockRef.current.reason === "login_required"
        )
          return;

        lockRef.current = { key: lockKey, reason: "login_required" };
        setAccessStatus("login_required");
        setError(null);
        setRoutes([]);
        setHasMore(false);
        cursorRef.current = null;
        setInitialLoading(false);
        setLoadingMore(false);
        return;
      }

      // ✅ EMİR 5: aynı kullanıcı+profil için permission-denied kilidi varsa tekrar deneme (spam yok)
      if (
        lockRef.current.key === lockKey &&
        lockRef.current.reason === "forbidden"
      ) {
        return;
      }

      const reqId = ++requestIdRef.current;

      if (mode === "reset") {
        setAccessStatus("loading");
        setInitialLoading(true);
        setLoadingMore(false);
        setError(null);
        cursorRef.current = null;
        setHasMore(false);
        setRoutes([]);

        hydrateCacheRef.current = new Map();
        hydrateJobIdRef.current += 1;

        queryModeRef.current = "unknown";
      } else {
        setLoadingMore(true);
      }

      const maxAutoPages = mode === "reset" ? 3 : 1;

      try {
        let localCursor = mode === "more" ? cursorRef.current : null;
        let collected = [];
        let localHasMore = false;
        let loops = 0;
        let lastDiag = [];
        let supportsCursor = true;
        let usedModeBase = "unknown";
        let usedModeLabel = "unknown";

        while (loops < maxAutoPages) {
          const currentMode =
            mode === "reset"
              ? queryModeRef.current === "unknown"
                ? isSelf
                  ? "self"
                  : "optimized"
                : queryModeRef.current
              : queryModeRef.current === "unknown"
              ? isSelf
                ? "self"
                : "legacy"
              : queryModeRef.current;

          const { snap, used, usedLabel, diag, supportsCursor: sc } =
            await runQueryPage({
              ownerKey,
              localCursor,
              modeToUse: currentMode,
            });

          usedModeBase = used || "unknown";
          usedModeLabel = usedLabel || usedModeBase;
          supportsCursor = sc !== false;
          lastDiag = Array.isArray(diag) ? diag : [];

          if (!isMountedRef.current || reqId !== requestIdRef.current) return;

          const docs = snap.docs || [];
          const pageDocs = docs.slice(0, pageSize);

          // ✅ EMİR 1/3 — Self list query kanıtı (tek sefer)
          if (__DEV__ && mode === "reset") {
            const k = `[RoutesDiag_query_${lockKey}_${isSelf ? "self" : "notself"}_${usedModeLabel}]`;
            diagOnce(k, "[RoutesDiag] query evidence", {
              ownerId: ownerKey,
              used: usedModeLabel, // self | fallback | optimized | legacy
              usedBase: usedModeBase, // self | optimized | legacy (queryModeRef için)
              where_order_limit_cursor: lastDiag,
              hasCursor: !!localCursor,
              cursorEnabled: supportsCursor,
              pageSize,
              requestedMode: currentMode,
              totalDocs: docs.length,
              pageDocs: pageDocs.length,
              isSelf,
            });
          }

          // non-self için eski optimize->legacy keşfi kalsın
          if (
            !isSelf &&
            mode === "reset" &&
            queryModeRef.current === "unknown" &&
            usedModeBase === "optimized" &&
            docs.length === 0
          ) {
            const legacyRes = await runQueryPage({
              ownerKey,
              localCursor: null,
              modeToUse: "legacy",
            });
            const legacyDocs = legacyRes.snap.docs || [];
            if (legacyDocs.length > 0) queryModeRef.current = "legacy";
          } else if (mode === "reset" && queryModeRef.current === "unknown") {
            queryModeRef.current = usedModeBase; // optimized | legacy | self
          }

          // NO_ORDER_FALLBACK ise pagination yok
          if (!supportsCursor) {
            localCursor = null;
            localHasMore = false;
          }

          const nextCursor =
            supportsCursor && pageDocs.length
              ? pageDocs[pageDocs.length - 1]
              : null;
          localHasMore = supportsCursor ? docs.length > pageSize : false;

          const mapped = pageDocs
            .map((d) => {
              const raw = d.data() || {};

              const model = buildPatchedRouteModel({
                id: d.id,
                raw,
                ownerKey,
                viewerId,
                isSelf,
                isFollowing,
              });

              return model;
            })
            .filter(Boolean);

          collected = mode === "reset" ? collected.concat(mapped) : mapped;
          localCursor = nextCursor;

          if (mode === "reset") {
            if (collected.length > 0) break;
            if (!localHasMore || !localCursor) break;
            loops += 1;
            continue;
          }

          break;
        }

        if (!isMountedRef.current || reqId !== requestIdRef.current) return;

        // ✅ EMİR 2/3: self + no-order durumda (index yok) → recent routeId’leri getDoc ile MERGE et
        if (mode === "reset" && isSelf) {
          const recentIds = readRecentRouteIds(ownerKey);
          if (recentIds.length) {
            const existing = new Set((collected || []).map((r) => String(r.id)));
            const missing = recentIds
              .filter((rid) => rid && !existing.has(String(rid)))
              .slice(0, 8);

            if (missing.length) {
              const fetched = [];
              const validKept = [];

              for (const rid of missing) {
                try {
                  const snap = await getDoc(doc(db, "routes", String(rid)));
                  if (!snap.exists()) continue;
                  const raw = snap.data() || {};
                  const m = buildPatchedRouteModel({
                    id: snap.id,
                    raw,
                    ownerKey,
                    viewerId,
                    isSelf,
                    isFollowing,
                  });
                  if (m) {
                    fetched.push(m);
                    validKept.push(String(rid));
                  }
                } catch {
                  // ignore
                }
              }

              if (fetched.length) {
                collected = dedupeRoutesById([...fetched, ...collected]);
              }

              // prune: bulunanları koru, bulunmayanlar zaten next load’da düşer
              if (validKept.length) {
                const prev = readRecentRouteIds(ownerKey);
                const next = [
                  ...validKept,
                  ...prev.filter((x) => !validKept.includes(String(x))),
                ].slice(0, 20);
                writeRecentRouteIds(ownerKey, next);
              }
            }
          }

          // ✅ no-order ise (supportsCursor false) list order’ı client-side toparla
          // (NOT: supportsCursor false bilgisi query evidence diag’dan gelir; burada zaten koleksiyon sırası garanti değil)
          // Bu blok mevcut davranışı korur.
          // eslint-disable-next-line no-lone-blocks
          {
            // no-op guard; sorting aşağıda koşula bağlı uygulanıyor (aynı).
          }

          // UI stabil: ilk sayfayı pageSize ile sınırla
          collected = (collected || []).slice(0, pageSize);
        }

        // ✅ başarı → lock kaldır
        lockRef.current = { key: "", reason: "" };
        setAccessStatus("ready");
        setRoutes((prev) => (mode === "reset" ? collected : prev.concat(collected)));
        cursorRef.current = localCursor;
        setHasMore(!!(localHasMore && localCursor));
      } catch (err) {
        if (!isMountedRef.current || reqId !== requestIdRef.current) return;

        // ✅ EMİR 5: permission-denied / unauthenticated → UI lock, log spam yok
        if (isPermissionDeniedError(err)) {
          lockRef.current = { key: lockKey, reason: "forbidden" };
          setAccessStatus("forbidden");
          setError(null);
          setRoutes([]);
          setHasMore(false);
          cursorRef.current = null;

          warnPermOnce(
            `forbidden_${lockKey}`,
            "[useUserRoutes] permission-denied — UI locked (no spam).",
            __DEV__ ? err : null
          );
          return;
        }

        if (isUnauthenticatedError(err)) {
          lockRef.current = { key: lockKey, reason: "login_required" };
          setAccessStatus("login_required");
          setError(null);
          setRoutes([]);
          setHasMore(false);
          cursorRef.current = null;
          return;
        }

        // eslint-disable-next-line no-console
        console.warn("[useUserRoutes] load error", err);
        if (mode === "reset") setRoutes([]);
        setHasMore(false);
        setError(err || new Error("Rotalar yüklenirken bir hata oluştu."));
        setAccessStatus("error");
      } finally {
        if (!isMountedRef.current || reqId !== requestIdRef.current) return;
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [ownerId, pageSize, isSelf, isFollowing, viewerId, runQueryPage]
  );

  // ✅ owner/self/viewer değişince initial load
  useEffect(() => {
    if (!ownerId) {
      setRoutes([]);
      setHasMore(false);
      setError(null);
      setInitialLoading(false);
      setLoadingMore(false);
      setAccessStatus("idle");
      return;
    }
    loadPage("reset");
  }, [ownerId, isSelf, isFollowing, viewerId, loadPage]);

  // ✅ EMİR 2/3: open-route-modal create event’i yakaladıysa refresh tetikle (closure)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isSelf) return;
    if (!ownerId) return;

    const ownerKey = String(ownerId);

    const onOpenRouteModal = (e) => {
      try {
        const d = e?.detail || {};
        const rid = d?.routeId ? String(d.routeId).trim() : "";
        const src = d?.source ? String(d.source).toLowerCase() : "";
        const prefillOwner =
          d?.route?.ownerId != null
            ? String(d.route.ownerId)
            : d?.ownerId != null
            ? String(d.ownerId)
            : "";

        if (!rid) return;
        if (!src.includes("profile_create") && !src.includes("create")) return;
        if (prefillOwner && String(prefillOwner) !== ownerKey) return;

        rememberRecentRouteId(ownerKey, rid);

        const now = Date.now();
        if (now - refreshGateRef.current < 650) return;
        refreshGateRef.current = now;

        loadPage("reset");
      } catch {}
    };

    window.addEventListener("open-route-modal", onOpenRouteModal);
    return () => {
      try {
        window.removeEventListener("open-route-modal", onOpenRouteModal);
      } catch {}
    };
  }, [isSelf, ownerId, loadPage]);

  // ✅ SELF: geri dönünce (focus/visible) hafif refresh (spam guard)
  useEffect(() => {
    if (!isSelf) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let lastAt = 0;
    const tick = () => {
      const now = Date.now();
      if (now - lastAt < 1200) return;
      lastAt = now;
      try {
        loadPage("reset");
      } catch {}
    };

    const onFocus = () => tick();
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      try {
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onVis);
      } catch {}
    };
  }, [isSelf, loadPage]);

  // ✅ Lazy HYDRATE: sadece start+end stop (2 query) + stopsPreview'u besle
  const hydrateOneRoutePreview = useCallback(async (routeId, jobId) => {
    if (!routeId || !db) return null;
    if (!isMountedRef.current) return null;
    if (hydrateJobIdRef.current !== jobId) return null;

    const rid = String(routeId);
    const cached = hydrateCacheRef.current.get(rid);
    if (cached?.status === "inflight" || cached?.status === "done") return null;

    hydrateCacheRef.current.set(rid, { status: "inflight" });

    const stopsCol = collection(db, "routes", rid, "stops");

    const fetchOne = async (field, dir) => {
      try {
        const snap = await getDocs(query(stopsCol, orderBy(field, dir), limit(1)));
        return snap.docs?.[0] || null;
      } catch {
        return null;
      }
    };

    try {
      let firstDoc = await fetchOne("order", "asc");
      let lastDoc = await fetchOne("order", "desc");

      if (!firstDoc || !lastDoc) {
        const f2 = await fetchOne("idx", "asc");
        const l2 = await fetchOne("idx", "desc");
        firstDoc = firstDoc || f2;
        lastDoc = lastDoc || l2;
      }

      if (!firstDoc && !lastDoc) {
        const snap = await getDocs(query(stopsCol, limit(2)));
        const docs = snap.docs || [];
        firstDoc = docs[0] || null;
        lastDoc = docs.length > 1 ? docs[docs.length - 1] : docs[0] || null;
      }

      if (!isMountedRef.current) return null;
      if (hydrateJobIdRef.current !== jobId) return null;

      const makeStop = (sd) => {
        if (!sd) return null;
        const s = { id: sd.id, ...(sd.data() || {}) };

        const title = normalizeStopTitle(s);
        const { lat, lng } = extractStopLatLng(s);
        const mediaUrl = extractStopMediaUrl(s);

        const out = { id: s.id };
        if (isNonEmptyString(title)) out.title = title;
        if (lat !== null) out.lat = lat;
        if (lng !== null) out.lng = lng;
        if (isNonEmptyString(mediaUrl)) out.mediaUrl = mediaUrl;
        if (s.order !== undefined) out.order = s.order;
        if (s.idx !== undefined && out.order === undefined) out.order = s.idx;

        return Object.keys(out).length > 1 ? out : null;
      };

      const firstStop = makeStop(firstDoc);
      const lastStop = makeStop(lastDoc);

      let stopsPreview = [];
      if (firstStop) stopsPreview.push(firstStop);
      if (
        lastStop &&
        (!firstStop || String(lastStop.id) !== String(firstStop.id))
      ) {
        stopsPreview.push(lastStop);
      }

      const result = {
        stopsPreview,
        coverUrl: "",
        thumbnailUrl: "",
      };

      hydrateCacheRef.current.set(rid, { status: "done" });
      return result;
    } catch {
      hydrateCacheRef.current.set(rid, { status: "done" });
      return null;
    }
  }, []);

  // ✅ Lazy hydrate runner (max 3 concurrent)
  useEffect(() => {
    if (!routes || routes.length === 0) return;
    const jobId = hydrateJobIdRef.current;

    const targets = routes.filter((r) => needsHydratePreview(r)).slice(0, 24);
    if (!targets.length) return;

    let cancelled = false;
    let idx = 0;
    let active = 0;
    const maxConc = 3;

    function canRun() {
      if (cancelled) return false;
      if (!isMountedRef.current) return false;
      if (hydrateJobIdRef.current !== jobId) return false;
      return true;
    }

    function applyPatchToRoute(rid, patch) {
      setRoutes((prev) => {
        const next = (prev || []).map((x) => {
          if (!x || String(x.id) !== rid) return x;

          const nextStopsPreview =
            Array.isArray(x.stopsPreview) && x.stopsPreview.length
              ? x.stopsPreview
              : Array.isArray(patch.stopsPreview)
              ? patch.stopsPreview
              : [];

          const changed =
            (!Array.isArray(x.stopsPreview) || x.stopsPreview.length === 0) &&
            nextStopsPreview.length > 0;

          if (!changed) return { ...x, __previewHydrated: true };

          return {
            ...x,
            stopsPreview: nextStopsPreview,
            __previewHydrated: true,
          };
        });
        return next;
      });
    }

    function pump() {
      if (!canRun()) return;

      while (active < maxConc && idx < targets.length) {
        const r = targets[idx++];
        const rid = r?.id ? String(r.id) : null;
        if (!rid) continue;

        const cached = hydrateCacheRef.current.get(rid);
        if (cached?.status === "inflight" || cached?.status === "done") continue;

        startTask(rid);
      }
    }

    function startTask(rid) {
      active += 1;

      hydrateOneRoutePreview(rid, jobId)
        .then((patch) => {
          if (!patch) return;
          if (!canRun()) return;
          applyPatchToRoute(rid, patch);
        })
        .catch(() => {
          // no-op
        })
        .finally(() => {
          active -= 1;
          if (canRun()) pump();
        });
    }

    pump();

    return () => {
      cancelled = true;
    };
  }, [routes, hydrateOneRoutePreview]);

  const loadMore = useCallback(() => {
    // ✅ kilit modunda loadMore yok
    if (accessStatus === "forbidden" || accessStatus === "login_required") return;
    if (loadingMore || !hasMore || initialLoading) return;
    loadPage("more");
  }, [hasMore, loadingMore, initialLoading, loadPage, accessStatus]);

  const isEmpty =
    accessStatus === "ready" && !initialLoading && routes.length === 0 && !hasMore;

  return {
    routes,
    loading: initialLoading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    isEmpty,

    // ✅ EMİR 5
    accessStatus,
  };
}