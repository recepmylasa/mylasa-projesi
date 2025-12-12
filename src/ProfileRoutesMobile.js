// src/ProfileRoutesMobile.js
// Profil "Rotalarım" sekmesi – profil sahibine ait rotaları listeler (read-only).

import React, { useCallback } from "react";
import "./ProfileRoutesMobile.css";
import useUserRoutes from "./hooks/useUserRoutes";

function toDate(dt) {
  if (!dt) return null;
  try {
    if (dt instanceof Date) return dt;
    if (typeof dt.toDate === "function") return dt.toDate();
    if (typeof dt.seconds === "number") {
      return new Date(dt.seconds * 1000);
    }
    if (typeof dt === "number") {
      // ms olma ihtimaline karşı:
      return new Date(dt);
    }
    return new Date(dt);
  } catch {
    return null;
  }
}

function formatDateTime(dt) {
  const d = toDate(dt);
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

function formatDistanceKm(stats) {
  if (!stats) return "";
  const m = stats.distanceMeters;
  if (typeof m !== "number" || !Number.isFinite(m) || m <= 0) return "";
  const km = m / 1000;
  const fixed = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${fixed} km`;
}

function formatDuration(stats) {
  if (!stats) return "";
  const s = stats.durationSeconds;
  if (typeof s !== "number" || !Number.isFinite(s) || s <= 0) return "";
  const minutes = Math.round(s / 60);
  if (minutes < 60) {
    return `${minutes} dk`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

function formatStops(stats) {
  if (!stats) return "";
  const c = stats.stopCount;
  if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) return "";
  if (c === 1) return "1 durak";
  return `${c} durak`;
}

function getAudience(visibilityRaw) {
  const raw = (visibilityRaw || "").toString().toLowerCase();

  if (!raw || raw === "public" || raw === "everyone") {
    return { key: "public", label: "Herkese açık" };
  }
  if (
    raw.includes("follower") ||
    raw === "friends" ||
    raw === "followers_only" ||
    raw === "followers-only" ||
    raw === "followers"
  ) {
    return { key: "followers", label: "Takipçilere açık" };
  }
  if (raw === "private" || raw === "only_me") {
    return { key: "private", label: "Özel" };
  }
  return { key: "unknown", label: "Sınırlı" };
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

export default function ProfileRoutesMobile({
  userId,
  isSelf = false,
  viewerId = null,
  isFollowing = false,
}) {
  const {
    routes,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    isEmpty,
  } = useUserRoutes(userId, {
    pageSize: 20,
    isSelf,
    isFollowing,
    viewerId,
  });

  const handleClick = useCallback((route) => {
    if (!route || !route.id) return;
    const id = String(route.id);
    // eslint-disable-next-line no-console
    console.log("[ProfileRoutesMobile] route clicked", id);

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
        <div className="profile-routes-skel" />
        <div className="profile-routes-skel" />
        <div className="profile-routes-skel" />
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
        const title =
          (route.title && route.title.toString().trim()) ||
          (route.raw &&
            route.raw.title &&
            route.raw.title.toString().trim()) ||
          (route.raw &&
            route.raw.name &&
            route.raw.name.toString().trim()) ||
          "Adsız rota";

        const dateText = formatDateTime(route.finishedAt || route.createdAt);
        const distanceText = formatDistanceKm(route.stats);
        const durationText = formatDuration(route.stats);
        const stopsText = formatStops(route.stats);

        const metaBits = [];
        if (dateText) metaBits.push(dateText);
        if (distanceText) metaBits.push(distanceText);
        if (durationText) metaBits.push(durationText);
        if (stopsText) metaBits.push(stopsText);
        const metaLine = metaBits.join(" · ");

        const { key: audienceKey, label: audienceLabel } = getAudience(route.visibility);

        return (
          <button
            key={route.id}
            type="button"
            className="profile-route-card"
            onClick={() => handleClick(route)}
          >
            <div className="profile-route-card-header">
              <div className="profile-route-card-title">{title}</div>
              <span
                className={
                  "profile-route-chip" +
                  (audienceKey ? ` profile-route-chip--${audienceKey}` : "")
                }
              >
                {audienceLabel}
              </span>
            </div>
            {metaLine && <div className="profile-route-card-meta">{metaLine}</div>}
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
