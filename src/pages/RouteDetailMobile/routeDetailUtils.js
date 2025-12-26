// src/pages/RouteDetailMobile/routeDetailUtils.js
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";

export const DEFAULT_ROUTE_COVER_URL = "/route-default-cover.jpg";

export function resolveRouteCoverUrl(route = {}) {
  try {
    const r = route || {};
    const direct = r?.cover?.url ? String(r.cover.url) : "";
    if (direct) return direct;

    const legacy =
      r.coverUrl ||
      r.coverPhotoUrl ||
      r.coverImageUrl ||
      r.previewUrl ||
      r.thumbnailUrl ||
      "";

    if (legacy) return String(legacy);
    return DEFAULT_ROUTE_COVER_URL;
  } catch {
    return DEFAULT_ROUTE_COVER_URL;
  }
}

export function normalizeRouteCover(route = {}) {
  try {
    const r = route || {};
    const rawKind = r?.cover?.kind;
    const kind =
      rawKind === "picked" || rawKind === "auto" || rawKind === "default"
        ? rawKind
        : null;

    const url = r?.cover?.url ? String(r.cover.url) : "";
    const stopId = r?.cover?.stopId ? String(r.cover.stopId) : null;
    const mediaId = r?.cover?.mediaId ? String(r.cover.mediaId) : null;

    if (kind) {
      const out = {
        kind,
        url: url || resolveRouteCoverUrl(r),
      };
      if (stopId) out.stopId = stopId;
      if (mediaId) out.mediaId = mediaId;
      if (r?.cover?.updatedAt) out.updatedAt = r.cover.updatedAt;
      return out;
    }

    const legacy =
      r.coverUrl ||
      r.coverPhotoUrl ||
      r.coverImageUrl ||
      r.previewUrl ||
      r.thumbnailUrl ||
      null;

    if (legacy) return { kind: "picked", url: String(legacy) };
    return { kind: "default", url: DEFAULT_ROUTE_COVER_URL };
  } catch {
    return { kind: "default", url: DEFAULT_ROUTE_COVER_URL };
  }
}

export function fmtKm(m) {
  const km = (Number(m) || 0) / 1000;
  if (km < 1) return `${km.toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}

export function fmtDur(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h <= 0) return `${m} dk`;
  return `${h} sa ${m} dk`;
}

export function calcAvg(sum, count) {
  return (Number(count) || 0) > 0 ? (Number(sum || 0) / Number(count)).toFixed(1) : "—";
}

export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function toFiniteNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function getValidLatLng(lat, lng) {
  const la = toFiniteNumber(lat);
  const ln = toFiniteNumber(lng);
  if (la == null || ln == null) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { lat: la, lng: ln };
}

export function getValidLatLngSafe(a, b) {
  try {
    if (a && typeof a === "object") {
      if (typeof a.lat === "function" && typeof a.lng === "function") {
        return getValidLatLng(a.lat(), a.lng());
      }
      if ("latitude" in a && "longitude" in a) {
        return getValidLatLng(a.latitude, a.longitude);
      }
      return getValidLatLng(a.lat, a.lng);
    }
    return getValidLatLng(a, b);
  } catch {
    return null;
  }
}

export function buildStatsFromRoute(raw = {}) {
  let distanceMeters = null;
  if (isFiniteNumber(raw.totalDistanceM) && raw.totalDistanceM > 0) {
    distanceMeters = raw.totalDistanceM;
  } else if (isFiniteNumber(raw.distanceMeters) && raw.distanceMeters > 0) {
    distanceMeters = raw.distanceMeters;
  } else if (isFiniteNumber(raw.distance) && raw.distance > 0) {
    distanceMeters = raw.distance;
  } else if (isFiniteNumber(raw.stats?.distanceMeters) && raw.stats.distanceMeters > 0) {
    distanceMeters = raw.stats.distanceMeters;
  }

  let durationSeconds = null;
  if (isFiniteNumber(raw.durationSeconds) && raw.durationSeconds > 0) {
    durationSeconds = raw.durationSeconds;
  } else if (isFiniteNumber(raw.durationMs) && raw.durationMs > 0) {
    durationSeconds = Math.round(raw.durationMs / 1000);
  } else if (isFiniteNumber(raw.duration) && raw.duration > 0) {
    durationSeconds = raw.duration;
  } else if (isFiniteNumber(raw.durationMinutes) && raw.durationMinutes > 0) {
    durationSeconds = Math.round(raw.durationMinutes * 60);
  } else if (isFiniteNumber(raw.stats?.durationSeconds) && raw.stats.durationSeconds > 0) {
    durationSeconds = raw.stats.durationSeconds;
  }

  let stopCount = null;
  if (isFiniteNumber(raw.stopCount) && raw.stopCount > 0) {
    stopCount = raw.stopCount;
  } else if (Array.isArray(raw.stops)) {
    stopCount = raw.stops.length;
  } else if (Array.isArray(raw.waypoints)) {
    stopCount = raw.waypoints.length;
  } else if (isFiniteNumber(raw.stats?.stopCount) && raw.stats.stopCount > 0) {
    stopCount = raw.stats.stopCount;
  }

  let avgSpeedKmh = null;
  if (isFiniteNumber(distanceMeters) && isFiniteNumber(durationSeconds) && durationSeconds > 0) {
    const km = distanceMeters / 1000;
    const hours = durationSeconds / 3600;
    if (hours > 0) {
      avgSpeedKmh = Math.round((km / hours) * 10) / 10;
    }
  }

  return {
    distanceMeters: isFiniteNumber(distanceMeters) ? distanceMeters : null,
    durationSeconds: isFiniteNumber(durationSeconds) ? durationSeconds : null,
    stopCount: isFiniteNumber(stopCount) ? stopCount : null,
    avgSpeedKmh: isFiniteNumber(avgSpeedKmh) ? avgSpeedKmh : null,
  };
}

export function getVisibilityKeyFromRoute(raw = {}) {
  const source = raw.visibility ?? raw.audience ?? raw.routeVisibility ?? raw.privacy ?? "";
  const v = source.toString().toLowerCase();

  if (!v || v === "public" || v === "everyone") return "public";
  if (v === "followers" || v === "followers_only" || v === "followers-only" || v === "friends" || v.includes("follower")) {
    return "followers";
  }
  if (v === "private" || v === "only_me") return "private";
  return "unknown";
}

export function getAudienceFromRoute(raw = {}) {
  const key = getVisibilityKeyFromRoute(raw);
  if (key === "public") return { key, label: "Herkese açık" };
  if (key === "followers") return { key, label: "Takipçilere açık" };
  if (key === "private") return { key, label: "Özel" };
  return { key: "unknown", label: "Sınırlı" };
}

export function toDateSafe(dt) {
  if (!dt) return null;
  try {
    if (dt instanceof Date) return dt;
    if (typeof dt.toDate === "function") return dt.toDate();
    if (typeof dt.seconds === "number") return new Date(dt.seconds * 1000);
    if (typeof dt === "number") return new Date(dt);
    return new Date(dt);
  } catch {
    return null;
  }
}

export function formatDateTimeTR(dt) {
  const d = toDateSafe(dt);
  if (!d) return "";
  try {
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function formatDateTR(dt) {
  const d = toDateSafe(dt);
  if (!d) return "";
  try {
    return d.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function formatCount(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0";
  try {
    return new Intl.NumberFormat("tr-TR", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    if (n < 1000) return String(Math.round(n));
    if (n < 1_000_000) return `${Math.round((n / 1000) * 10) / 10} B`;
    if (n < 1_000_000_000) return `${Math.round((n / 1_000_000) * 10) / 10} Mn`;
    return `${Math.round((n / 1_000_000_000) * 10) / 10} Mr`;
  }
}

export function formatTimeAgo(dt) {
  const d = toDateSafe(dt);
  if (!d) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (!Number.isFinite(diffSec)) return "";
  if (diffSec <= 30) return "az önce";
  if (diffSec < 60) return "1 dk önce";

  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} dk önce`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} sa önce`;

  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} gün önce`;

  return formatDateTR(d);
}

export function formatDistanceFromStats(stats) {
  if (!stats) return "";
  const m = stats.distanceMeters;
  if (!isFiniteNumber(m) || m <= 0) return "";
  const km = m / 1000;
  const fixed = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${fixed} km`;
}

export function formatDurationFromStats(stats) {
  if (!stats) return "";
  const s = stats.durationSeconds;
  if (!isFiniteNumber(s) || s <= 0) return "";
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

export function formatStopsFromStats(stats) {
  if (!stats) return "";
  const c = stats.stopCount;
  if (!isFiniteNumber(c) || c <= 0) return "";
  if (c === 1) return "1 durak";
  return `${c} durak`;
}

export function formatAvgSpeedFromStats(stats) {
  if (!stats) return "";
  const v = stats.avgSpeedKmh;
  if (!isFiniteNumber(v) || v <= 0) return "";
  return `${v} km/sa`;
}

export function getRouteTitleSafe(model) {
  const m = model || {};
  const t =
    (m.title && String(m.title).trim()) ||
    (m.name && String(m.name).trim()) ||
    (m.raw?.title && String(m.raw.title).trim()) ||
    (m.raw?.name && String(m.raw.name).trim()) ||
    "Rota";
  return t || "Rota";
}

export function getRouteRatingLabelSafe(model) {
  const m = model || {};
  if (m.ratingSum != null && m.ratingCount != null) {
    const avg = calcAvg(m.ratingSum, m.ratingCount);
    const cnt = Number(m.ratingCount) || 0;
    return `${avg} ★ (${cnt})`;
  }
  const avg =
    (typeof m.ratingAvg === "number" && Number.isFinite(m.ratingAvg) && m.ratingAvg) ||
    (typeof m.avgRating === "number" && Number.isFinite(m.avgRating) && m.avgRating) ||
    (typeof m.raw?.ratingAvg === "number" && Number.isFinite(m.raw.ratingAvg) && m.raw.ratingAvg) ||
    null;

  const cnt =
    (typeof m.ratingCount === "number" && Number.isFinite(m.ratingCount) && m.ratingCount) ||
    (typeof m.raw?.ratingCount === "number" && Number.isFinite(m.raw.ratingCount) && m.raw.ratingCount) ||
    null;

  if (typeof avg === "number") {
    const avgText = Number(avg).toFixed(1);
    if (typeof cnt === "number") return `${avgText} ★ (${Number(cnt) || 0})`;
    return `${avgText} ★`;
  }
  return "—";
}

export function buildShareRoutePayload(routeDoc, ownerDoc, routeId) {
  const r = { ...(routeDoc || {}), id: routeId };

  if (ownerDoc) {
    r.ownerUsername =
      ownerDoc.username ||
      ownerDoc.userName ||
      ownerDoc.handle ||
      ownerDoc.name ||
      r.ownerUsername ||
      r.ownerName;
    r.ownerName = ownerDoc.name || ownerDoc.fullName || r.ownerName || r.ownerUsername;
    r.ownerAvatar = ownerDoc.photoURL || ownerDoc.profilFoto || ownerDoc.avatar || r.ownerAvatar;
  }

  const coverUrl = resolveRouteCoverUrl(r);
  const coverObj = normalizeRouteCover(r);
  r.cover = { ...(coverObj || {}), url: coverUrl };

  if (!r.coverUrl) r.coverUrl = coverUrl;
  if (!r.coverPhotoUrl) r.coverPhotoUrl = coverUrl;
  if (!r.coverImageUrl) r.coverImageUrl = coverUrl;
  if (!r.previewUrl) r.previewUrl = coverUrl;
  if (!r.thumbnailUrl) r.thumbnailUrl = coverUrl;

  return r;
}

export function getOwnerHintFromUrl() {
  try {
    const sp = new URLSearchParams(window.location.search || "");
    const o = sp.get("owner") || sp.get("o");
    return o ? String(o) : null;
  } catch {
    return null;
  }
}

export function pickOwnerIdLoose(obj) {
  if (!obj) return null;
  const v =
    obj.ownerId ??
    obj.owner ??
    obj.userId ??
    obj.uid ??
    obj.authorId ??
    obj.createdBy ??
    obj.createdById ??
    obj.profileId ??
    obj.profileUserId;
  if (!v) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export async function resolveOwnerIdForLockedRoute(routeId) {
  const rid = String(routeId || "").trim();
  if (!rid) return null;

  const candidates = [
    ["content", `route:${rid}`],
    ["route_meta", rid],
    ["routes_meta", rid],
    ["routeMeta", rid],
    ["routesMeta", rid],
    ["route_public", rid],
    ["routes_public", rid],
    ["routePublic", rid],
    ["routesPublic", rid],
    ["permalinks", `route:${rid}`],
    ["permalinks", `r:${rid}`],
    ["permalinks", rid],
  ];

  for (const [col, id] of candidates) {
    try {
      const snap = await getDoc(doc(db, col, id));
      if (!snap.exists()) continue;
      const data = snap.data() || {};
      const ownerId = pickOwnerIdLoose(data);
      if (ownerId) return ownerId;
    } catch {}
  }
  return null;
}
