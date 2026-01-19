// FILE: src/pages/RouteDetailMobile/RouteDetailMobile.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./RouteDetailMobile.css";
import "./RouteDetailMobileVitreous.css";

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

  // ✅ EMİR 18-6 — RouteDetail scoped overlay portal root (theme token inherit)
  const overlayRootRef = useRef(null);

  // ✅ EMİR 3 — Hero’daki tek yıldız butonu: Rating alanına kaydır (safe)
  const rateRowAnchorRef = useRef(null);

  // =========================
  // ✅ EMİR 4 — Dark/Light Toggle (RouteDetail scope) + persist + prefers-color-scheme fallback
  // - Diğer ekranların temasını bozmaz (sadece RouteDetail backdrop’ta data-theme/class)
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

  // ✅ ESC behavior
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (lightboxItems) {
        setLightboxItems(null);
        return;
      }
      if (coverPickerOpen) {
        closeCoverPicker();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, lightboxItems, coverPickerOpen, closeCoverPicker]);

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

  // ✅ EMIR 3 — Hero yıldızı: rating bölümüne kaydır (kalp yok)
  const onHeroStarClick = useCallback(
    (e) => {
      e?.stopPropagation?.();
      try {
        if (!rateRowAnchorRef.current) return;
        rateRowAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {}
    },
    [rateRowAnchorRef]
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
  const showCoverPickerOverlay = !!coverPickerOpen;
  const showCommentsOverlay = tab === "comments";

  // =========================
  // ✅ EMIR 1 — Hero / Nav / Author Hub (cam pill)
  // (Hook kuralı için early return öncesi)
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

  // =========================
  // ✅ Main UI
  // =========================
  const content = (
    <div
      className={`route-detail-backdrop ${rdTheme === "light" ? "route-detail-light" : "route-detail-dark"}`}
      data-theme={rdTheme}
      onClick={handleBackdropClick}
    >
      <div className="route-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="route-detail-grab" />

        {/* ✅ EMIR 3 — FLASH UI PARİTESİ: HERO (büyük) + Author Hub (overlap) */}
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

          <div className="route-detail-hero__gradient" />

          <div className="route-detail-hero__nav" onClick={(e) => e.stopPropagation()}>
            <div className="rd-hero-nav-left">
              <button type="button" className="rd-hero-nav-btn rd-hero-nav-btn--icononly" onClick={onClose} title="Geri">
                <span className="rd-hero-nav-btn__icon" aria-hidden="true">
                  ←
                </span>
              </button>
            </div>

            <div className="rd-hero-nav-right">
              <button type="button" className="rd-hero-nav-btn rd-hero-nav-btn--icononly" onClick={onShare} title="Paylaş">
                <span className="rd-hero-nav-btn__icon" aria-hidden="true">
                  ⤴
                </span>
              </button>

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

            {/* ✅ EMİR 4 — Tema toggle (menü dışı, layout bozmaz) */}
            <button
              type="button"
              className="rd-hero-nav-btn rd-hero-nav-btn--icononly rd-hero-theme-toggle"
              onClick={(e) => {
                e.stopPropagation();
                onToggleTheme();
              }}
              aria-label="Temayı değiştir"
              aria-pressed={rdTheme === "dark"}
              title={rdTheme === "dark" ? "Açık tema" : "Koyu tema"}
            >
              <span className="rd-hero-nav-btn__icon" aria-hidden="true">
                {rdTheme === "dark" ? "☾" : "☀"}
              </span>
            </button>

            {heroMenuOpen && (
              <div className="rd-hero-menu" onClick={(e) => e.stopPropagation()}>
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

          <div className="route-detail-hero__content">
            {heroCategory ? <div className="rd-hero-tag">{heroCategory}</div> : null}
            <div className="rd-hero-title" title={heroTitle || "Rota"}>
              {heroTitle || "Rota"}
            </div>
            <div className="rd-hero-ratingline">
              <span className="rd-hero-ratingline__star" aria-hidden="true">
                ★
              </span>
              <span>{ratingAvgLabel}</span>
            </div>
            {metaLine ? <div className="rd-hero-meta">{metaLine}</div> : null}
          </div>

          {/* ✅ EMIR 3 — Author hub: hero’dan taşar + sağda TEK YILDIZ butonu (kalp yok) */}
          <div className="rd-author-hub" onClick={(e) => e.stopPropagation()}>
            <div className="rd-author-avatar" aria-label="Yazar">
              {ownerAvatarUrl ? (
                <img src={ownerAvatarUrl} alt={ownerName} loading="lazy" decoding="async" />
              ) : (
                ownerName?.[0] || "Y"
              )}
            </div>

            <div className="rd-author-mid">
              <div className="rd-author-name" title={ownerName}>
                {ownerName}
              </div>
              <div className="rd-author-sub">{timeAgoText || ""}</div>
            </div>

            <button
              type="button"
              className="rd-author-fav"
              onClick={onHeroStarClick}
              aria-label="Yıldız ver"
              title={canRateRoute ? "Yıldız ver" : "Puanlamak için giriş yap / sahibi değilsen puanlayabilirsin"}
              disabled={!canRateRoute}
            >
              <span className="rd-author-fav__icon" aria-hidden="true">
                ★
              </span>
            </button>
          </div>
        </div>

        <div className="route-detail-body" ref={routeBodyRef}>
          {/* ✅ EMIR 3 — Tab pill row (Author hub’ın hemen altında) + Açıklama */}
          <div className="rd-pills-block">
            <RouteDetailTabs tab={tab} onTabChange={onTabChange} commentsCount={commentsCount} onGpx={onExportGpx} />
            {routeDescText ? <div className="rd-route-desc">{routeDescText}</div> : null}
          </div>

          {/* ✅ EMIR 3 — Harita: Açıklamanın altında, daha aşağıda (artık ilk büyük blok değil) */}
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

          <RouteDetailCoverRow
            coverResolved={coverResolved}
            coverIsPlaceholder={coverIsPlaceholder}
            isOwner={isOwner}
            coverPickBtnLabel={coverPickBtnLabel}
            coverStatusText={coverStatusText}
            coverUpload={coverUpload}
            coverKindUi={coverKindUi}
            onOpenPicker={openCoverPicker}
            // ✅ EMİR 4 — “Kapağı kaldır” gerçekten kaldırsın (owner değilse no-op)
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

          {/* ✅ EMIR 3 — Hero yıldızı buraya kaydırır */}
          <div ref={rateRowAnchorRef}>
            <RouteDetailRateRow canRateRoute={canRateRoute} onRouteRate={onRouteRate} />
          </div>

          <div className="route-detail-tabpanel">
            {tab === "stops" && (
              <RouteDetailStopsTab
                stops={stops}
                stopAgg={stopAgg}
                isOwner={isOwner}
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

            {tab === "report" && (
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

        <div className="route-detail-footer">
          <button type="button" className="route-detail-close-btn" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>

      {showShareSheet && (
        <div
          className="route-detail-share-overlay rdglass-overlay"
          onClick={(e) => {
            e.stopPropagation();
            setShowShareSheet(false);
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
              onClose={() => setShowShareSheet(false)}
            />
          </div>
        </div>
      )}

      {/* ✅ HOTFIX: Kapalıyken DOM'da kalma YASAK → sadece açıkken mount */}
      {showCoverPickerOverlay && (
        <div className="route-detail-overlay-stop" onClick={(e) => e.stopPropagation()}>
          <RouteDetailCoverPickerOverlayMobile
            open={true}
            mode={coverPickerMode}
            state={coverPickerState}
            upload={coverUpload}
            onClose={closeCoverPicker}
            onBack={backToCoverPickerMenu}
            onChooseFromStops={chooseCoverFromStops}
            onUploadFromDevice={uploadCoverFromDevice}
            onPickCover={pickCover}
            onImgLoad={handleImgLoadProof}
            onImgError={handleImgErrorToDefault}
          />
        </div>
      )}

      {/* ✅ HOTFIX: Kapalıyken DOM'da kalma YASAK → sadece comments tab açıkken mount */}
      {showCommentsOverlay && (
        <div className="route-detail-overlay-stop" onClick={(e) => e.stopPropagation()}>
          <CommentsPanel
            open={true}
            targetType="route"
            targetId={routeId}
            placeholder="Bu rota hakkında ne düşünüyorsun?"
            onClose={() => onTabChange("stops")}
            // ✅ EMİR 18-6: CommentsPanel portal kullanıyorsa RouteDetail overlay root’a basabilsin
            portalTarget={overlayRootRef.current || undefined}
          />
        </div>
      )}

      {lightboxItems && (
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxItems(null)}
          // ✅ EMİR 18-6: Lightbox’ı RouteDetail overlay root’a portal’layabilir (token inherit garantisi)
          portalTarget={overlayRootRef.current || undefined}
        />
      )}

      {/* ✅ EMİR 18-6 — Scoped overlay portal root (RouteDetail tokenları inherit eder) */}
      <div ref={overlayRootRef} className="rd-overlay-root" />
    </div>
  );

  return withPortal(content);
}
