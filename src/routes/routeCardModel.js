// src/routes/routeCardModel.js
// RouteCardMobile için tek, otoriter view model builder.
// Explore (useRoutesData) + Profil (useUserRoutes) aynı standardı kullanır.
//
// EMİR-1 (cover sistemi v2 - reels-ready):
// - Canonical: route.cover = { kind:"image"|"video", url, posterUrl?, source:"manual"|"auto", sourceField, stopId?, mediaId?, updatedAt? }
// - Legacy read-only: coverUrl/previewUrl/thumbnailUrl... (write YOK)
// - Stop fallback (read-only): stopsPreview/stops içinden ilk uygun image veya (video+poster)
// - URL kuralı: UI'ya giden src her zaman https://... veya data:image/... olmalı.
//   (storage path / gs:// -> resolveMediaToHttps ile https downloadURL'ye çevrilir)
//
// EMİR-3 (Placeholder standardını tekleştir + data:image placeholder’ı kaldır):
// - Varsayılan kapak her yerde tek: (PUBLIC_URL base-path uyumlu) /route-default-cover.jpg
// - mylasa-logo.* ve route-default-cover.jpg “kapak seçilmemiş” sayılır (stop fallback’e izin verir)

import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";

// ✅ EMİR-3: tek standart placeholder (PUBLIC_URL uyumlu)
export const DEFAULT_ROUTE_COVER = (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg";

function getVisibilitySource(raw = {}) {
  return raw.visibility ?? raw.audience ?? raw.routeVisibility ?? raw.privacy ?? "";
}

/**
 * public / followers / private / unknown
 */
export function getVisibilityKey(raw = {}) {
  const v = getVisibilitySource(raw).toString().toLowerCase();

  if (!v || v === "public" || v === "everyone") return "public";

  if (
    v === "followers" ||
    v === "followers_only" ||
    v === "followers-only" ||
    v === "friends" ||
    v.includes("follower")
  ) {
    return "followers";
  }

  if (v === "private" || v === "only_me") return "private";

  return "unknown";
}

export function getOwnerIdFromRaw(raw, fallbackOwnerId) {
  if (!raw && !fallbackOwnerId) return null;

  const v =
    raw?.ownerId ||
    raw?.userId ||
    raw?.uid ||
    raw?.accountId ||
    raw?.createdBy ||
    fallbackOwnerId;

  return v || null;
}

export function buildRouteStats(raw = {}) {
  let distanceM =
    raw.totalDistanceM ??
    raw.distanceMeters ??
    raw.distance_m ??
    raw.distance ??
    raw.total_distance_m ??
    0;

  if (
    (!distanceM || !Number.isFinite(Number(distanceM))) &&
    typeof raw.distanceKm === "number" &&
    !Number.isNaN(raw.distanceKm)
  ) {
    distanceM = Number(raw.distanceKm) * 1000;
  }

  let durationMs =
    raw.durationMs ??
    raw.durationMilliseconds ??
    (typeof raw.durationSeconds === "number" ? raw.durationSeconds * 1000 : undefined) ??
    raw.duration ??
    0;

  if (
    (!durationMs || !Number.isFinite(Number(durationMs))) &&
    typeof raw.durationMin === "number" &&
    !Number.isNaN(raw.durationMin)
  ) {
    durationMs = Number(raw.durationMin) * 60000;
  }

  const stops =
    (Array.isArray(raw.stops) && raw.stops.length) ||
    (Array.isArray(raw.waypoints) && raw.waypoints.length) ||
    0;

  const distanceKm =
    typeof raw.distanceKm === "number" && !Number.isNaN(raw.distanceKm)
      ? Number(raw.distanceKm)
      : distanceM / 1000;

  const durationHours = durationMs / (1000 * 60 * 60);
  const avgKmh =
    distanceKm > 0 && durationHours > 0 ? Math.round((distanceKm / durationHours) * 10) / 10 : null;

  return {
    distanceM,
    durationMs,
    stops,
    distanceKm,
    avgKmh,
  };
}

function buildAreas(raw = {}) {
  const rawAreas = raw.areas || raw.location || raw.place || raw.geo || {};

  const city = rawAreas.city || rawAreas.town || raw.city || raw.town || "";
  const country = rawAreas.country || rawAreas.countryName || rawAreas.countryCode || raw.country || "";
  const countryName = rawAreas.countryName || raw.countryName || rawAreas.country || "";
  const countryCode = rawAreas.countryCode || raw.countryCode || "";
  const cc = rawAreas.cc || raw.cc || countryCode || "";

  return {
    city,
    country,
    countryName,
    countryCode,
    cc,
  };
}

function buildTags(raw = {}) {
  if (Array.isArray(raw.tags)) return raw.tags;
  if (Array.isArray(raw.keywords)) return raw.keywords;
  if (Array.isArray(raw.labels)) return raw.labels;
  return [];
}

function buildRating(raw = {}) {
  const ratingCount = Number(raw.ratingCount ?? raw.ratingsCount ?? raw.reviewCount ?? raw.reviewsCount ?? 0) || 0;
  const ratingSum = Number(raw.ratingSum ?? raw.ratingsSum ?? raw.totalRating ?? raw.ratingTotal ?? 0) || 0;

  let ratingAvg = raw.ratingAvg ?? raw.avgRating ?? raw.averageRating ?? null;

  if ((ratingAvg === null || typeof ratingAvg === "undefined") && ratingCount > 0) {
    ratingAvg = ratingSum / ratingCount;
  }

  if (typeof ratingAvg !== "number" || Number.isNaN(ratingAvg)) {
    ratingAvg = 0;
  }

  return { ratingAvg, ratingCount };
}

function buildDistanceToViewer(raw = {}) {
  if (typeof raw.__distanceM === "number" && !Number.isNaN(raw.__distanceM)) return raw.__distanceM;
  if (typeof raw.distanceToViewerM === "number" && !Number.isNaN(raw.distanceToViewerM)) return raw.distanceToViewerM;
  if (typeof raw.distToViewerM === "number" && !Number.isNaN(raw.distToViewerM)) return raw.distToViewerM;
  if (typeof raw.distanceToUserM === "number" && !Number.isNaN(raw.distanceToUserM)) return raw.distanceToUserM;
  return null;
}

// ------------------------
// Media / URL helpers
// ------------------------

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isDataImageUrl(u) {
  const s = (u || "").toString().trim().toLowerCase();
  return s.startsWith("data:image/");
}

function isHttpUrl(u) {
  const s = (u || "").toString().trim().toLowerCase();
  return s.startsWith("https://") || s.startsWith("http://");
}

function looksLikeGsUrl(u) {
  const s = (u || "").toString().trim().toLowerCase();
  return s.startsWith("gs://");
}

function looksLikeStoragePath(u) {
  const s = (u || "").toString().trim();
  if (!s) return false;
  if (isHttpUrl(s) || looksLikeGsUrl(s) || isDataImageUrl(s)) return false;
  // "routes/..", "uploads/.." gibi path'ler
  const cleaned = s.replace(/^\/+/, "");
  return /^[a-zA-Z0-9_\-./]+$/.test(cleaned) && cleaned.includes("/");
}

export function isVideoUrl(url) {
  const u = (url || "").toString().toLowerCase();
  return u.includes(".mp4") || u.includes(".webm") || u.includes(".mov") || u.includes(".m4v") || u.includes("video/");
}

/**
 * KURAL: UI <img> / <video> src’si olarak sadece:
 * - data:image/...  (img için)
 * - https://...     (img/video için)
 * - app default placeholder: /route-default-cover.jpg (PUBLIC_URL uyumlu)
 */
export function isRenderableMediaSrc(u) {
  const s = (u || "").toString().trim();
  if (!s) return false;

  // ✅ EMİR-3: placeholder da renderable say (resolver null döndürmesin)
  if (isPlaceholderCoverUrl(s)) return true;

  if (isDataImageUrl(s)) return true;
  if (!isHttpUrl(s)) return false;
  return s.toLowerCase().startsWith("https://");
}

// ✅ EMİR: placeholder cover standardı (mylasa-logo.* + route-default-cover.jpg)
function stripQueryAndHash(url) {
  try {
    const s = String(url || "").trim();
    if (!s) return "";
    return s.split(/[?#]/)[0];
  } catch {
    return "";
  }
}

function getFileNameFromUrl(url) {
  try {
    const clean = stripQueryAndHash(url);
    if (!clean) return "";
    const parts = clean.split("/");
    return (parts[parts.length - 1] || "").toLowerCase();
  } catch {
    return "";
  }
}

function isPlaceholderCoverUrl(url) {
  const file = getFileNameFromUrl(url);
  if (!file) return false;
  return (
    file === "mylasa-logo.png" ||
    file === "mylasa-logo.svg" ||
    file === "route-default-cover.jpg"
  );
}

function normalizeString(v) {
  return isNonEmptyString(v) ? String(v).trim() : "";
}

function normalizeCandidateUrl(v) {
  const s = normalizeString(v);
  if (!s) return "";
  // ✅ EMİR-3: placeholder cover “seçilmiş kapak” sayılmasın (stop fallback’e izin ver)
  if (isPlaceholderCoverUrl(s)) return "";
  return s;
}

// module-level cache + concurrency
const _dlCache = new Map(); // key -> { status, promise, value }
let _active = 0;
const _queue = [];
const _MAX = 3;

function _enqueue(fn) {
  return new Promise((resolve) => {
    _queue.push({ fn, resolve });
    _pump();
  });
}

function _pump() {
  while (_active < _MAX && _queue.length) {
    const job = _queue.shift();
    _active += 1;
    job
      .fn()
      .then((val) => job.resolve(val))
      .finally(() => {
        _active -= 1;
        _pump();
      });
  }
}

/**
 * resolveMediaToHttps(urlOrPath) -> https downloadURL (veya data:image veya app placeholder)
 * - cache: aynı input 1 kere
 * - max 3 concurrent
 */
export function resolveMediaToHttps(urlOrPath) {
  let raw = (urlOrPath || "").toString().trim();
  if (!raw) return Promise.resolve(null);

  if (isRenderableMediaSrc(raw)) return Promise.resolve(raw);

  const canResolve = looksLikeGsUrl(raw) || looksLikeStoragePath(raw);
  if (!canResolve) return Promise.resolve(null);

  // leading slash varsa temizle ("/routes/.." -> "routes/..")
  if (!looksLikeGsUrl(raw)) raw = raw.replace(/^\/+/, "");

  const cached = _dlCache.get(raw);
  if (cached?.status === "done") return Promise.resolve(cached.value || null);
  if (cached?.status === "pending" && cached.promise) return cached.promise;

  const p = _enqueue(async () => {
    try {
      const storage = getStorage();
      const r = storageRef(storage, raw);
      const url = await getDownloadURL(r);
      const ok = isRenderableMediaSrc(url) ? url : null;
      _dlCache.set(raw, { status: "done", value: ok });
      return ok;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[resolveMediaToHttps] getDownloadURL FAILED:", raw, err?.code || err?.message || err);
      _dlCache.set(raw, { status: "done", value: null });
      return null;
    }
  });

  _dlCache.set(raw, { status: "pending", promise: p });
  return p;
}

function pickFirstString(obj, keys = []) {
  for (const k of keys) {
    const v = obj?.[k];
    const s = normalizeString(v);
    if (s) return s;
  }
  return "";
}

function isVideoHintObj(o = {}) {
  const kind = (o.kind || o.mediaType || o.type || o.mime || "").toString().toLowerCase();
  return kind.includes("video");
}

/**
 * pickCoverCandidate(route) -> { kind, url, posterUrl, sourceField, source, hasVideo }
 * EMİR-1 uyumlu fallback:
 * A) route.cover (canonical) -> image/video
 * B) legacy image alanları (read-only)
 * C) stopsPreview/stops -> image veya (video+poster)
 * D) placeholder (tek standart)
 *
 * Not: url/posterUrl storage path/gs:// olabilir. UI/Hook resolveMediaToHttps ile https'e çevirir.
 */
export function pickCoverCandidate(route) {
  const r = route || {};
  const raw = r.raw || r.data || r.doc || null;

  // (A) canonical cover
  const c = r?.cover && typeof r.cover === "object" ? r.cover : null;
  if (c) {
    const kind = (c.kind || "").toString().toLowerCase() === "video" ? "video" : "image";

    // ✅ EMİR-3: placeholder cover url erken return ETMESİN (normalizeCandidateUrl -> "" yapar)
    const url = normalizeCandidateUrl(c.url);
    const posterUrl = normalizeCandidateUrl(c.posterUrl || c.poster);

    const sf = normalizeString(c.sourceField) || "cover";
    const source = (c.source || "").toString().toLowerCase() === "auto" ? "auto" : "manual";

    if (kind === "video") {
      const vurl = normalizeString(c.url);
      const purl = posterUrl;

      if (vurl && isVideoUrl(vurl) && purl && !isVideoUrl(purl)) {
        return { kind: "video", url: vurl, posterUrl: purl, sourceField: sf || "cover.video", source, hasVideo: true };
      }
      // video cover bozuksa image'e düş (poster)
      if (purl && !isVideoUrl(purl)) {
        return { kind: "image", url: purl, posterUrl: "", sourceField: sf || "cover.poster", source, hasVideo: true };
      }
    } else {
      if (url && !isVideoUrl(url)) {
        return { kind: "image", url, posterUrl: "", sourceField: sf || "cover.url", source, hasVideo: false };
      }
    }
  }

  // (B) legacy read-only image alanları
  const legacyFields = [
    ["coverUrl", r.coverUrl],
    ["coverPhotoUrl", r.coverPhotoUrl],
    ["coverImageUrl", r.coverImageUrl],
    ["previewUrl", r.previewUrl],
    ["thumbnailUrl", r.thumbnailUrl],
    ["thumbUrl", r.thumbUrl],
    ["imageUrl", r.imageUrl],
    ["photoUrl", r.photoUrl],
    ["mediaUrl", r.mediaUrl],
    ["raw.coverUrl", raw?.coverUrl],
    ["raw.previewUrl", raw?.previewUrl],
    ["raw.thumbnailUrl", raw?.thumbnailUrl],
    ["raw.mediaUrl", raw?.mediaUrl],
  ];

  for (const [k, v] of legacyFields) {
    const u = normalizeCandidateUrl(v);
    if (!u) continue;
    if (isVideoUrl(u)) continue;
    return { kind: "image", url: u, posterUrl: "", sourceField: k, source: "auto", hasVideo: false };
  }

  // (C) stopsPreview/stops
  const stops = Array.isArray(r?.stopsPreview) ? r.stopsPreview : Array.isArray(r?.stops) ? r.stops : [];
  for (const st of stops) {
    if (!st) continue;

    const stopId = normalizeString(st.id) || "";
    const poster = normalizeCandidateUrl(st.posterUrl || st.poster || st.thumbUrl || st.thumbnailUrl || st.previewUrl);
    const videoUrl = normalizeString(st.videoUrl || st.videoURL || st.video || "");
    const mediaUrl = normalizeString(st.mediaUrl || st.mediaURL || st.url || st.src || "");
    const imageUrl = normalizeCandidateUrl(st.imageUrl || st.photoUrl || "");

    const videoHint =
      isVideoUrl(videoUrl) ||
      isVideoUrl(mediaUrl) ||
      isVideoHintObj(st) ||
      ((st.type || st.mediaType || st.kind || st.mime || "").toString().toLowerCase().includes("video"));

    // video + poster => video cover
    if (videoHint) {
      const vurl = isVideoUrl(videoUrl) ? videoUrl : isVideoUrl(mediaUrl) ? mediaUrl : "";
      if (vurl && poster && !isVideoUrl(poster)) {
        return {
          kind: "video",
          url: vurl,
          posterUrl: poster,
          sourceField: "stopMedia.videoPoster",
          source: "auto",
          hasVideo: true,
          stopId,
        };
      }
      // poster var ama video url yoksa image cover (poster)
      if (poster && !isVideoUrl(poster)) {
        return {
          kind: "image",
          url: poster,
          posterUrl: "",
          sourceField: "stopMedia.poster",
          source: "auto",
          hasVideo: true,
          stopId,
        };
      }
    }

    // image cover
    const img = imageUrl && !isVideoUrl(imageUrl) ? imageUrl : "";
    const mu0 = normalizeCandidateUrl(mediaUrl);
    const mu = mu0 && !isVideoUrl(mu0) ? mu0 : "";
    if (img) {
      return { kind: "image", url: img, posterUrl: "", sourceField: "stopMedia.image", source: "auto", hasVideo: false, stopId };
    }
    if (mu) {
      return { kind: "image", url: mu, posterUrl: "", sourceField: "stopMedia.mediaUrl", source: "auto", hasVideo: false, stopId };
    }
  }

  // (D) placeholder (tek standart)
  return { kind: "image", url: DEFAULT_ROUTE_COVER, posterUrl: "", sourceField: "placeholder", source: "auto", hasVideo: false };
}

function ensureCanonicalCover(rawObj) {
  const r = rawObj || {};
  const rawCover = r?.cover && typeof r.cover === "object" ? r.cover : null;

  // 1) rawCover varsa önce onu canonical yap
  if (rawCover) {
    const source = (rawCover.source || "").toString().toLowerCase() === "auto" ? "auto" : "manual";
    const sourceField = normalizeString(rawCover.sourceField) || "cover";

    // video cover adayları
    const videoCandidate = pickFirstString(rawCover, ["url", "videoUrl", "videoURL", "video", "mediaUrl", "mediaURL"]);
    const posterCandidate = pickFirstString(rawCover, ["posterUrl", "poster", "thumbUrl", "thumbnailUrl", "previewUrl", "imageUrl", "photoUrl"]);

    const kindHint = (rawCover.kind || "").toString().toLowerCase();
    const isVideo = kindHint === "video" || isVideoHintObj(rawCover) || isVideoUrl(videoCandidate);

    if (isVideo) {
      const vurl = normalizeString(videoCandidate);
      const purl = normalizeCandidateUrl(posterCandidate);

      if (vurl && isVideoUrl(vurl) && purl && !isVideoUrl(purl)) {
        return {
          kind: "video",
          url: vurl,
          posterUrl: purl,
          source,
          sourceField: sourceField || "cover.video",
          stopId: rawCover.stopId || null,
          mediaId: rawCover.mediaId || null,
          updatedAt: rawCover.updatedAt || null,
        };
      }

      // video cover bozuksa poster ile image'e düş
      if (purl && !isVideoUrl(purl)) {
        return {
          kind: "image",
          url: purl,
          posterUrl: "",
          source,
          sourceField: sourceField || "cover.poster",
          stopId: rawCover.stopId || null,
          mediaId: rawCover.mediaId || null,
          updatedAt: rawCover.updatedAt || null,
        };
      }
    }

    // image cover
    const imageCandidate = normalizeCandidateUrl(rawCover.url);
    if (imageCandidate && !isVideoUrl(imageCandidate)) {
      return {
        kind: "image",
        url: imageCandidate,
        posterUrl: "",
        source,
        sourceField: sourceField || "cover.url",
        stopId: rawCover.stopId || null,
        mediaId: rawCover.mediaId || null,
        updatedAt: rawCover.updatedAt || null,
      };
    }
  }

  // 2) fallback: legacy + stopsPreview/stops + placeholder
  const cand = pickCoverCandidate({ ...r, cover: null });
  return {
    kind: cand.kind === "video" ? "video" : "image",
    url: cand.url || DEFAULT_ROUTE_COVER,
    posterUrl: cand.kind === "video" ? cand.posterUrl || "" : "",
    source: "auto",
    sourceField: cand.sourceField || (cand.kind === "video" ? "auto.video" : "auto.image"),
    stopId: cand.stopId || null,
    mediaId: cand.mediaId || null,
    updatedAt: null,
  };
}

/**
 * Canonical RouteCardMobile modeli.
 */
export function buildRouteCardModel({ id, raw, ownerIdFallback = null, viewerId = null } = {}) {
  const safeRaw = raw || {};

  const finalId = id ?? safeRaw.id ?? safeRaw.routeId ?? safeRaw._id ?? null;
  const ownerId = getOwnerIdFromRaw(safeRaw, ownerIdFallback);

  const stats = buildRouteStats(safeRaw);
  const areas = buildAreas(safeRaw);
  const tags = buildTags(safeRaw);
  const { ratingAvg, ratingCount } = buildRating(safeRaw);
  const visibilityKey = getVisibilityKey(safeRaw);

  const createdAt = safeRaw.createdAt ?? safeRaw.startedAt ?? safeRaw.startTime ?? safeRaw.finishedAt ?? null;
  const finishedAt = safeRaw.finishedAt ?? safeRaw.endTime ?? null;

  const deletedAt =
    safeRaw.deletedAt ||
    (safeRaw.deleted === true || safeRaw.isDeleted ? safeRaw.deletedAt || null : null);

  const distanceToViewerM = buildDistanceToViewer(safeRaw);
  const title = safeRaw.title || safeRaw.name || safeRaw.routeName || "";

  const canonicalCover = ensureCanonicalCover(safeRaw);

  const model = {
    id: finalId,
    ownerId,
    title,
    visibility: getVisibilitySource(safeRaw) || visibilityKey || "public",
    createdAt,
    finishedAt,
    deletedAt,
    totalDistanceM: stats.distanceM,
    durationMs: stats.durationMs,
    distanceKm: stats.distanceKm,
    ratingAvg,
    ratingCount,
    areas,
    tags,
    __distanceM: distanceToViewerM,
    stats,
    raw: safeRaw,
    viewerId,

    // ✅ EMİR-1 v2: tek kaynak
    cover: canonicalCover,
  };

  return {
    ...safeRaw,
    ...model,
  };
}
