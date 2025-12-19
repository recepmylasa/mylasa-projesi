// src/routes/routeCardModel.js
// RouteCardMobile için tek, otoriter view model builder.
// Explore (useRoutesData) + Profil (useUserRoutes) aynı standardı kullanır.

import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";

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

  // Sadece distanceKm varsa buradan türet
  if ((!distanceM || !Number.isFinite(Number(distanceM))) && typeof raw.distanceKm === "number" && !Number.isNaN(raw.distanceKm)) {
    distanceM = Number(raw.distanceKm) * 1000;
  }

  let durationMs =
    raw.durationMs ??
    raw.durationMilliseconds ??
    (typeof raw.durationSeconds === "number" ? raw.durationSeconds * 1000 : undefined) ??
    raw.duration ??
    0;

  // Dakika cinsinden duration varsa
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
  };

  return {
    ...safeRaw,
    ...model,
  };
}

// ------------------------
// Cover selection + resolver (Profil Grid)
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
  // "routes/..", "uploads/..", "cards/.." vb.
  return /^[a-zA-Z0-9_\-./]+$/.test(s) && s.includes("/");
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
  // kullanıcı "https direct" istedi — burada https zorunlu tutalım
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

  // Direct acceptable
  if (isRenderableMediaSrc(raw) || isDataImageUrl(raw)) return Promise.resolve(raw);

  // gs:// or storage path -> try getDownloadURL
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

  const thumb = item.thumbnail || item.thumb || item.poster || item.preview || item.previewUrl || item.thumbnailUrl || item.posterUrl;

  const typeRaw = (item.type || item.mediaType || item.kind || item.mime || "").toString().toLowerCase();

  const urlStr = typeof url === "string" ? url.trim() : "";
  const thumbStr = typeof thumb === "string" ? thumb.trim() : "";

  if (!urlStr && !thumbStr) return null;

  const isVid = typeRaw.includes("video") || typeRaw.includes("mp4") || typeRaw.includes("webm") || (urlStr ? isVideoUrl(urlStr) : false);

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
      value.coverUrl,
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
    r.previewUrl,
    r.thumbnailUrl,
    r.thumbUrl,
    r.imageUrl,
    r.photoUrl,
    r.mediaUrl,
    raw?.coverUrl,
    raw?.coverPhotoUrl,
    raw?.coverImageUrl,
    raw?.previewUrl,
    raw?.thumbnailUrl,
    raw?.mediaUrl,
    data?.coverUrl,
    data?.previewUrl,
    data?.thumbnailUrl,
    data?.mediaUrl,
  ].filter(Boolean);

  for (const it of lateCandidates) collectMediaFromValue(it, out);

  const stops = Array.isArray(route?.stopsPreview) ? route.stopsPreview : Array.isArray(route?.stops) ? route.stops : [];
  for (const st of stops) {
    if (!st) continue;
    collectMediaFromValue(st.media, out);
    collectMediaFromValue(st.mediaUrl, out);
    collectMediaFromValue(st.imageUrl, out);
    collectMediaFromValue(st.photoUrl, out);
    collectMediaFromValue(st.thumbUrl, out);
    collectMediaFromValue(st.thumbnailUrl, out);
  }

  return out;
}

function toFiniteNumber(x) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function getLatLngFromStopLoose(stop) {
  if (!stop) return null;

  const s = stop;
  const raw = s.raw || s.data || null;

  // direct fields (expanded)
  const lat = toFiniteNumber(s.lat ?? s.latitude ?? raw?.lat ?? raw?.latitude);
  const lng = toFiniteNumber(s.lng ?? s.lon ?? s.longitude ?? raw?.lng ?? raw?.lon ?? raw?.longitude);

  if (lat != null && lng != null) return { lat, lng };

  const loc =
    s.location ||
    s.position ||
    s.coordinates ||
    s.latLng ||
    s.geo ||
    s.geopoint ||
    s.point ||
    s.coords ||
    raw?.location ||
    raw?.position ||
    raw?.coordinates ||
    raw?.latLng ||
    raw?.geo ||
    raw?.geopoint ||
    raw?.point ||
    raw?.coords ||
    null;

  if (loc) {
    const lat2 = toFiniteNumber(loc.lat ?? loc.latitude);
    const lng2 = toFiniteNumber(loc.lng ?? loc.lon ?? loc.longitude);
    if (lat2 != null && lng2 != null) return { lat: lat2, lng: lng2 };
  }

  return null;
}

function buildStaticMapUrl({ start, end }) {
  const key = (process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "").trim();
  if (!key || !start || !end) return "";

  const size = "640x640";
  const scale = "2";
  const maptype = "roadmap";

  const m1 = `color:0x111111|label:S|${start.lat},${start.lng}`;
  const m2 = `color:0x111111|label:E|${end.lat},${end.lng}`;

  const params = [
    `size=${encodeURIComponent(size)}`,
    `scale=${encodeURIComponent(scale)}`,
    `maptype=${encodeURIComponent(maptype)}`,
    `markers=${encodeURIComponent(m1)}`,
    `markers=${encodeURIComponent(m2)}`,
    `key=${encodeURIComponent(key)}`,
  ];

  return `https://maps.googleapis.com/maps/api/staticmap?${params.join("&")}`;
}

/**
 * pickCoverCandidate(route) -> { kind, url, sourceField, hasVideo }
 * Not: url storage path/gs:// olabilir. UI, resolveMediaToHttps ile https'e çevirmeli.
 */
export function pickCoverCandidate(route) {
  const r = route || {};
  const raw = r.raw || r.data || r.doc || null;

  // (A) user cover fields (highest)
  const coverFields = [
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

  for (const [k, v] of coverFields) {
    if (isNonEmptyString(v)) return { kind: "image", url: String(v).trim(), sourceField: k, hasVideo: false };
  }

  // (B) first stop / route media
  const media = extractMedia(r);
  const hasVideo = media.some((m) => m.type === "video");

  const firstImage = media.find((m) => m.type === "image" && isNonEmptyString(m.url));
  if (firstImage) return { kind: "image", url: String(firstImage.url).trim(), sourceField: "media:firstImage", hasVideo };

  const firstVideo = media.find((m) => m.type === "video" && (isNonEmptyString(m.thumb) || isNonEmptyString(m.rawUrl) || isNonEmptyString(m.url)));
  if (firstVideo) {
    if (isNonEmptyString(firstVideo.thumb)) {
      return { kind: "image", url: String(firstVideo.thumb).trim(), sourceField: "media:firstVideoThumb", hasVideo: true };
    }
    return { kind: "video", url: String(firstVideo.rawUrl || firstVideo.url).trim(), sourceField: "media:firstVideo", hasVideo: true };
  }

  // (C) static map fallback (if we have coords)
  const stops = Array.isArray(r?.stopsPreview) ? r.stopsPreview : Array.isArray(r?.stops) ? r.stops : [];
  const start = stops.map(getLatLngFromStopLoose).find(Boolean) || null;
  const end = [...stops].reverse().map(getLatLngFromStopLoose).find(Boolean) || null;

  const staticUrl = buildStaticMapUrl({ start, end });
  if (staticUrl) return { kind: "image", url: staticUrl, sourceField: "staticMap", hasVideo: false };

  return { kind: "placeholder", url: "", sourceField: "placeholder", hasVideo: false };
}
