// src/ProfileRoutesMobile.js
// Profil "Rotalarım" sekmesi – profil sahibine ait rotaları premium grid olarak listeler (read-only).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ProfileRoutesMobile.css";
import useUserRoutes from "./hooks/useUserRoutes";
import { pickCover, getTileTitle, isRenderableHttpsUrl } from "./routes/routeCardModel";

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

function formatDistanceKmFromRoute(route) {
  if (!route) return "";

  const s = route.stats || {};
  const kmFromStats = toFiniteNumber(s.distanceKm);
  if (kmFromStats != null && kmFromStats > 0) {
    const fixed = kmFromStats >= 10 ? Math.round(kmFromStats) : Math.round(kmFromStats * 10) / 10;
    return `${fixed} km`;
  }

  const m =
    s.distanceM ??
    s.distanceMeters ??
    route.totalDistanceM ??
    route.distanceMeters ??
    route.distance ??
    null;

  const mm = toFiniteNumber(m);
  if (mm == null || mm <= 0) return "";

  const km = mm / 1000;
  const fixed = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${fixed} km`;
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

  // stopsPreview sadece 2 eleman olabildiği için durak sayısı olarak kullanmayalım
  return 0;
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

  // ✅ prefill’e preview ekle
  if (Array.isArray(route?.stopsPreview)) prefill.stopsPreview = route.stopsPreview;
  if (typeof route?.coverUrl === "string") prefill.coverUrl = route.coverUrl;
  if (typeof route?.thumbnailUrl === "string") prefill.thumbnailUrl = route.thumbnailUrl;

  if (route?.visibility != null) prefill.visibility = route.visibility;
  if (route?.ownerId != null) prefill.ownerId = route.ownerId;

  return prefill;
}

function logRouteTileProof(route, { openTab = false } = {}) {
  if (!route) return;

  const stopsPreview = Array.isArray(route.stopsPreview) ? route.stopsPreview : [];
  const pc = pickCover(route);

  const coverFields = {
    coverUrl: route.coverUrl,
    previewUrl: route.previewUrl,
    thumbnailUrl: route.thumbnailUrl,
    mediaUrl: route.mediaUrl,
    thumbUrl: route.thumbUrl,
    imageUrl: route.imageUrl,
  };

  try {
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[RouteTileProof] ${route.id || "(no-id)"}`);

    // eslint-disable-next-line no-console
    console.log("route.id", route.id);

    // eslint-disable-next-line no-console
    console.log("route.title", route.title);

    // eslint-disable-next-line no-console
    console.log("route.stopsPreview", {
      length: stopsPreview.length,
      first: stopsPreview[0] || null,
    });

    // eslint-disable-next-line no-console
    console.log("cover fields", coverFields);

    // eslint-disable-next-line no-console
    console.log("pickCover(route) ->", { kind: pc?.kind, url: pc?.url });

    const u = typeof pc?.url === "string" ? pc.url.trim() : "";
    if (u) {
      if (openTab && (u.startsWith("https://") || u.startsWith("http://"))) {
        try {
          window.open(u, "_blank", "noopener,noreferrer");
        } catch {}
      }
      // eslint-disable-next-line no-console
      console.log(
        "URL test:",
        u,
        "→ yeni sekmede açılıyor mu / 403 mü / boş mu? Sonucu buraya yaz."
      );
    } else {
      // eslint-disable-next-line no-console
      console.log("URL test: pickCover url boş. (placeholder / resolver bekleniyor olabilir)");
    }

    // eslint-disable-next-line no-console
    console.groupEnd();
  } catch {}
}

function RouteTile({ route, onOpen }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const pressTimerRef = useRef(0);
  const longPressFiredRef = useRef(false);

  const pc = useMemo(() => pickCover(route), [route]);
  const title = useMemo(() => getTileTitle(route), [route]);

  // Grid kuralı: sadece render edilebilir https
  const renderUrl = useMemo(() => {
    const u = typeof pc?.url === "string" ? pc.url.trim() : "";
    return isRenderableHttpsUrl(u) ? u : "";
  }, [pc]);

  const kind = useMemo(() => {
    if (!renderUrl) return "placeholder";
    return pc?.kind || "image";
  }, [pc, renderUrl]);

  const hasVideo = !!pc?.hasVideo;

  useEffect(() => {
    // URL değişince state reset
    setLoaded(false);
    setFailed(false);
  }, [renderUrl, kind]);

  const clearTimer = () => {
    try {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    } catch {}
    pressTimerRef.current = 0;
  };

  const onPointerDown = (e) => {
    longPressFiredRef.current = false;

    // mobil long-press debug
    if (e && e.pointerType === "touch") {
      clearTimer();
      pressTimerRef.current = window.setTimeout(() => {
        longPressFiredRef.current = true;
        logRouteTileProof(route, { openTab: false }); // long-press'te popup açmaya çalışma
      }, 450);
    }
  };

  const onPointerUp = () => clearTimer();
  const onPointerCancel = () => clearTimer();
  const onPointerLeave = () => clearTimer();

  const onClick = (e) => {
    // Shift+Click = kanıt (popup serbest)
    if (e && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      logRouteTileProof(route, { openTab: true });
      return;
    }

    // long-press debug sonrası normal open iptal
    if (longPressFiredRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressFiredRef.current = false;
      return;
    }

    onOpen(route);
  };

  const onDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    logRouteTileProof(route, { openTab: true });
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    logRouteTileProof(route, { openTab: true });
  };

  const visibilityIcon = getAudienceIcon(route?.visibility);

  const stopCount = inferStopCount(route);
  const distanceText = formatDistanceKmFromRoute(route);

  const infoText =
    stopCount > 0 && distanceText
      ? `📍 ${stopCount} durak · 📏 ${distanceText}`
      : stopCount > 0
      ? `📍 ${stopCount} durak`
      : distanceText
      ? `📏 ${distanceText}`
      : "";

  return (
    <button
      type="button"
      className="profile-route-tile"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      aria-label={`${title} rotasını aç`}
    >
      <div
        className="profile-route-tile-media"
        aria-hidden="true"
        style={{ position: "relative" }}
      >
        {/* ✅ Placeholder HER ZAMAN DOM’da */}
        <div
          className="profile-route-tile-placeholder"
          style={{ position: "absolute", inset: 0 }}
        />

        {/* ✅ Görsel/Video üstte; load olana kadar görünmez (placeholder altta kalır) */}
        {!failed && kind === "image" && renderUrl ? (
          <img
            src={renderUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="profile-route-tile-img"
            onLoad={() => setLoaded(true)}
            onError={() => {
              setFailed(true);
              setLoaded(false);
            }}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: loaded ? 1 : 0,
            }}
          />
        ) : null}

        {!failed && kind === "video" && renderUrl ? (
          <video
            className="profile-route-tile-video"
            src={renderUrl}
            preload="metadata"
            muted
            playsInline
            controls={false}
            disablePictureInPicture
            controlsList="nodownload noplaybackrate noremoteplayback"
            tabIndex={-1}
            onLoadedData={() => setLoaded(true)}
            onError={() => {
              setFailed(true);
              setLoaded(false);
            }}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: loaded ? 1 : 0,
            }}
          />
        ) : null}
      </div>

      <div className="profile-route-tile-badges" aria-hidden="true">
        <div className="profile-route-tile-badge profile-route-tile-badge--left">
          <span className="profile-route-tile-emoji">{visibilityIcon}</span>
        </div>

        {hasVideo && (
          <div className="profile-route-tile-badge profile-route-tile-badge--right">▶</div>
        )}
      </div>

      <div className="profile-route-tile-overlay" aria-hidden="true">
        {infoText && <div className="profile-route-tile-meta">{infoText}</div>}
        <div className="profile-route-tile-title">{title}</div>
      </div>
    </button>
  );
}

export default function ProfileRoutesMobile({ userId, isSelf = false, viewerId = null, isFollowing = false }) {
  const { routes, loading, loadingMore, hasMore, error, loadMore, isEmpty } = useUserRoutes(userId, {
    pageSize: 20,
    isSelf,
    isFollowing,
    viewerId,
  });

  const handleOpen = useCallback((route) => {
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
      {routes.map((route) => (
        <RouteTile key={route.id} route={route} onOpen={handleOpen} />
      ))}

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
