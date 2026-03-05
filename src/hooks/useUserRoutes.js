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
// - Self list: userdan index istemesin → self query’de orderBy KULLANMA.
// - Client-side: isDeleted false filtre + createdAt desc sort (null-safe).
// - Pagination: self için cursor yok, limit büyütme var.
// - Create sonrası: recent route ids (localStorage) + refresh + getDoc merge.
//
// ✅ EMİR PAKETİ 1/3 (TEŞHİS KANITI):
// - Self list için çalıştırılan query mode + where/orderBy/limit/cursor tek log (DEV only)
// - failed-precondition / requires an index yakalanınca: tek sefer log + console.trace() (stack / hangi ekran tetikliyor)
// - NO_ORDER_FALLBACK kullanımı tek sefer kanıt log
//
// ✅ EMİR 2B/3 (HOTFIX):
// - Maximum update depth loop fix: event listener effect’leri loadPage’a bağlanmaz.
// - loadPageRef.current ile çağrılır. Focus/visibility ve create refresh “reset” değil “refresh” kullanır.

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
function logFirestoreQueryError(tag, err) {
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

  // ✅ EMİR 1/3: index hatası spam kır + trace
  if (isFailedPreconditionIndexError(err)) {
    warnPermOnce(
      `idx_${tag}_${code}`,
      `[useUserRoutes] ${tag} — query index istiyor (${code}).`,
      __DEV__ ? err : null
    );
    traceIndexOnce(
      `idx_trace_${tag}_${code}`,
      "[RoutesDiag] requires an index (stack kanıtı)",
      { tag, code, message }
    );
    return;
  }

  // ✅ PROD: konsol temiz (0 log)
  if (!__DEV__) return;

  // eslint-disable-next-line no-console
  console.groupCollapsed(`${tag} (${code})`);
  // eslint-disable-next-line no-console
  console.error(err);
  // eslint-disable-next-line no-console
  console.log("err.code:", code);
  // eslint-disable-next-line no-console
  console.log("err.message:", message);
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

function buildPatchedRouteModel({ id, raw, ownerKey, viewerId, isSelf, isFollowing }) {
  if (!id || !raw || typeof raw !== "object") return null;

  const docOwnerId = getOwnerIdFromRaw(raw, ownerKey);
  const docOwnerKey = docOwnerId ? String(docOwnerId) : "";
  if (!docOwnerKey || docOwnerKey !== ownerKey) return null;

  const deleted =
    raw.deleted === true || !!raw.deletedAt || !!raw.isDeleted || !!raw.archivedAt;
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

  const finalCoverRaw = modelCover || modelPreview || modelImage || modelMedia || docCover || "";
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
      Array.isArray(model?.stopsPreview) && model.stopsPreview.length ? model.stopsPreview : stopsPreview,
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

  // ✅ refresh spam guard
  const refreshGateRef = useRef(0);

  // ✅ EMİR 2/3: self pagination = limit büyütme
  const selfLimitRef = useRef(pageSize);

  // ✅ EMİR 2B: loadPage ref (listener effect loop fix)
  const loadPageRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ✅ EMİR-6: event listener (mount/unmount) — UI hızlandırma
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

  // owner değişince hydrate cache + query mode + lock + selfLimit sıfırla
  useEffect(() => {
    hydrateCacheRef.current = new Map();
    hydrateJobIdRef.current += 1;
    queryModeRef.current = "unknown";

    lockRef.current = { key: "", reason: "" };
    setAccessStatus("idle");
    setError(null);

    selfLimitRef.current = pageSize;
    cursorRef.current = null;
  }, [ownerId, pageSize]);

  const runQueryPage = useCallback(
    async ({ ownerKey, localCursor, modeToUse }) => {
      const colRef = collection(db, "routes");

      const mkOptimized = () => {
        const diag = [
          `where(ownerId == ${ownerKey})`,
          `where(status == finished)`,
          `orderBy(createdAt desc)`,
        ];

        const constraints = [
          where("ownerId", "==", ownerKey),
          where("status", "==", "finished"),
          orderBy("createdAt", "desc"),
        ];
        if (localCursor) {
          constraints.push(startAfter(localCursor));
          diag.push("startAfter(cursor)");
        }
        constraints.push(limit(pageSize + 1));
        diag.push(`limit(${pageSize + 1})`);
        return { q: query(colRef, ...constraints), diag, supportsCursor: true };
      };

      const mkLegacy = () => {
        const diag = [`orderBy(createdAt desc)`];

        const constraints = [orderBy("createdAt", "desc")];
        if (localCursor) {
          constraints.push(startAfter(localCursor));
          diag.push("startAfter(cursor)");
        }
        constraints.push(limit(pageSize + 1));
        diag.push(`limit(${pageSize + 1})`);
        return { q: query(colRef, ...constraints), diag, supportsCursor: true };
      };

      if (modeToUse === "legacy") {
        const { q, diag, supportsCursor } = mkLegacy();
        const snap = await getDocs(q);
        return { snap, used: "legacy", diag, supportsCursor };
      }

      // default: optimized
      try {
        const { q, diag, supportsCursor } = mkOptimized();
        const snap = await getDocs(q);
        return { snap, used: "optimized", diag, supportsCursor };
      } catch (e) {
        if (isPermissionDeniedError(e) || isUnauthenticatedError(e)) throw e;

        logFirestoreQueryError("[useUserRoutes] optimized query failed", e);

        try {
          const { q, diag, supportsCursor } = mkLegacy();
          const snap = await getDocs(q);
          return { snap, used: "legacy", diag, supportsCursor };
        } catch (e2) {
          logFirestoreQueryError("[useUserRoutes] legacy fallback failed", e2);
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
        if (lockRef.current.key === lockKey && lockRef.current.reason === "login_required") return;

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

      // ✅ EMİR 5: permission-denied kilidi varsa tekrar deneme (spam yok)
      if (lockRef.current.key === lockKey && lockRef.current.reason === "forbidden") return;

      const reqId = ++requestIdRef.current;

      const isReset = mode === "reset";
      const isMore = mode === "more";
      const isRefresh = mode === "refresh";

      // ✅ reset: listeyi boşalt (skeleton OK)
      if (isReset) {
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

        // self limit reset
        if (isSelf) selfLimitRef.current = pageSize;
      } else if (isMore) {
        setLoadingMore(true);
      } else if (isRefresh) {
        // ✅ refresh: listeyi BOŞALTMA (flicker yok)
        setError(null);
      }

      try {
        // -------------------------
        // ✅ SELF PATH (index istemesin)
        // -------------------------
        if (isSelf) {
          // self pagination: limit büyütme
          if (isMore) {
            const next = Math.max(pageSize, Number(selfLimitRef.current) || pageSize) + pageSize;
            selfLimitRef.current = Math.min(next, 400); // hard cap (güvenli)
          } else if (isReset) {
            selfLimitRef.current = pageSize;
          }
          const take = Math.max(pageSize, Number(selfLimitRef.current) || pageSize);

          const diag = [
            `where(ownerId == ${ownerKey})`,
            `limit(${take + 1})`,
            `CLIENT_SORT(createdAt desc)`,
          ];

          // ✅ EMİR 1/3 — self query kanıtı (tek sefer)
          if (__DEV__ && isReset) {
            diagOnce(
              `[RoutesDiag_self_query_${lockKey}]`,
              "[RoutesDiag] self query evidence",
              {
                ownerId: ownerKey,
                used: "self_indexless",
                where_order_limit_cursor: diag,
                cursorEnabled: false,
                pageSize,
                take,
              }
            );
          }

          const colRef = collection(db, "routes");
          const q = query(colRef, where("ownerId", "==", ownerKey), limit(take + 1));

          let snap;
          try {
            snap = await getDocs(q);
          } catch (e) {
            // self indexless’de index hatası beklenmez; olursa trace
            if (isFailedPreconditionIndexError(e)) {
              traceIndexOnce(
                `idx_trace_self_unexpected_${ownerKey}`,
                "[RoutesDiag] self indexless query yine de index istedi (beklenmeyen)",
                { ownerId: ownerKey, err: e?.message || "" }
              );
            }
            throw e;
          }

          if (!isMountedRef.current || reqId !== requestIdRef.current) return;

          const docs = snap.docs || [];
          const pageDocs = docs.slice(0, take);
          const localHasMore = docs.length > take;

          let collected = pageDocs
            .map((d) => {
              const raw = d.data() || {};
              return buildPatchedRouteModel({
                id: d.id,
                raw,
                ownerKey,
                viewerId,
                isSelf: true,
                isFollowing,
              });
            })
            .filter(Boolean);

          // ✅ recent merge (her modda çalışsın)
          const recentIds = readRecentRouteIds(ownerKey);
          if (recentIds.length) {
            const existing = new Set(collected.map((r) => String(r.id)));
            const missing = recentIds.filter((rid) => rid && !existing.has(String(rid))).slice(0, 8);

            if (missing.length) {
              const fetched = [];
              const validKept = [];
              for (const rid of missing) {
                try {
                  const rs = await getDoc(doc(db, "routes", String(rid)));
                  if (!rs.exists()) continue;
                  const raw = rs.data() || {};
                  const m = buildPatchedRouteModel({
                    id: rs.id,
                    raw,
                    ownerKey,
                    viewerId,
                    isSelf: true,
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

          // ✅ client-side sort (createdAt desc null-safe)
          collected = (collected || [])
            .slice()
            .sort((a, b) => getRouteTimeMs(b) - getRouteTimeMs(a))
            .slice(0, take);

          // ✅ başarı → lock kaldır
          lockRef.current = { key: "", reason: "" };
          setAccessStatus("ready");

          // self list: "more" bile olsa replace (limit büyütme zaten full snapshot)
          setRoutes(collected);

          cursorRef.current = null;
          setHasMore(!!localHasMore);

          return;
        }

        // -------------------------
        // NON-SELF PATH (mevcut davranış)
        // -------------------------
        let localCursor = isMore ? cursorRef.current : null;
        let collected = [];
        let localHasMore = false;
        let loops = 0;
        let lastDiag = [];
        let supportsCursor = true;
        let usedMode = "unknown";

        const maxAutoPages = isReset ? 3 : 1;

        while (loops < maxAutoPages) {
          const currentMode =
            isReset
              ? queryModeRef.current === "unknown"
                ? "optimized"
                : queryModeRef.current
              : queryModeRef.current === "unknown"
              ? "legacy"
              : queryModeRef.current;

          const { snap: qsnap, used, diag, supportsCursor: sc } = await runQueryPage({
            ownerKey,
            localCursor,
            modeToUse: currentMode,
          });

          usedMode = used;
          supportsCursor = sc !== false;
          lastDiag = Array.isArray(diag) ? diag : [];

          if (!isMountedRef.current || reqId !== requestIdRef.current) return;

          const docs = qsnap.docs || [];
          const pageDocs = docs.slice(0, pageSize);

          if (__DEV__ && isReset) {
            diagOnce(`[RoutesDiag_used_${lockKey}_${usedMode}]`, "[RoutesDiag] query used", {
              ownerId: ownerKey,
              used: usedMode,
              supportsCursor,
              filters: lastDiag,
              totalDocs: docs.length,
              pageDocs: pageDocs.length,
              isSelf: false,
            });
          }

          if (isReset && queryModeRef.current === "unknown") {
            queryModeRef.current = used; // optimized | legacy
          }

          if (!supportsCursor) {
            localCursor = null;
            localHasMore = false;
          }

          const nextCursor =
            supportsCursor && pageDocs.length ? pageDocs[pageDocs.length - 1] : null;
          localHasMore = supportsCursor ? docs.length > pageSize : false;

          const mapped = pageDocs
            .map((d) => {
              const raw = d.data() || {};
              return buildPatchedRouteModel({
                id: d.id,
                raw,
                ownerKey,
                viewerId,
                isSelf: false,
                isFollowing,
              });
            })
            .filter(Boolean);

          collected = isReset ? collected.concat(mapped) : mapped;
          localCursor = nextCursor;

          if (isReset) {
            if (collected.length > 0) break;
            if (!localHasMore || !localCursor) break;
            loops += 1;
            continue;
          }

          break;
        }

        if (!isMountedRef.current || reqId !== requestIdRef.current) return;

        lockRef.current = { key: "", reason: "" };
        setAccessStatus("ready");

        setRoutes((prev) => {
          if (isReset) return collected;
          if (isMore) return prev.concat(collected);
          if (isRefresh) return collected; // refresh non-self: replace
          return collected;
        });

        cursorRef.current = localCursor;
        setHasMore(!!(localHasMore && localCursor));
      } catch (err) {
        if (!isMountedRef.current || reqId !== requestIdRef.current) return;

        if (isPermissionDeniedError(err)) {
          lockRef.current = { key: lockKey, reason: "forbidden" };
          setAccessStatus("forbidden");
          setError(null);
          if (isReset) setRoutes([]);
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
          if (isReset) setRoutes([]);
          setHasMore(false);
          cursorRef.current = null;
          return;
        }

        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[useUserRoutes] load error", err);
        }

        if (isReset) setRoutes([]);
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

  // ✅ EMİR 2B: ref güncelle (render loop yaratmaz)
  loadPageRef.current = loadPage;

  // ✅ owner/self/viewer değişince initial load (reset)
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
    try {
      loadPageRef.current && loadPageRef.current("reset");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, isSelf, isFollowing, viewerId]);

  // ✅ EMİR 2B: create event → recent yaz + REFRESH (listeyi boşaltma)
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

        // ✅ refresh: liste boşalmaz
        loadPageRef.current && loadPageRef.current("refresh");
      } catch {}
    };

    window.addEventListener("open-route-modal", onOpenRouteModal);
    return () => {
      try {
        window.removeEventListener("open-route-modal", onOpenRouteModal);
      } catch {}
    };
  }, [isSelf, ownerId]);

  // ✅ SELF: geri dönünce (focus/visible) silent refresh (reset yok!)
  useEffect(() => {
    if (!isSelf) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let lastAt = 0;
    const tick = () => {
      const now = Date.now();
      if (now - lastAt < 1200) return;
      lastAt = now;
      try {
        loadPageRef.current && loadPageRef.current("refresh");
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
  }, [isSelf]);

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
      if (lastStop && (!firstStop || String(lastStop.id) !== String(firstStop.id))) {
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
    if (accessStatus === "forbidden" || accessStatus === "login_required") return;
    if (loadingMore || !hasMore || initialLoading) return;
    loadPageRef.current && loadPageRef.current("more");
  }, [hasMore, loadingMore, initialLoading, accessStatus]);

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
    accessStatus,
  };
}