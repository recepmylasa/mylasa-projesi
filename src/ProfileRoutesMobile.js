// src/ProfileRoutesMobile.js
// Profil "Rotalarım" sekmesi – profil sahibine ait rotaları premium grid olarak listeler (read-only).

import React, { useCallback } from "react";
import "./ProfileRoutesMobile.css";
import useUserRoutes from "./hooks/useUserRoutes";

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

function formatDistanceKm(stats) {
  if (!stats) return "";
  const m = stats.distanceMeters ?? stats.totalDistanceM ?? stats.distance ?? null;
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

  // "Rota 11:32" / "Rota 18.12" / "Rota 2025-12-18" vb.
  return /(\d{1,2}:\d{2})|(\d{1,2}[./-]\d{1,2})|(\d{4}[./-]\d{1,2}[./-]\d{1,2})|\d{2,}/.test(
    t
  );
}

// ✅ EMİR 8: GERÇEK VERİ YOLLARINI EKLE
function getStopsArray(route) {
  if (!route) return [];

  // 1. route.stopsPreview (En sık veri burada)
  if (Array.isArray(route.stopsPreview) && route.stopsPreview.length > 0) return route.stopsPreview;
  // 2. route.stops
  if (Array.isArray(route.stops) && route.stops.length > 0) return route.stops;

  // 3. raw veri içindeki yollar (Firestore'dan ham gelen)
  const raw = route.raw || route.data || route.doc || null;
  if (raw) {
    if (Array.isArray(raw.stopsPreview) && raw.stopsPreview.length > 0) return raw.stopsPreview;
    if (Array.isArray(raw.stops) && raw.stops.length > 0) return raw.stops;
    // 4. route.raw.data.stopsPreview (Bazı durumlarda)
    if (raw.data && Array.isArray(raw.data.stopsPreview)) return raw.data.stopsPreview;
  }

  // Hiçbiri yoksa boş dön
  return [];
}

function getStopName(stop) {
  if (!stop) return "";

  const s = stop;
  const raw = s.raw || s.data || null;

  const candidates = [
    // en sık
    s.title,
    s.name,
    s.placeName,
    s.addressName,
    s.locationName,
    s.label,

    // nested place
    s.place?.name,
    s.place?.title,
    s.place?.label,

    // nested poi
    s.poi?.name,
    s.poi?.title,
    s.poiName,

    // nested address
    s.address?.name,
    s.address?.title,

    // TR alanlar
    s.baslik,
    s.ad,
    s.isim,
    s.mekanAdi,
    s.konumAdi,

    // raw/data alanlar
    raw?.title,
    raw?.name,
    raw?.placeName,
    raw?.addressName,
    raw?.place?.name,
    raw?.poi?.name,
    raw?.baslik,
    raw?.ad,
    raw?.isim,
  ];

  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  if (typeof s.place === "string" && s.place.trim()) return s.place.trim();
  if (typeof raw?.place === "string" && raw.place.trim()) return raw.place.trim();

  return "";
}

function buildSmartTitle(route, fallbackTitle) {
  const title = (fallbackTitle || "").toString().trim() || "Adsız rota";
  if (!isDefaultRouteTitle(title)) return title;

  const stops = getStopsArray(route);
  const first = getStopName(stops[0]);
  const last = getStopName(stops[stops.length - 1]);

  if (first && last) return `${first} ➜ ${last}`;
  if (first && !last) return first;

  const d = toDate(
    route?.finishedAt ||
      route?.createdAt ||
      route?.raw?.finishedAt ||
      route?.raw?.createdAt ||
      route?.data?.finishedAt ||
      route?.data?.createdAt
  );
  if (!d) return "Yeni sürüş";
  try {
    const dayMonth = d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
    return `${dayMonth} Sürüşü`;
  } catch {
    return "Yeni sürüş";
  }
}

function inferStopCount(route) {
  const direct =
    route?.stats?.stopCount ??
    route?.stopCount ??
    route?.stopsCount ??
    route?.durakSayisi ??
    route?.raw?.stats?.stopCount ??
    route?.raw?.stopCount ??
    route?.raw?.stopsCount ??
    null;

  const n = toFiniteNumber(direct);
  if (n != null && n > 0) return Math.round(n);

  const stops = getStopsArray(route);
  return stops.length;
}

function getLatLngFromStop(stop) {
  if (!stop) return null;

  const s = stop;
  const raw = s.raw || s.data || null;

  const lat = toFiniteNumber(s.lat ?? s.latitude ?? raw?.lat ?? raw?.latitude);
  const lng = toFiniteNumber(s.lng ?? s.longitude ?? raw?.lng ?? raw?.longitude);
  if (lat != null && lng != null) return { lat, lng };

  const loc =
    s.location ||
    s.latLng ||
    s.geo ||
    s.geopoint ||
    s.point ||
    s.coords ||
    raw?.location ||
    raw?.latLng ||
    raw?.geo ||
    raw?.geopoint ||
    raw?.point ||
    raw?.coords ||
    null;

  if (loc) {
    const lat2 = toFiniteNumber(loc.lat ?? loc.latitude);
    const lng2 = toFiniteNumber(loc.lng ?? loc.longitude);
    if (lat2 != null && lng2 != null) return { lat: lat2, lng: lng2 };
  }

  return null;
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
    typeRaw.includes("video") || typeRaw.includes("mp4") || typeRaw.includes("webm") || (urlStr ? isVideoUrl(urlStr) : false);

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
    r.coverURL,
    r.coverImageUrl,
    r.coverPhotoUrl,
    r.cover,
    r.heroUrl,
    r.heroImageUrl,
    r.thumbnailUrl,
    r.thumbUrl,
    r.previewUrl,
    r.posterUrl,
    raw?.coverUrl,
    raw?.thumbnailUrl,
    data?.coverUrl,
    data?.thumbnailUrl,
  ].filter(Boolean);

  for (const it of lateCandidates) collectMediaFromValue(it, out);

  // stops-level
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

function pickCover(route) {
  const media = extractMedia(route);

  const hasVideo = media.some((m) => m.type === "video");

  const firstImage = media.find((m) => m.type === "image" && m.url);
  if (firstImage) return { kind: "image", url: firstImage.url, hasVideo };

  const firstVideo = media.find((m) => m.type === "video" && (m.thumb || m.rawUrl || m.url));
  if (firstVideo) {
    if (firstVideo.thumb) return { kind: "image", url: firstVideo.thumb, hasVideo: true };
    return { kind: "video", url: firstVideo.rawUrl || firstVideo.url, hasVideo: true };
  }

  const stops = getStopsArray(route);
  const start = stops.map(getLatLngFromStop).find(Boolean) || null;
  const end = [...stops].reverse().map(getLatLngFromStop).find(Boolean) || null;

  const staticUrl = buildStaticMapUrl({ start, end });
  if (staticUrl) return { kind: "image", url: staticUrl, hasVideo: false };

  return { kind: "placeholder", url: "", hasVideo: false };
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

  if (route?.visibility != null) prefill.visibility = route.visibility;
  if (route?.ownerId != null) prefill.ownerId = route.ownerId;

  return prefill;
}

export default function ProfileRoutesMobile({ userId, isSelf = false, viewerId = null, isFollowing = false }) {
  const { routes, loading, loadingMore, hasMore, error, loadMore, isEmpty } = useUserRoutes(userId, {
    pageSize: 20,
    isSelf,
    isFollowing,
    viewerId,
  });

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
        // ✅ EMİR 9 — Debug (tek seferlik)
        if (!window.__ROUTE_ONCE__) {
          window.__ROUTE_ONCE__ = true;
          const rawData =
            typeof route?.raw?.data === "function" ? route.raw.data() : null;

          // eslint-disable-next-line no-console
          console.log("ROUTE SAMPLE:", route);
          // eslint-disable-next-line no-console
          console.log("ROUTE KEYS:", Object.keys(route || {}));
          // eslint-disable-next-line no-console
          console.log("route.stopsPreview:", route?.stopsPreview);
          // eslint-disable-next-line no-console
          console.log("route.raw:", route?.raw);
          // eslint-disable-next-line no-console
          console.log("raw.data type:", typeof route?.raw?.data);
          // eslint-disable-next-line no-console
          console.log("raw.data():", rawData);
        }

        const rawTitle =
          (route?.title && route.title.toString().trim()) ||
          (route?.raw?.title && route.raw.title.toString().trim()) ||
          (route?.raw?.name && route.raw.name.toString().trim()) ||
          (route?.name && route.name.toString().trim()) ||
          "Adsız rota";

        const smartTitle = buildSmartTitle(route, rawTitle);

        const stopCount = inferStopCount(route);
        const distanceText = formatDistanceKm(route?.stats);

        const infoText =
          stopCount > 0
            ? `📍 ${stopCount} durak`
            : distanceText
            ? `📏 ${distanceText}`
            : "";

        const { kind, url, hasVideo } = pickCover(route);
        const visibilityIcon = getAudienceIcon(route?.visibility);

        return (
          <button
            key={route.id}
            type="button"
            className="profile-route-tile"
            onClick={() => handleClick(route)}
            aria-label={`${smartTitle} rotasını aç`}
          >
            <div className="profile-route-tile-media" aria-hidden="true">
              {kind === "image" && url ? (
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="profile-route-tile-img"
                />
              ) : kind === "video" && url ? (
                <video
                  className="profile-route-tile-video"
                  src={url}
                  preload="metadata"
                  muted
                  playsInline
                  controls={false}
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate noremoteplayback"
                  tabIndex={-1}
                />
              ) : (
                <div className="profile-route-tile-placeholder" />
              )}
            </div>

            <div className="profile-route-tile-badges" aria-hidden="true">
              <div className="profile-route-tile-badge profile-route-tile-badge--left">
                <span className="profile-route-tile-emoji">
                  {visibilityIcon}
                </span>
              </div>

              {hasVideo && (
                <div className="profile-route-tile-badge profile-route-tile-badge--right">
                  ▶
                </div>
              )}
            </div>

            <div className="profile-route-tile-overlay" aria-hidden="true">
              {infoText && (
                <div className="profile-route-tile-meta">{infoText}</div>
              )}
              <div className="profile-route-tile-title">{smartTitle}</div>
            </div>
          </button>
        );
      })}

      {hasMore && (
        <div className="profile-routes-more">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="profile-routes-more-btn"
          >
            {loadingMore ? "Yükleniyor…" : "Daha fazla göster"}
          </button>
        </div>
      )}
    </div>
  );
}
