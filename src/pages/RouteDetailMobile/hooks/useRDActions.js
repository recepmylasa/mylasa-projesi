// FILE: src/pages/RouteDetailMobile/hooks/useRDActions.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../../../firebase";
import { setRouteRating, setStopRating } from "../../../services/routeRatings";
import { buildGpx, downloadGpx } from "../../../services/gpx";
import { getRouteTitleSafe } from "../routeDetailUtils";

export default function useRDActions({
  routeId,
  routeDoc,
  initialRoute,
  source = null,
  ownerFromLink = null,
  stopsForPreview,
  pathPts,
}) {
  // ✅ share / gpx / rate
  const onShare = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("follow", "1");
      params.set("from", "share");
      if (source) params.set("src", String(source));
      if (ownerFromLink) params.set("owner", String(ownerFromLink));

      const url = `${window.location.origin}/r/${encodeURIComponent(routeId)}?${params.toString()}`;
      const t = getRouteTitleSafe(routeDoc || initialRoute);

      if (navigator.share) await navigator.share({ url, title: t, text: t });
      else {
        await navigator.clipboard.writeText(url);
        alert("Bağlantı kopyalandı");
      }
    } catch {}
  }, [routeId, routeDoc, initialRoute, source, ownerFromLink]);

  const onExportGpx = useCallback(async () => {
    try {
      const xml = buildGpx({ route: routeDoc, stops: stopsForPreview, path: pathPts });
      const slug = (getRouteTitleSafe(routeDoc) || "rota")
        .toLowerCase()
        .replace(/[^\w-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const y = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      downloadGpx(xml, `route-${slug || "route"}-${y}.gpx`);
    } catch {
      alert("GPX oluşturulamadı");
    }
  }, [routeDoc, stopsForPreview, pathPts]);

  const canRateRoute = useMemo(() => !!(auth.currentUser && routeDoc && auth.currentUser.uid !== routeDoc.ownerId), [routeDoc]);

  const onRouteRate = useCallback(
    async (v) => {
      if (!canRateRoute) return;
      try {
        await setRouteRating(routeId, v);
      } catch {}
    },
    [canRateRoute, routeId]
  );

  const onStopRate = useCallback(
    async (stopId, v) => {
      if (!auth.currentUser || !routeDoc) return;
      if (auth.currentUser.uid === routeDoc.ownerId) return;
      try {
        await setStopRating(stopId, routeId, v);
      } catch {}
    },
    [routeId, routeDoc]
  );

  // ✅ EMİR 3 (REVİZE) — Favori kalp (backend yok → UI state)
  const [isFav, setIsFav] = useState(false);
  useEffect(() => {
    setIsFav(false);
  }, [routeId]);

  const canToggleFav = !!auth.currentUser;

  const onToggleFav = useCallback(
    (e) => {
      e?.stopPropagation?.();
      if (!canToggleFav) return;
      setIsFav((x) => !x);
    },
    [canToggleFav]
  );

  return {
    onShare,
    onExportGpx,
    canRateRoute,
    onRouteRate,
    onStopRate,
    isFav,
    onToggleFav,
    canToggleFav,
  };
}
