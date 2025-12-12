// src/routes/routeCardModel.js
// RouteCardMobile için tek, otoriter view model builder.
// Explore (useRoutesData) + Profil (useUserRoutes) aynı standardı kullanır.

function getVisibilitySource(raw = {}) {
  return (
    raw.visibility ??
    raw.audience ??
    raw.routeVisibility ??
    raw.privacy ??
    ""
  );
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

  // Sadece distanceKm varsa buradan türet
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
    (typeof raw.durationSeconds === "number"
      ? raw.durationSeconds * 1000
      : undefined) ??
    raw.duration ??
    0;

  // Dakika cinsinden duration varsa
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
    distanceKm > 0 && durationHours > 0
      ? Math.round((distanceKm / durationHours) * 10) / 10
      : null;

  return {
    distanceM,
    durationMs,
    stops,
    distanceKm,
    avgKmh,
  };
}

function buildAreas(raw = {}) {
  const rawAreas =
    raw.areas ||
    raw.location ||
    raw.place ||
    raw.geo ||
    {};

  const city =
    rawAreas.city ||
    rawAreas.town ||
    raw.city ||
    raw.town ||
    "";

  const country =
    rawAreas.country ||
    rawAreas.countryName ||
    rawAreas.countryCode ||
    raw.country ||
    "";

  const countryName =
    rawAreas.countryName ||
    raw.countryName ||
    rawAreas.country ||
    "";

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
  const ratingCount =
    Number(
      raw.ratingCount ??
        raw.ratingsCount ??
        raw.reviewCount ??
        raw.reviewsCount ??
        0
    ) || 0;

  const ratingSum =
    Number(
      raw.ratingSum ??
        raw.ratingsSum ??
        raw.totalRating ??
        raw.ratingTotal ??
        0
    ) || 0;

  let ratingAvg =
    raw.ratingAvg ??
    raw.avgRating ??
    raw.averageRating ??
    null;

  if (
    (ratingAvg === null || typeof ratingAvg === "undefined") &&
    ratingCount > 0
  ) {
    ratingAvg = ratingSum / ratingCount;
  }

  if (typeof ratingAvg !== "number" || Number.isNaN(ratingAvg)) {
    ratingAvg = 0;
  }

  return { ratingAvg, ratingCount };
}

function buildDistanceToViewer(raw = {}) {
  if (
    typeof raw.__distanceM === "number" &&
    !Number.isNaN(raw.__distanceM)
  ) {
    return raw.__distanceM;
  }
  if (
    typeof raw.distanceToViewerM === "number" &&
    !Number.isNaN(raw.distanceToViewerM)
  ) {
    return raw.distanceToViewerM;
  }
  if (
    typeof raw.distToViewerM === "number" &&
    !Number.isNaN(raw.distToViewerM)
  ) {
    return raw.distToViewerM;
  }
  if (
    typeof raw.distanceToUserM === "number" &&
    !Number.isNaN(raw.distanceToUserM)
  ) {
    return raw.distanceToUserM;
  }
  return null;
}

/**
 * Canonical RouteCardMobile modeli.
 *
 * DÖNEN OBJE (özet):
 * {
 *   id, ownerId, title,
 *   totalDistanceM, durationMs, distanceKm,
 *   ratingAvg, ratingCount,
 *   areas, tags,
 *   __distanceM,
 *   visibility, createdAt, finishedAt, deletedAt,
 *   stats, raw, viewerId
 *   ...raw'daki diğer tüm alanlar (routeGeo vs.)
 * }
 */
export function buildRouteCardModel({
  id,
  raw,
  ownerIdFallback = null,
  viewerId = null,
} = {}) {
  const safeRaw = raw || {};

  const finalId =
    id ??
    safeRaw.id ??
    safeRaw.routeId ??
    safeRaw._id ??
    null;

  const ownerId = getOwnerIdFromRaw(safeRaw, ownerIdFallback);
  const stats = buildRouteStats(safeRaw);
  const areas = buildAreas(safeRaw);
  const tags = buildTags(safeRaw);
  const { ratingAvg, ratingCount } = buildRating(safeRaw);
  const visibilityKey = getVisibilityKey(safeRaw);

  const createdAt =
    safeRaw.createdAt ??
    safeRaw.startedAt ??
    safeRaw.startTime ??
    safeRaw.finishedAt ??
    null;

  const finishedAt = safeRaw.finishedAt ?? safeRaw.endTime ?? null;

  const deletedAt =
    safeRaw.deletedAt ||
    (safeRaw.deleted === true || safeRaw.isDeleted
      ? safeRaw.deletedAt || null
      : null);

  const distanceToViewerM = buildDistanceToViewer(safeRaw);

  const title =
    safeRaw.title ||
    safeRaw.name ||
    safeRaw.routeName ||
    "";

  const model = {
    id: finalId,
    ownerId,
    title,
    visibility:
      getVisibilitySource(safeRaw) ||
      visibilityKey ||
      "public",
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

  // ÖNEMLİ:
  // - raw içindeki tüm alanlar (routeGeo vb.) korunur
  // - Standart alanlar (title, distanceKm, ratingAvg...) override eder.
  return {
    ...safeRaw,
    ...model,
  };
}
