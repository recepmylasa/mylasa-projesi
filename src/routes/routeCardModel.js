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
// Not:
// - buildRouteCardModel sync kalır. Asıl "https’e çevirme" işi hook/UI tarafında resolveMediaToHttps ile tamamlanır.
// - Placeholder burada data:image SVG olarak verilir (relative path yok).

import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";

export const DEFAULT_ROUTE_COVER =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0b0f"/>
      <stop offset="0.55" stop-color="#12121a"/>
      <stop offset="1" stop-color="#0b0b0f"/>
    </linearGradient>
    <radialGradient id="r" cx="35%" cy="28%" r="75%">
      <stop offset="0" stop-color="#2a2a3a" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#0b0b0f" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.10"/>
    </linearGradient>
  </defs>

  <rect width="720" height="1280" fill="url(#g)"/>
  <rect width="720" height="1280" fill="url(#r)"/>

  <path d="M0 920 C140 880 260 900 360 940 C500 1000 590 1010 720 980 L720 1280 L0 1280 Z" fill="#0f0f16" opacity="0.9"/>
  <path d="M0 900 C140 860 260 880 360 920 C500 980 590 990 720 960" stroke="#ffffff" opacity="0.06" stroke-width="2" fill="none"/>

  <g opacity="0.85" transform="translate(80,180)">
    <circle cx="280" cy="360" r="230" fill="#0c0c12" opacity="0.75"/>
    <path d="M140 360 C220 240 340 240 420 360 C340 520 220 520 140 360 Z" fill="#1b1b26"/>
    <path d="M220 360 C250 315 310 315 340 360 C310 420 250 420 220 360 Z" fill="#2a2a3a"/>
    <path d="M280 260 L320 360 L280 460 L240 360 Z" fill="#3a3a52" opacity="0.9"/>
    <circle cx="280" cy="360" r="10" fill="#ffffff" opacity="0.35"/>
  </g>

  <rect x="0" y="0" width="720" height="1280" fill="url(#shine)"/>

  <g opacity="0.55" fill="#ffffff">
    <circle cx="120" cy="140" r="2"/>
    <circle cx="210" cy="90" r="1.5"/>
    <circle cx="620" cy="180" r="2"/>
    <circle cx="560" cy="120" r="1.2"/>
    <circle cx="640" cy="320" r="1.6"/>
    <circle cx="90" cy="320" r="1.2"/>
    <circle cx="170" cy="260" r="1.6"/>
  </g>
</svg>
`);

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
 */
export function isRenderableMediaSrc(u) {
  const s = (u || "").toString().trim();
  if (!s) return false;
  if (isDataImageUrl(s)) return true;
  if (!isHttpUrl(s)) return false;
  return s.toLowerCase().startsWith("https://");
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
 * resolveMediaToHttps(urlOrPath) -> https downloadURL (veya data:image)
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

function normalizeString(v) {
  return isNonEmptyString(v) ? String(v).trim() : "";
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
 * D) placeholder
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
    const url = normalizeString(c.url);
    const posterUrl = normalizeString(c.posterUrl || c.poster);
    const sf = normalizeString(c.sourceField) || "cover";
    const source = (c.source || "").toString().toLowerCase() === "auto" ? "auto" : "manual";

    if (kind === "video") {
      if (url && isVideoUrl(url) && posterUrl && !isVideoUrl(posterUrl)) {
        return { kind: "video", url, posterUrl, sourceField: sf || "cover.video", source, hasVideo: true };
      }
      // video cover bozuksa image'e düş
      if (posterUrl && !isVideoUrl(posterUrl)) {
        return { kind: "image", url: posterUrl, posterUrl: "", sourceField: sf || "cover.poster", source, hasVideo: true };
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
    const u = normalizeString(v);
    if (!u) continue;
    if (isVideoUrl(u)) continue;
    return { kind: "image", url: u, posterUrl: "", sourceField: k, source: "auto", hasVideo: false };
  }

  // (C) stopsPreview/stops
  const stops = Array.isArray(r?.stopsPreview) ? r.stopsPreview : Array.isArray(r?.stops) ? r.stops : [];
  for (const st of stops) {
    if (!st) continue;

    const stopId = normalizeString(st.id) || "";
    const poster = normalizeString(st.posterUrl || st.poster || st.thumbUrl || st.thumbnailUrl || st.previewUrl);
    const videoUrl = normalizeString(st.videoUrl || st.videoURL || st.video || "");
    const mediaUrl = normalizeString(st.mediaUrl || st.mediaURL || st.url || st.src || "");
    const imageUrl = normalizeString(st.imageUrl || st.photoUrl || "");

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
    const img = !isVideoUrl(imageUrl) ? imageUrl : "";
    const mu = !isVideoUrl(mediaUrl) ? mediaUrl : "";
    if (img) {
      return { kind: "image", url: img, posterUrl: "", sourceField: "stopMedia.image", source: "auto", hasVideo: false, stopId };
    }
    if (mu) {
      return { kind: "image", url: mu, posterUrl: "", sourceField: "stopMedia.mediaUrl", source: "auto", hasVideo: false, stopId };
    }
  }

  // (D) placeholder
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
      const purl = normalizeString(posterCandidate);

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
    const imageCandidate = normalizeString(rawCover.url);
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
