// FILE: src/pages/RouteDetailMobile/RouteDetailMobile.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./RouteDetailMobile.css";
import "./RouteDetailMobileVitreous.css";

// ✅ EMİR 3 (REVİZE): hero/yazar stillerinin kesin yüklendiğini + sırasının en sonda olduğunu garanti et
import "./styles/rd.hero.css";

import { auth } from "../../firebase";

import CommentsPanel from "../../components/CommentsPanel/CommentsPanel";
import ShareSheetMobile from "../../components/ShareSheetMobile";

import Lightbox from "./components/Lightbox";
import RouteDetailMapPreviewShell from "./components/RouteDetailMapPreviewShell";

import RouteDetailAccessSheet from "./components/RouteDetailAccessSheet";
import RouteDetailPrefillSheet from "./components/RouteDetailPrefillSheet";
import RouteDetailCoverRow from "./components/RouteDetailCoverRow";
import RouteDetailRateRow from "./components/RouteDetailRateRow";
import RouteDetailTabs from "./components/RouteDetailTabs";
import RouteDetailCoverPickerOverlayMobile from "./components/RouteDetailCoverPickerOverlayMobile";

import RouteDetailStopsTab from "./tabs/RouteDetailStopsTab";
import RouteDetailGalleryTab from "./tabs/RouteDetailGalleryTab";
import RouteDetailReportTab from "./tabs/RouteDetailReportTab";

import useRouteDetailQuest from "./hooks/useRouteDetailQuest";
import useRouteDetailCover from "./hooks/useRouteDetailCover";
import useRouteDetailImgProof from "./hooks/useRouteDetailImgProof";
import useRouteDetailData from "./hooks/useRouteDetailData";
import useRouteDetailMedia from "./hooks/useRouteDetailMedia";

import { setRouteRating, setStopRating } from "../../services/routeRatings";
import { buildGpx, downloadGpx } from "../../services/gpx";

import {
  DEFAULT_ROUTE_COVER_URL,
  normalizeRouteCover,
  resolveRouteCoverUrl,
  buildShareRoutePayload,
  buildStatsFromRoute,
  formatAvgSpeedFromStats,
  formatDateTimeTR,
  formatDistanceFromStats,
  formatDurationFromStats,
  formatStopsFromStats,
  formatTimeAgo,
  getAudienceFromRoute,
  getRouteRatingLabelSafe,
  getRouteTitleSafe,
  normalizePathForPreview,
  normalizeStopsForPreview,
} from "./routeDetailUtils";

import { getRouteStarsAgg, getStopsStarsAgg } from "./routeDetailAgg";

// ✅ Feature flags (V3 kill switch)
import { ROUTES_V3_ENABLED } from "../../config/featureFlags";

// ✅ Backward compatibility export’ları ayrı dosyada
export { formatTimeAgo, formatCount, formatDateTR } from "./routeDetailCompat";

export default function RouteDetailMobile({
  routeId,
  initialRoute = null,
  source = null,
  followInitially = false,
  ownerFromLink = null,
  onClose = () => {
    try {
      window.history.back();
    } catch {}
  },
}) {
  const V3_ENABLED = ROUTES_V3_ENABLED;

  // ✅ FIX — Overlay portal target’ları: ref.current ilk render’da null → state ile garanti (click yutma biter)
  const [commentsPortalEl, setCommentsPortalEl] = useState(null);
  const [lightboxPortalEl, setLightboxPortalEl] = useState(null);

  // ✅ EMİR 13 — Ghost click kırıcı: overlay kapanınca kısa süre etkileşimi blokla
  const [interactionBlocked, setInteractionBlocked] = useState(false);
  const blockTimerRef = React.useRef(null);

  const blockInteractionsBriefly = useCallback((ms = 220) => {
    if (typeof window === "undefined") return;
    try {
      if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
    } catch {}
    setInteractionBlocked(true);
    blockTimerRef.current = window.setTimeout(() => {
      setInteractionBlocked(false);
      blockTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
      } catch {}
      blockTimerRef.current = null;
    };
  }, []);

  // =========================
  // ✅ EMİR 4 — Dark/Light Toggle (RouteDetail scope) + persist + prefers-color-scheme fallback
  // =========================
  const THEME_KEY = "mylasa_rd_theme";
  const LEGACY_THEME_KEY_1 = "rd_theme";
  const LEGACY_THEME_KEY_2 = "mylasa:rdm_theme";

  const getPreferredTheme = () => {
    try {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "dark";
    }
  };

  const [rdTheme, setRdTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const v = window.localStorage.getItem(THEME_KEY);
      if (v === "light" || v === "dark") return v;

      // legacy read (yazmıyoruz → diğer ekranları etkilemesin)
      const legacy1 = window.localStorage.getItem(LEGACY_THEME_KEY_1);
      if (legacy1 === "light" || legacy1 === "dark") return legacy1;

      const legacy2 = window.localStorage.getItem(LEGACY_THEME_KEY_2);
      if (legacy2 === "light" || legacy2 === "dark") return legacy2;

      // fallback: system preference
      return getPreferredTheme();
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THEME_KEY, rdTheme);
    } catch {}
  }, [rdTheme]);

  const onToggleTheme = useCallback(() => {
    setRdTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const readTabFromUrl = useCallback(() => {
    if (typeof window === "undefined") return "stops";
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t === "gallery" || t === "report" || t === "comments" || t === "stops") return t;
    } catch {}
    return "stops";
  }, []);

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const withPortal = useCallback((node) => (portalTarget ? createPortal(node, portalTarget) : node), [portalTarget]);

  // ✅ Scroll lock
  useEffect(() => {
    if (!portalTarget) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [portalTarget]);

  // ✅ tab + URL sync
  const [tab, setTab] = useState(() => readTabFromUrl());
  const onTabChange = useCallback((nextTab) => {
    setTab(nextTab);
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (!nextTab || nextTab === "stops") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {}
  }, []);

  // ✅ data (route/stops/owner/perm/comments/lockedOwner)
  const {
    routeDoc,
    stops,
    stopsLoaded,
    owner,
    permError,
    commentsCount,
    ownerIdForProfile,
    lockedOwnerDoc,
    retryPermCheck,
  } = useRouteDetailData({
    routeId,
    initialRoute,
    followInitially,
    ownerFromLink,
  });

  const routeModel = routeDoc || initialRoute;

  // ✅ EMİR 02: path canonical (tek format) + dev-only dropped log
  const rawPath = useMemo(() => {
    const m = routeDoc || initialRoute || {};
    return m?.path || m?.routePath || m?.polyline || m?.points || m?.raw?.path || m?.raw?.polyline || [];
  }, [routeDoc, initialRoute]);

  const { pts: pathPts, dropped: pathDropped } = useMemo(() => normalizePathForPreview(rawPath), [rawPath]);

  // ✅ EMİR 17/18: stops canonical (MapPreview/Quest/GPX için)
  const { stops: stopsForPreview, dropped: stopsDropped } = useMemo(() => normalizeStopsForPreview(stops || []), [stops]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!routeId) return;
    if (!routeDoc && !initialRoute) return;

    try {
      const rawLen = Array.isArray(rawPath) ? rawPath.length : 0;
      if (pathDropped > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[RouteDetailMobile] path normalize dropped ${pathDropped}/${rawLen}`, { routeId });
      }

      const totalStops = (stops || []).length;
      if (totalStops > 0 && stopsDropped > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[RouteDetailMobile] stops missing coords ${stopsDropped}/${totalStops}`, { routeId });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, pathDropped, stopsDropped, routeDoc, initialRoute]);

  const normalizeMediaType = useCallback((it) => {
    try {
      const t = String(it?.type || it?.mime || it?.contentType || "").toLowerCase();
      const u = String(it?.url || "").toLowerCase();
      if (t.includes("video")) return "video";
      if (t.includes("image") || t.includes("photo") || t.includes("img")) return "image";
      if (u.match(/\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i)) return "video";
      return "image";
    } catch {
      return "image";
    }
  }, []);

  const buildLightboxItems = useCallback(
    (arr) => {
      const out = [];
      (arr || []).forEach((x) => {
        const url = x?.url ? String(x.url) : "";
        if (!url) return;
        out.push({
          url,
          type: normalizeMediaType(x),
          title: x?.title || x?.name || "",
        });
      });
      return out;
    },
    [normalizeMediaType]
  );

  // ✅ img proof
  const DEFAULT_ROUTE_COVER_URL_PUBLIC = (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg";
  const { isDefaultCoverUrl, handleImgLoadProof, handleImgErrorToDefault } = useRouteDetailImgProof({
    routeId,
    defaultPublicUrl: DEFAULT_ROUTE_COVER_URL_PUBLIC,
    defaultConstUrl: DEFAULT_ROUTE_COVER_URL,
    maxLogs: 80,
  });

  // ✅ quest (EMİR 05) — V3 gate + path/stops
  const { questState, startQuest, stopQuest, finishQuest, questLocLine, ghostMetrics } = useRouteDetailQuest({
    routeId,
    enabled: V3_ENABLED,
    path: pathPts,
    stops: stopsForPreview || [],
  });

  const questUi = useMemo(() => {
    if (!V3_ENABLED) return null;

    const hasPath = Array.isArray(pathPts) && pathPts.length >= 2;
    const hasStops = Array.isArray(stopsForPreview) && stopsForPreview.length >= 1;

    const total = Number(ghostMetrics?.totalCheckpoints) || (hasStops ? stopsForPreview.length : 0);
    const visitedCount = Number(ghostMetrics?.visitedCount) || 0;

    const completion =
      typeof ghostMetrics?.completion === "number" && Number.isFinite(ghostMetrics.completion) ? ghostMetrics.completion : 0;

    const pct = Math.max(0, Math.min(1, completion));
    const pctText = Math.round(pct * 100);

    const dist = ghostMetrics?.distanceToRouteM;
    const distText = typeof dist === "number" && Number.isFinite(dist) ? `${Math.round(dist)}m` : "—";

    const offRoute = !!ghostMetrics?.offRoute;
    const canFinish = !!ghostMetrics?.canFinish;
    const isAuthed = !!auth.currentUser;

    let disabledReason = "";
    if (!hasPath) disabledReason = "Bu rotada iz bulunamadı.";
    else if (!hasStops) disabledReason = "Bu rotada checkpoint bulunamadı.";

    const startDisabled = questState !== "idle" || !!disabledReason;
    const finishDisabled = !canFinish || !isAuthed;

    const statusKey = questState === "active" ? "active" : "idle";
    const statusText = questState === "active" ? "Aktif" : "Hazır";

    return (
      <div className="route-detail-quest" data-status={statusKey}>
        <div className="route-detail-quest-top">
          <div className="route-detail-quest-left">
            <div className="route-detail-quest-title">Ghost Mode</div>
            <div className="route-detail-quest-sub">Rotayı takip et, %85 tamamla, ödülü al.</div>
          </div>
          <div className={`route-detail-quest-badge ${questState === "active" ? "is-active" : ""}`}>{statusText}</div>
        </div>

        {questLocLine ? (
          <div className={`route-detail-quest-line ${offRoute ? "is-warn" : ""}`}>{questLocLine}</div>
        ) : disabledReason ? (
          <div className="route-detail-quest-line is-muted">{disabledReason}</div>
        ) : (
          <div className="route-detail-quest-line is-muted">Konum hazır olunca başlat.</div>
        )}

        <div className="route-detail-quest-metrics">
          <span className={`route-detail-quest-pill ${offRoute ? "route-detail-quest-pill--warn" : ""}`}>
            Sapma: {distText}
          </span>
          <span className="route-detail-quest-pill">
            Checkpoint: {visitedCount}/{total || "—"}
          </span>
          <span className="route-detail-quest-pill">%{pctText}</span>
        </div>

        <div className="route-detail-quest-progress">
          <div className="route-detail-quest-progressTrack" aria-hidden="true">
            <div className="route-detail-quest-progressFill" style={{ width: `${pctText}%` }} />
          </div>
          <div className="route-detail-quest-progressPct">%{pctText}</div>
        </div>

        {questState === "idle" ? (
          <button type="button" className="route-detail-quest-primary" onClick={startQuest} disabled={startDisabled}>
            Quest’i başlat
          </button>
        ) : (
          <>
            <button
              type="button"
              className="route-detail-quest-primary"
              onClick={finishQuest}
              disabled={finishDisabled}
              title={!isAuthed ? "Ödül için giriş yapmalısın." : !canFinish ? "Bitirmek için en az %85 tamamla." : ""}
            >
              Bitir ve ödülü al
            </button>

            {!isAuthed && <div className="route-detail-quest-hint">Ödül için giriş yapmalısın.</div>}

            <button type="button" className="route-detail-quest-stop" onClick={stopQuest}>
              Durdur
            </button>
          </>
        )}
      </div>
    );
  }, [V3_ENABLED, pathPts, stopsForPreview, ghostMetrics, questState, questLocLine, startQuest, stopQuest, finishQuest]);

  // ✅ media (cache + gallery + upload + routeBodyRef)
  const {
    mediaCacheRef,
    galleryItems,
    galleryState,
    gallerySentinelRef,
    routeBodyRef,
    ensureStopThumbs,
    uploadState,
    onPickMedia,
    cancelUpload,
    bumpMediaTick,
    setGalleryTabActive,
  } = useRouteDetailMedia({
    routeId,
    routeDoc,
    stops,
    tab,
  });

  // ✅ cover picker hook (medya cache’e bağlı)
  const {
    coverLocal,
    coverPickerOpen,
    coverPickerMode,
    coverPickerState,
    coverUpload,
    openCoverPicker,
    closeCoverPicker,
    backToCoverPickerMenu,
    chooseCoverFromStops,
    pickCover,
    uploadCoverFromDevice,
    clearCover,
    isOwner,
  } = useRouteDetailCover({
    routeId,
    routeDoc,
    stops,
    stopsLoaded,
    normalizeMediaType,
    mediaCacheRef,
    bumpMediaTick,
  });

  // =========================
  // ✅ EMİR 1 — Viewer/Edit ayrımı (mode)
  // =========================
  const [mode, setMode] = useState("view"); // "view" | "edit"

  const isEditMode = useMemo(() => {
    // Owner değilse edit’e asla izin verme
    return !!isOwner && mode === "edit";
  }, [isOwner, mode]);

  const modeForTabs = isEditMode ? "edit" : "view";

  const enterEdit = useCallback(() => {
    if (!isOwner) return;
    setMode("edit");
  }, [isOwner]);

  const exitEdit = useCallback(() => {
    setMode("view");
    blockInteractionsBriefly(240);
  }, [blockInteractionsBriefly]);

  // route değişince/yeniden açılınca viewer’a dön
  useEffect(() => {
    setMode("view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // Owner değilken edit state’te kalmasın
  useEffect(() => {
    if (!isOwner && mode !== "view") setMode("view");
  }, [isOwner, mode]);

  // Viewer’a dönünce edit overlay açık kalmasın
  useEffect(() => {
    if (mode !== "view") return;
    if (!coverPickerOpen) return;
    try {
      closeCoverPicker();
    } catch {}
  }, [mode, coverPickerOpen, closeCoverPicker]);

  // ✅ Map retry
  const [mapsRetryTick, setMapsRetryTick] = useState(0);
  const retryMap = useCallback(() => setMapsRetryTick((x) => x + 1), []);

  // ✅ Lightbox
  const [lightboxItems, setLightboxItems] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // ✅ Share sheet
  const [showShareSheet, setShowShareSheet] = useState(false);

  // ✅ report agg
  const [reportLoaded, setReportLoaded] = useState(false);
  const [routeAgg, setRouteAgg] = useState(null);
  const [stopAgg, setStopAgg] = useState(null);

  const loadReportAgg = useCallback(
    async () => {
      if (reportLoaded || !routeId) return;
      const [rAgg, sAgg] = await Promise.all([
        getRouteStarsAgg(routeId, 1000).catch(() => null),
        getStopsStarsAgg(routeId, 1000).catch(() => null),
      ]);
      setRouteAgg(rAgg);
      setStopAgg(sAgg);
      setReportLoaded(true);
    },
    [reportLoaded, routeId]
  );

  useEffect(() => {
    if (tab === "report") loadReportAgg();
  }, [tab, loadReportAgg]);

  // ✅ Gallery tab active → hook içinde IO kurulsun
  useEffect(() => {
    setGalleryTabActive(tab === "gallery");
  }, [tab, setGalleryTabActive]);

  // ✅ Edit modda view-only tab’lar (comments/report) açık kalmasın
  useEffect(() => {
    if (!isEditMode) return;
    if (tab === "comments" || tab === "report") {
      onTabChange("stops");
    }
  }, [isEditMode, tab, onTabChange]);

  // ✅ ESC behavior
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;

      if (lightboxItems) {
        setLightboxItems(null);
        blockInteractionsBriefly(260);
        return;
      }
      if (coverPickerOpen) {
        try {
          closeCoverPicker();
        } catch {}
        blockInteractionsBriefly(260);
        return;
      }
      if (showShareSheet) {
        setShowShareSheet(false);
        blockInteractionsBriefly(260);
        return;
      }

      // edit moddayken ESC: önce viewer’a dön
      if (isEditMode) {
        exitEdit();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, lightboxItems, coverPickerOpen, closeCoverPicker, isEditMode, exitEdit, showShareSheet, blockInteractionsBriefly]);

  // ✅ header computed
  const ratingAvgLabel = useMemo(() => getRouteRatingLabelSafe(routeModel), [routeModel]);
  const stats = useMemo(() => (routeModel ? buildStatsFromRoute(routeModel) : null), [routeModel]);

  const { key: audienceKey, label: audienceLabel } = useMemo(() => getAudienceFromRoute(routeModel || {}), [routeModel]);

  const dateText = useMemo(() => formatDateTimeTR(routeModel?.finishedAt || routeModel?.createdAt), [routeModel]);

  const distanceText = formatDistanceFromStats(stats);
  const durationText = formatDurationFromStats(stats);
  const stopsText = formatStopsFromStats(stats);
  const avgSpeedText = formatAvgSpeedFromStats(stats);

  const metaLine = useMemo(() => {
    const bits = [];
    if (dateText) bits.push(dateText);
    if (distanceText) bits.push(distanceText);
    if (durationText) bits.push(durationText);
    if (stopsText) bits.push(stopsText);
    if (avgSpeedText) bits.push(avgSpeedText);
    return bits.join(" · ");
  }, [dateText, distanceText, durationText, stopsText, avgSpeedText]);

  const title = useMemo(() => getRouteTitleSafe(routeModel), [routeModel]);

  // ✅ EMIR 3 — Hero title: route.title/name öncelikli, süre gibi string’leri reddet
  const heroTitle = useMemo(() => {
    try {
      const m = routeModel || {};
      const candidates = [m?.title, m?.name, m?.routeTitle, m?.routeName, m?.displayTitle, m?.caption, m?.heading]
        .filter(Boolean)
        .map((x) => String(x).trim())
        .filter(Boolean);

      const normalize = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const looksLikeDurationOnly = (s) => {
        const x = normalize(s).toLowerCase();
        if (!x) return true;
        // "00:42" / "00:42:21" / "Rota 00:42:21"
        if (/^(rota\s*)?\d{1,2}:\d{2}(:\d{2})?$/.test(x)) return true;
        return false;
      };

      for (const c of candidates) {
        const s = normalize(c);
        if (!s) continue;
        if (looksLikeDurationOnly(s)) continue;
        return s;
      }

      const fb = normalize(title);
      if (fb && !looksLikeDurationOnly(fb)) return fb;

      return "Rota";
    } catch {
      return title || "Rota";
    }
  }, [routeModel, title]);

  // ✅ EMIR 3 — kısa açıklama (pill altı)
  const routeDescText = useMemo(() => {
    try {
      const m = routeModel || {};
      const raw = m?.description || m?.summary || m?.text || m?.about || m?.notes || "";
      if (typeof raw !== "string") return "";
      const s = raw.trim();
      return s;
    } catch {
      return "";
    }
  }, [routeModel]);

  // ✅ EMIR 2 — Map label (BODRUM / MUĞLA gibi) + badges (1,2)
  const mapAreaLabel = useMemo(() => {
    try {
      const m = routeModel || {};
      const cityRaw =
        m?.city || m?.province || m?.il || m?.state || m?.region || m?.locationCity || m?.location?.city || "";
      const districtRaw = m?.district || m?.ilce || m?.town || m?.locationDistrict || m?.location?.district || "";

      const city = String(cityRaw || "").trim();
      const district = String(districtRaw || "").trim();

      const a = district || city;
      const b = district && city && city.toLowerCase() !== district.toLowerCase() ? city : "";

      const out = [a, b].filter(Boolean).join(" / ");
      return out ? out.toUpperCase() : "";
    } catch {
      return "";
    }
  }, [routeModel]);

  const mapBadgeCount = useMemo(() => {
    try {
      const n = Array.isArray(stopsForPreview) ? stopsForPreview.length : 0;
      return Math.max(0, Math.min(2, n));
    } catch {
      return 0;
    }
  }, [stopsForPreview]);

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

  const canRateRoute = !!(auth.currentUser && routeDoc && auth.currentUser.uid !== routeDoc.ownerId);

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

  // ✅ cover resolve (picked / auto / default)
  const coverResolvedRaw = coverLocal?.url ? coverLocal.url : resolveRouteCoverUrl(routeModel || {});
  const coverResolvedBase = isDefaultCoverUrl(coverResolvedRaw) ? "" : coverResolvedRaw || "";
  const coverKindResolvedBase = coverLocal?.kind ? coverLocal.kind : normalizeRouteCover(routeModel || {}).kind || "default";

  // UI fallback: kapak yoksa -> first stop first photo (cache) -> default
  const toMillisSafe = (v) => {
    try {
      if (!v) return null;
      if (typeof v?.toDate === "function") return v.toDate().getTime();
      if (typeof v?.seconds === "number") return v.seconds * 1000;
      if (typeof v === "number") return v;
      if (v instanceof Date) return v.getTime();
      const d = new Date(v);
      // eslint-disable-next-line no-restricted-globals
      if (isNaN(d.getTime())) return null;
      return d.getTime();
    } catch {
      return null;
    }
  };

  let coverFallbackFromStops = null;
  try {
    const firstStop = (stops || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))[0];
    const sid = firstStop?.id;
    if (sid) {
      const items = mediaCacheRef.current.get(sid)?.items || [];
      const imgs = (items || []).filter((m) => normalizeMediaType(m) === "image" && m?.url);
      if (imgs.length) {
        const sorted = imgs.slice().sort((a, b) => {
          const am = toMillisSafe(a?.createdAt);
          const bm = toMillisSafe(b?.createdAt);
          if (am == null && bm == null) return 0;
          if (am == null) return 1;
          if (bm == null) return -1;
          return am - bm;
        });
        coverFallbackFromStops = sorted[0]?.url ? String(sorted[0].url) : null;
      }
    }
  } catch {}

  let coverResolved = coverResolvedBase || "";
  let coverKindUi = coverKindResolvedBase;

  if (!coverResolved) {
    if (coverFallbackFromStops) {
      coverResolved = coverFallbackFromStops;
      coverKindUi = "auto";
    } else {
      coverResolved = (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg";
      coverKindUi = "default";
    }
  }

  const coverIsPlaceholder = !coverResolvedBase;
  const coverPickBtnLabel = coverKindUi === "picked" ? "Kapağı değiştir" : "Kapak seç";
  const coverStatusText = coverUpload?.uploading
    ? `Yükleniyor… ${Number(coverUpload.p) || 0}%`
    : coverKindUi === "picked"
    ? "Seçildi"
    : coverKindUi === "auto"
    ? "Otomatik"
    : "Varsayılan";

  const handleBackdropClick = useCallback(() => onClose(), [onClose]);

  // ✅ HOTFIX — görünmez overlay click yutmasın:
  // Kapalı overlay'ler DOM'da KALMAYACAK.
  // ✅ EMİR 1 — Cover picker sadece edit modda mount edilsin.
  const showCoverPickerOverlay = !!(isEditMode && coverPickerOpen);

  // ✅ EMİR 12 — CTA “gated” state
  const isCommentsOpen = tab === "comments" && !isEditMode;
  const showCommentsOverlay = isCommentsOpen;

  // ✅ Overlay open → canInteract false (tab’lara tek truth)
  const overlayOpen = !!(lightboxItems || showShareSheet || showCoverPickerOverlay || showCommentsOverlay);
  const canInteract = !overlayOpen && !interactionBlocked;

  // =========================
  // ✅ EMIR 3 — Hero / Nav / Author Hub (cam card)
  // =========================
  const heroCategory = useMemo(() => {
    try {
      const m = routeModel || {};
      const raw =
        m?.category ||
        m?.routeCategory ||
        m?.type ||
        m?.routeType ||
        m?.activity ||
        m?.kind ||
        (Array.isArray(m?.tags) && m.tags.length ? m.tags[0] : "") ||
        "";

      const s = String(raw || "").trim();
      if (!s) return "";
      return s.toUpperCase();
    } catch {
      return "";
    }
  }, [routeModel]);

  const ownerName = useMemo(() => {
    const o = owner || lockedOwnerDoc || {};
    const s =
      (o?.name && String(o.name).trim()) ||
      (o?.fullName && String(o.fullName).trim()) ||
      (o?.username && String(o.username).trim()) ||
      (o?.userName && String(o.userName).trim()) ||
      (o?.handle && String(o.handle).trim()) ||
      (routeModel?.ownerName && String(routeModel.ownerName).trim()) ||
      (routeModel?.ownerUsername && String(routeModel.ownerUsername).trim()) ||
      "Yazar";
    return s || "Yazar";
  }, [owner, lockedOwnerDoc, routeModel]);

  const ownerAvatarUrl = useMemo(() => {
    const o = owner || lockedOwnerDoc || {};
    const s =
      (o?.photoURL && String(o.photoURL).trim()) ||
      (o?.profilFoto && String(o.profilFoto).trim()) ||
      (o?.avatar && String(o.avatar).trim()) ||
      (routeModel?.ownerAvatar && String(routeModel.ownerAvatar).trim()) ||
      "";
    return s || "";
  }, [owner, lockedOwnerDoc, routeModel]);

  const timeAgoText = useMemo(() => formatTimeAgo(routeModel?.finishedAt || routeModel?.createdAt), [routeModel]);

  const timeAgoLine = useMemo(() => {
    const t = String(timeAgoText || "").trim();
    if (!t) return "";
    if (t.toLowerCase().includes("paylaşıldı")) return t;
    return `${t} paylaşıldı`;
  }, [timeAgoText]);

  // ✅ EMİR 1 (GENİŞLETİLMİŞ) — Hero rating parse + 5★ visual
  const heroRatingInfo = useMemo(() => {
    try {
      const labelRaw = String(ratingAvgLabel || "").trim();
      const label = labelRaw.replace(",", ".");
      let avg = null;
      let count = null;

      const mAvg = label.match(/(\d+(?:\.\d+)?)/);
      if (mAvg && mAvg[1]) {
        const v = parseFloat(mAvg[1]);
        if (Number.isFinite(v)) avg = v;
      }

      const mCountParen = label.match(/\((\d+)\)/);
      if (mCountParen && mCountParen[1]) {
        const n = parseInt(mCountParen[1], 10);
        if (Number.isFinite(n)) count = n;
      } else {
        const mCountAlt = label.match(/(\d+)\s*(?:oy|vote|değerlendirme)/i);
        if (mCountAlt && mCountAlt[1]) {
          const n = parseInt(mCountAlt[1], 10);
          if (Number.isFinite(n)) count = n;
        }
      }

      let badgeText = "";
      if (typeof avg === "number" && Number.isFinite(avg)) {
        const a = Math.max(0, Math.min(5, avg));
        badgeText = count != null ? `${a.toFixed(1)} (${count})` : `${a.toFixed(1)}`;
      } else {
        badgeText = labelRaw || "—";
      }

      return { avg, count, badgeText };
    } catch {
      return { avg: null, count: null, badgeText: String(ratingAvgLabel || "—") };
    }
  }, [ratingAvgLabel]);

  const heroStarsModel = useMemo(() => {
    const avg = heroRatingInfo?.avg;
    if (typeof avg !== "number" || !Number.isFinite(avg)) return { full: 0, half: false, empty: 5 };
    const a = Math.max(0, Math.min(5, avg));
    const baseFull = Math.floor(a);
    const rem = a - baseFull;

    const bumpFull = rem >= 0.75 ? 1 : 0;
    const half = rem >= 0.25 && rem < 0.75;

    const full = Math.min(5, baseFull + bumpFull);
    const halfOn = full < 5 && half;

    const empty = Math.max(0, 5 - full - (halfOn ? 1 : 0));
    return { full, half: halfOn, empty };
  }, [heroRatingInfo]);

  const requestOpenProfile = useCallback(
    (e) => {
      e?.stopPropagation?.();
      const uid = ownerIdForProfile || routeDoc?.ownerId || routeModel?.ownerId || null;
      if (!uid) return;

      try {
        const ev = new CustomEvent("mylasa:openProfile", { detail: { uid }, bubbles: true });
        window.dispatchEvent(ev);
      } catch {}
    },
    [ownerIdForProfile, routeDoc, routeModel]
  );

  const [heroMenuOpen, setHeroMenuOpen] = useState(false);

  const closeHeroMenu = useCallback(() => setHeroMenuOpen(false), []);
  const toggleHeroMenu = useCallback((e) => {
    e?.stopPropagation?.();
    setHeroMenuOpen((x) => !x);
  }, []);

  useEffect(() => {
    // theme değişince menü açık kalmasın
    setHeroMenuOpen(false);
  }, [rdTheme]);

  // ✅ Edit mod açılınca view overlay’leri kapat (parite)
  useEffect(() => {
    if (!isEditMode) return;
    if (showShareSheet) setShowShareSheet(false);
  }, [isEditMode, showShareSheet]);

  // =========================
  // ✅ Early returns (access/prefill)
  // =========================
  if (!routeId)
    return withPortal(<RouteDetailAccessSheet kind="not-found" followInitially={followInitially} onClose={onClose} />);

  if (permError === "forbidden")
    return withPortal(
      <RouteDetailAccessSheet
        kind="forbidden"
        followInitially={followInitially}
        onClose={onClose}
        onRetry={retryPermCheck}
        ownerIdForProfile={ownerIdForProfile}
        ownerPreview={lockedOwnerDoc || owner}
      />
    );

  if (permError === "private")
    return withPortal(
      <RouteDetailAccessSheet
        kind="private"
        followInitially={followInitially}
        onClose={onClose}
        onRetry={retryPermCheck}
        ownerIdForProfile={ownerIdForProfile}
        ownerPreview={lockedOwnerDoc || owner}
      />
    );

  if (permError === "not-found")
    return withPortal(<RouteDetailAccessSheet kind="not-found" followInitially={followInitially} onClose={onClose} />);

  if (!routeDoc && initialRoute)
    return withPortal(
      <RouteDetailPrefillSheet
        title={title}
        audienceKey={audienceKey}
        audienceLabel={audienceLabel}
        ratingAvgLabel={ratingAvgLabel}
        metaLine={metaLine}
        onClose={onClose}
      />
    );

  if (!routeDoc)
    return withPortal(
      <RouteDetailAccessSheet
        kind="forbidden"
        followInitially={followInitially}
        onClose={onClose}
        onRetry={retryPermCheck}
        ownerIdForProfile={ownerIdForProfile}
        ownerPreview={lockedOwnerDoc || owner}
      />
    );

  // ✅ Overlay wrapper style (CSS’e güvenmeden sabitle)
  const overlayWrapStyle = { position: "fixed", inset: 0, zIndex: 975, pointerEvents: "auto" };

  // =========================
  // ✅ Main UI
  // =========================
  const content = (
    <div
      className={`route-detail-backdrop ${rdTheme === "light" ? "route-detail-light" : "route-detail-dark"}${
        overlayOpen ? " rd-overlay-open" : ""
      }`}
      data-theme={rdTheme}
      onClick={handleBackdropClick}
    >
      <div className="route-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="route-detail-grab" />

        {/* ✅ EMİR 1 (GENİŞLETİLMİŞ) — HERO + Floating Interaction Hub (Flash paritesi) */}
        <div
          className="route-detail-hero"
          onClick={() => {
            if (heroMenuOpen) closeHeroMenu();
          }}
        >
          <div className="route-detail-hero__media">
            <img
              className="route-detail-hero__img"
              src={coverResolved || (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg"}
              alt="Rota kapağı"
              loading="eager"
              decoding="async"
              onLoad={(e) => handleImgLoadProof(e, { scope: "hero_cover" })}
              onError={(e) => handleImgErrorToDefault(e, { scope: "hero_cover" })}
            />
          </div>

          {/* ✅ 2 katman overlay: top + bottom (okunurluk garantisi) */}
          <div className="rd-hero__overlay rd-hero__overlay--top" />
          <div className="rd-hero__overlay rd-hero__overlay--bottom" />

          {/* ✅ Nav: sol geri | sağ 2 aksiyon (paylaş + menü) */}
          <div className="route-detail-hero__nav" onClick={(e) => e.stopPropagation()}>
            <div className="rd-hero-nav-left">
              <button type="button" className="rd-hero-nav-btn rd-hero-nav-btn--icononly" onClick={onClose} title="Geri">
                <span className="rd-hero-nav-btn__icon" aria-hidden="true">
                  ←
                </span>
              </button>
            </div>

            <div className="rd-hero-nav-right">
              {!isEditMode && (
                <button type="button" className="rd-hero-nav-btn rd-hero-nav-btn--icononly" onClick={onShare} title="Paylaş">
                  <span className="rd-hero-nav-btn__icon" aria-hidden="true">
                    ⤴
                  </span>
                </button>
              )}

              <button
                type="button"
                className="rd-hero-nav-btn rd-hero-nav-btn--icononly"
                onClick={toggleHeroMenu}
                aria-expanded={heroMenuOpen}
                aria-label="Menü"
                title="Menü"
              >
                <span className="rd-hero-nav-btn__icon" aria-hidden="true">
                  ⋯
                </span>
              </button>
            </div>

            {heroMenuOpen && (
              <div className="rd-hero-menu" onClick={(e) => e.stopPropagation()}>
                {!!isOwner && !isEditMode && (
                  <button
                    type="button"
                    className="rd-hero-menu__item"
                    onClick={() => {
                      enterEdit();
                      closeHeroMenu();
                    }}
                  >
                    <span>Düzenle</span>
                    <span className="rd-hero-menu__hint">Edit</span>
                  </button>
                )}

                {!!isOwner && isEditMode && (
                  <button
                    type="button"
                    className="rd-hero-menu__item"
                    onClick={() => {
                      exitEdit();
                      closeHeroMenu();
                    }}
                  >
                    <span>Düzenlemeyi bitir</span>
                    <span className="rd-hero-menu__hint">View</span>
                  </button>
                )}

                {!isEditMode && (
                  <button
                    type="button"
                    className="rd-hero-menu__item"
                    onClick={() => {
                      setShowShareSheet(true);
                      closeHeroMenu();
                    }}
                  >
                    <span>Görsel paylaş</span>
                    <span className="rd-hero-menu__hint">Sheet</span>
                  </button>
                )}

                {!isEditMode && (
                  <button
                    type="button"
                    className="rd-hero-menu__item"
                    onClick={() => {
                      onExportGpx();
                      closeHeroMenu();
                    }}
                  >
                    <span>GPX indir</span>
                    <span className="rd-hero-menu__hint">.gpx</span>
                  </button>
                )}

                {!isEditMode && (
                  <button
                    type="button"
                    className="rd-hero-menu__item"
                    onClick={() => {
                      onTabChange("report");
                      closeHeroMenu();
                    }}
                  >
                    <span>Rapor</span>
                    <span className="rd-hero-menu__hint">İstatistik</span>
                  </button>
                )}

                <button
                  type="button"
                  className="rd-hero-menu__item"
                  onClick={() => {
                    onToggleTheme();
                    closeHeroMenu();
                  }}
                >
                  <span>Tema</span>
                  <span className="rd-hero-menu__hint">{rdTheme === "dark" ? "Açık" : "Koyu"}</span>
                </button>
              </div>
            )}
          </div>

          {/* ✅ Hero info: kategori pill + başlık + rating row */}
          <div className="rd-hero__info" aria-label="Rota özeti">
            {heroCategory ? <div className="rd-hero__pill">{heroCategory}</div> : null}

            <h1 className="rd-hero__title" title={heroTitle || "Rota"}>
              {heroTitle || "Rota"}
            </h1>

            <div className="rd-hero__ratingRow" aria-label="Rota puanı">
              <div className="rd-hero__stars" aria-hidden="true">
                {Array.from({ length: heroStarsModel.full }).map((_, i) => (
                  <span key={`f${i}`} className="rd-hero__star rd-hero__star--full">
                    ★
                  </span>
                ))}
                {heroStarsModel.half ? (
                  <span key="h" className="rd-hero__star rd-hero__star--half">
                    ★
                  </span>
                ) : null}
                {Array.from({ length: heroStarsModel.empty }).map((_, i) => (
                  <span key={`e${i}`} className="rd-hero__star rd-hero__star--empty">
                    ★
                  </span>
                ))}
              </div>

              <span className="rd-hero__ratingBadge">{heroRatingInfo?.badgeText || ratingAvgLabel || "—"}</span>
            </div>
          </div>

          {/* ✅ Floating Interaction Hub: hero içinde, cover üstünde yüzen tek cam bar */}
          <div className="rd-hero__hub" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="rd-hero__hubProfile"
              onClick={requestOpenProfile}
              title="Profili aç"
              aria-label="Profili aç"
            >
              <div className="rd-hero__avatar" aria-hidden="true">
                {ownerAvatarUrl ? (
                  <img src={ownerAvatarUrl} alt={ownerName} loading="lazy" decoding="async" />
                ) : (
                  <span className="rd-hero__avatarFallback">{ownerName?.[0] || "Y"}</span>
                )}
              </div>

              <div className="rd-hero__authorMeta">
                <div className="rd-hero__authorName" title={ownerName}>
                  {ownerName}
                </div>
                <div className="rd-hero__time">{timeAgoLine || ""}</div>
              </div>
            </button>

            {!isEditMode && (
              <button
                type="button"
                className={`rd-hero__favBtn ${isFav ? "is-active" : ""}`}
                onClick={onToggleFav}
                aria-label={isFav ? "Favorilerden çıkar" : "Favorilere ekle"}
                aria-pressed={!!isFav}
                title={!canToggleFav ? "Favorilere eklemek için giriş yapmalısın." : isFav ? "Favorilerden çıkar" : "Favorilere ekle"}
                disabled={!canToggleFav}
              >
                <span className="rd-hero__favIcon" aria-hidden="true">
                  {isFav ? "♥" : "♡"}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="route-detail-body" ref={routeBodyRef}>
          {/* ✅ Tab pill row (Hero altında) + Açıklama */}
          <div className="rd-pills-block">
            <RouteDetailTabs
              tab={tab}
              onTabChange={onTabChange}
              commentsCount={commentsCount}
              onGpx={onExportGpx}
              mode={modeForTabs}
              isOwner={!!isOwner}
              canInteract={canInteract}
            />
            {routeDescText ? <div className="rd-route-desc">{routeDescText}</div> : null}
          </div>

          {/* ✅ Harita */}
          <div className="route-detail-map rd-map-card">
            <div className="rd-map-card__canvas">
              <RouteDetailMapPreviewShell
                key={mapsRetryTick}
                routeId={routeId}
                path={pathPts}
                stops={stopsForPreview || []}
                stopsLoaded={stopsLoaded}
                onRetry={() => retryMap()}
              />
            </div>

            {mapBadgeCount > 0 && (
              <div className="rd-map-card__badges" aria-hidden="true">
                {Array.from({ length: mapBadgeCount }).map((_, i) => (
                  <span key={i} className="rd-map-badge">
                    {i + 1}
                  </span>
                ))}
              </div>
            )}

            {mapAreaLabel ? <div className="rd-map-card__label">{mapAreaLabel}</div> : null}
          </div>

          {questUi}

          {/* ✅ EMİR 1 — Edit blokları: CoverRow sadece edit modda */}
          {isEditMode && (
            <RouteDetailCoverRow
              coverResolved={coverResolved}
              coverIsPlaceholder={coverIsPlaceholder}
              isOwner={true}
              coverPickBtnLabel={coverPickBtnLabel}
              coverStatusText={coverStatusText}
              coverUpload={coverUpload}
              coverKindUi={coverKindUi}
              onOpenPicker={openCoverPicker}
              onClearCover={(e) => {
                e?.stopPropagation?.();
                if (!isOwner) return;
                try {
                  clearCover();
                } catch {}
              }}
              onImgLoad={(e) => handleImgLoadProof(e, { scope: "cover_thumb" })}
              onImgError={(e) => handleImgErrorToDefault(e, { scope: "cover_thumb" })}
            />
          )}

          {!isEditMode && <RouteDetailRateRow canRateRoute={canRateRoute} onRouteRate={onRouteRate} />}

          <div className="route-detail-tabpanel">
            {tab === "stops" && (
              <RouteDetailStopsTab
                mode={modeForTabs}
                isOwner={!!isOwner}
                canInteract={canInteract}
                stops={stops}
                stopAgg={stopAgg}
                uploadState={uploadState}
                mediaCacheRef={mediaCacheRef}
                ensureStopThumbs={ensureStopThumbs}
                onStopRate={onStopRate}
                onPickMedia={onPickMedia}
                cancelUpload={cancelUpload}
                normalizeMediaType={normalizeMediaType}
                buildLightboxItems={buildLightboxItems}
                openLightbox={(items, idx) => {
                  setLightboxItems(items);
                  setLightboxIndex(idx);
                }}
                onImgError={handleImgErrorToDefault}
              />
            )}

            {tab === "gallery" && (
              <RouteDetailGalleryTab
                mode={modeForTabs}
                isOwner={!!isOwner}
                canInteract={canInteract}
                galleryItems={galleryItems}
                galleryState={galleryState}
                gallerySentinelRef={gallerySentinelRef}
                normalizeMediaType={normalizeMediaType}
                buildLightboxItems={buildLightboxItems}
                openLightbox={(items, idx) => {
                  setLightboxItems(items);
                  setLightboxIndex(idx);
                }}
                onImgError={handleImgErrorToDefault}
              />
            )}

            {tab === "report" && !isEditMode && (
              <RouteDetailReportTab
                reportLoaded={reportLoaded}
                routeAgg={routeAgg}
                stopAgg={stopAgg}
                stops={stops}
                distanceText={distanceText}
                durationText={durationText}
                stopsText={stopsText}
                avgSpeedText={avgSpeedText}
              />
            )}
          </div>
        </div>

        {/* ✅ Edit modda “Düzenlemeyi bitir” */}
        {isEditMode && (
          <div className="route-detail-footer">
            <button
              type="button"
              className="route-detail-close-btn"
              onClick={() => {
                exitEdit();
              }}
            >
              Düzenlemeyi bitir
            </button>
          </div>
        )}
      </div>

      {showShareSheet && !isEditMode && (
        <div
          className="route-detail-share-overlay rdglass-overlay"
          style={{ position: "fixed", inset: 0, zIndex: 975, pointerEvents: "auto" }}
          onClick={(e) => {
            e.stopPropagation();
            setShowShareSheet(false);
            blockInteractionsBriefly(260);
          }}
        >
          <div className="route-detail-share-overlay__inner rdglass-overlay__inner" onClick={(e) => e.stopPropagation()}>
            <ShareSheetMobile
              route={buildShareRoutePayload(
                { ...(routeDoc || initialRoute || {}), cover: { kind: coverKindUi, url: coverResolved } },
                owner,
                routeId
              )}
              stops={stops}
              onClose={() => {
                setShowShareSheet(false);
                blockInteractionsBriefly(260);
              }}
            />
          </div>
        </div>
      )}

      {/* ✅ Cover picker overlay sadece edit modda mount */}
      {showCoverPickerOverlay && (
        <div className="route-detail-overlay-stop" style={overlayWrapStyle} onClick={(e) => e.stopPropagation()}>
          <RouteDetailCoverPickerOverlayMobile
            open={true}
            mode={coverPickerMode}
            state={coverPickerState}
            upload={coverUpload}
            onClose={() => {
              try {
                closeCoverPicker();
              } catch {}
              blockInteractionsBriefly(260);
            }}
            onBack={backToCoverPickerMenu}
            onChooseFromStops={chooseCoverFromStops}
            onUploadFromDevice={uploadCoverFromDevice}
            onPickCover={pickCover}
            onImgLoad={handleImgLoadProof}
            onImgError={handleImgErrorToDefault}
          />
        </div>
      )}

      {/* ✅ Kapalıyken DOM'da kalma YASAK → sadece comments tab açıkken mount */}
      {showCommentsOverlay && !isEditMode && (
        <div
          ref={setCommentsPortalEl}
          className="route-detail-overlay-stop"
          style={overlayWrapStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <CommentsPanel
            open={true}
            targetType="route"
            targetId={routeId}
            placeholder="Bu rota hakkında ne düşünüyorsun?"
            onClose={() => {
              onTabChange("stops");
              blockInteractionsBriefly(260);
            }}
            portalTarget={commentsPortalEl || undefined}
          />
        </div>
      )}

      {/* ✅ Lightbox FIX: kendi overlay wrapper’ına portal et (z-index/click güvenli) */}
      {lightboxItems && (
        <div
          ref={setLightboxPortalEl}
          className="route-detail-overlay-stop"
          style={overlayWrapStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <Lightbox
            items={lightboxItems}
            index={lightboxIndex}
            onClose={() => {
              setLightboxItems(null);
              blockInteractionsBriefly(260);
            }}
            portalTarget={lightboxPortalEl || undefined}
          />
        </div>
      )}
    </div>
  );

  return withPortal(content);
}
