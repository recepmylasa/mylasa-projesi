// src/routes/routeCardModel.js
// RouteCardMobile için tek, otoriter view model builder.
// Explore (useRoutesData) + Profil (useUserRoutes) aynı standardı kullanır.
//
// EMİR-1 (cover sistemi v1):
// - Canonical read: route.cover.url
// - Legacy read-only: coverUrl/previewUrl/thumbnailUrl...
// - Video url kapak OLAMAZ (poster/image varsa o olur)
// - Placeholder kararı UI tarafında verilir (bu helper url:"" dönebilir)
//
// EMİR-1.2:
// - buildRouteCardModel çıktısında route.cover alanı her zaman normalize edilmiş olsun (view-model).

import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";

const DEFAULT_ROUTE_COVER_URL = "/route-default-cover.jpg";

function getVisibilitySource(raw = {}) {
  return raw.visibility ?? raw.audience ?? raw.routeVisibility ?? raw.privacy ?? "";
}

/**
 * public / followers / private / unknown
 */
export function getVisibilityKey(raw = {}) {
  const v = getVisibilitySource(raw).toString().toLowerCase();

  if (!v || v === "public" || v === "everyone") return "public";

  if (v === "followers" || v === "followers_only" || v === "followers-only" || v === "friends" || v.includes("follower")) {
    return "followers";
  }

  if (v === "private" || v === "only_me") return "private";

  return "unknown";
}

export function getOwnerIdFromRaw(raw, fallbackOwnerId) {
  if (!raw && !fallbackOwnerId) return null;

  const v = raw?.ownerId || raw?.userId || raw?.uid || raw?.accountId || raw?.createdBy || fallbackOwnerId;

  return v || null;
}

export function buildRouteStats(raw = {}) {
  let distanceM = raw.totalDistanceM ?? raw.distanceMeters ?? raw.distance_m ?? raw.distance ?? raw.total_distance_m ?? 0;

  if ((!distanceM || !Number.isFinite(Number(distanceM))) && typeof raw.distanceKm === "number" && !Number.isNaN(raw.distanceKm)) {
    distanceM = Number(raw.distanceKm) * 1000;
  }

  let durationMs =
    raw.durationMs ??
    raw.durationMilliseconds ??
    (typeof raw.durationSeconds === "number" ? raw.durationSeconds * 1000 : undefined) ??
    raw.duration ??
    0;

  if ((!durationMs || !Number.isFinite(Number(durationMs))) && typeof raw.durationMin === "number" && !Number.isNaN(raw.durationMin)) {
    durationMs = Number(raw.durationMin) * 60000;
  }

  const stops = (Array.isArray(raw.stops) && raw.stops.length) || (Array.isArray(raw.waypoints) && raw.waypoints.length) || 0;

  const distanceKm = typeof raw.distanceKm === "number" && !Number.isNaN(raw.distanceKm) ? Number(raw.distanceKm) : distanceM / 1000;

  const durationHours = durationMs / (1000 * 60 * 60);
  const avgKmh = distanceKm > 0 && durationHours > 0 ? Math.round((distanceKm / durationHours) * 10) / 10 : null;

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
  if (typeof raw.__distanceM === "number" && !Number.isNaN(raw.__distanceM)) {
    return raw.__distanceM;
  }
  if (typeof raw.distanceToViewerM === "number" && !Number.isNaN(raw.distanceToViewerM)) {
    return raw.distanceToViewerM;
  }
  if (typeof raw.distToViewerM === "number" && !Number.isNaN(raw.distToViewerM)) {
    return raw.distToViewerM;
  }
  if (typeof raw.distanceToUserM === "number" && !Number.isNaN(raw.distanceToUserM)) {
    return raw.distanceToUserM;
  }
  return null;
}

// ------------------------
// Cover resolver helpers (shared)
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
  return /^[a-zA-Z0-9_\-./]+$/.test(s) && s.includes("/");
}

function isVideoUrl(url) {
  const u = (url || "").toString().toLowerCase();
  return u.includes(".mp4") || u.includes(".webm") || u.includes(".mov") || u.includes(".m4v") || u.includes("video/");
}

/**
 * KURAL: Grid sadece doğrudan açılabilen HTTPS URL veya data:image src basar.
 * (Storage path / gs:// -> resolveMediaToHttps ile https downloadURL'ye çevrilir)
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
 * resolveMediaToHttps(urlOrPath) -> https downloadURL
 * - cache: aynı input 1 kere
 * - max 3 concurrent
 */
export function resolveMediaToHttps(urlOrPath) {
  const raw = (urlOrPath || "").toString().trim();
  if (!raw) return Promise.resolve(null);

  if (isRenderableMediaSrc(raw) || isDataImageUrl(raw)) return Promise.resolve(raw);

  const canResolve = looksLikeGsUrl(raw) || looksLikeStoragePath(raw);
  if (!canResolve) return Promise.resolve(null);

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

/**
 * pickCoverCandidate(route) -> { kind, url, sourceField, hasVideo }
 * EMİR-1 uyumlu: cover.url → legacy → stopMedia(image/poster) → placeholder(empty)
 * Not: url storage path/gs:// olabilir. UI, resolveMediaToHttps ile https'e çevirmeli.
 */
export function pickCoverCandidate(route) {
  const r = route || {};
  const raw = r.raw || r.data || r.doc || null;

  // (A) canonical cover.url
  const coverUrl = isNonEmptyString(r?.cover?.url) ? String(r.cover.url).trim() : "";
  if (coverUrl && !isVideoUrl(coverUrl)) {
    const sf = isNonEmptyString(r?.cover?.sourceField) ? String(r.cover.sourceField) : "cover.url";
    const hv = !!r?.cover?.fromVideoPoster || !!r?.cover?.hasVideoPoster;
    return { kind: "image", url: coverUrl, sourceField: sf, hasVideo: hv };
  }

  // (B) legacy read-only
  const legacyFields = [
    ["coverUrl", r.coverUrl],
    ["coverPhotoUrl", r.coverPhotoUrl],
    ["coverImageUrl", r.coverImageUrl],
    ["previewUrl", r.previewUrl],
    ["thumbnailUrl", r.thumbnailUrl],
    ["mediaUrl", r.mediaUrl],
    ["thumbUrl", r.thumbUrl],
    ["imageUrl", r.imageUrl],
    ["raw.coverUrl", raw?.coverUrl],
    ["raw.previewUrl", raw?.previewUrl],
    ["raw.thumbnailUrl", raw?.thumbnailUrl],
    ["raw.mediaUrl", raw?.mediaUrl],
  ];

  for (const [k, v] of legacyFields) {
    if (isNonEmptyString(v)) {
      const u = String(v).trim();
      if (!u || isVideoUrl(u)) continue;
      return { kind: "image", url: u, sourceField: k, hasVideo: false };
    }
  }

  // (C) stop media (image) / video poster
  const stops = Array.isArray(r?.stopsPreview) ? r.stopsPreview : Array.isArray(r?.stops) ? r.stops : [];
  for (const st of stops) {
    if (!st) continue;

    const poster = isNonEmptyString(st.posterUrl) ? String(st.posterUrl).trim() : isNonEmptyString(st.poster) ? String(st.poster).trim() : "";
    const mu = isNonEmptyString(st.mediaUrl) ? String(st.mediaUrl).trim() : isNonEmptyString(st.imageUrl) ? String(st.imageUrl).trim() : "";

    const videoHint = isVideoUrl(st.videoUrl) || isVideoUrl(st.mediaUrl) || ((st.type || st.mediaType || st.kind || st.mime || "").toString().toLowerCase().includes("video"));

    if (poster && !isVideoUrl(poster) && videoHint) return { kind: "image", url: poster, sourceField: "stopMedia.poster", hasVideo: true };
    if (mu && !isVideoUrl(mu)) return { kind: "image", url: mu, sourceField: "stopMedia.image", hasVideo: false };
  }

  // (D) placeholder (UI decides global asset)
  return { kind: "placeholder", url: "", sourceField: "placeholder", hasVideo: false };
}

// -------- EMİR-1.2 canonical cover builder (view-model) --------
function normalizeCandidate(u) {
  if (!isNonEmptyString(u)) return "";
  const s = String(u).trim();
  if (!s) return "";
  if (isVideoUrl(s)) return "";
  return s;
}

function ensureCanonicalCover(rawObj) {
  const r = rawObj || {};

  const rawCover = r?.cover && typeof r.cover === "object" ? r.cover : null;
  const manual = normalizeCandidate(rawCover?.url);
  if (manual) {
    return {
      ...(rawCover || {}),
      url: manual,
      kind: "image",
      source: rawCover?.source === "auto" ? "auto" : "manual",
      sourceField: rawCover?.sourceField || "cover.url",
      fromVideoPoster: false,
    };
  }

  const legacy = pickCoverCandidate({ ...r, cover: null });
  if (legacy?.kind === "image" && normalizeCandidate(legacy.url)) {
    return {
      url: String(legacy.url).trim(),
      kind: "image",
      source: "auto",
      sourceField: legacy.sourceField || "legacy",
      fromVideoPoster: !!legacy.hasVideo,
    };
  }

  // stop media was already attempted inside pickCoverCandidate; if still none, default
  return {
    url: DEFAULT_ROUTE_COVER_URL,
    kind: "image",
    source: "auto",
    sourceField: "default",
    fromVideoPoster: false,
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

  const deletedAt = safeRaw.deletedAt || (safeRaw.deleted === true || safeRaw.isDeleted ? safeRaw.deletedAt || null : null);

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

    // ✅ EMİR-1.2: tek kaynak
    cover: canonicalCover,
  };

  return {
    ...safeRaw,
    ...model,
  };
}
