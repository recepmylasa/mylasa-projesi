// FILE: src/pages/RouteDetailMobile/RouteDetailMobile.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./RouteDetailMobile.css";
import "./RouteDetailMobileVitreous.css";

// ✅ hero/yazar stilleri en sonda
import "./styles/rd.hero.css";

// Existing sheets/rows stay here (risk azalt)
import RouteDetailAccessSheet from "./components/RouteDetailAccessSheet";
import RouteDetailPrefillSheet from "./components/RouteDetailPrefillSheet";
import RouteDetailCoverRow from "./components/RouteDetailCoverRow";
import RouteDetailRateRow from "./components/RouteDetailRateRow";

// Data hooks (same)
import useRouteDetailQuest from "./hooks/useRouteDetailQuest";
import useRouteDetailCover from "./hooks/useRouteDetailCover";
import useRouteDetailImgProof from "./hooks/useRouteDetailImgProof";
import useRouteDetailData from "./hooks/useRouteDetailData";
import useRouteDetailMedia from "./hooks/useRouteDetailMedia";

// Agg
import { getRouteStarsAgg, getStopsStarsAgg } from "./routeDetailAgg";

// Utils (minimum)
import {
  DEFAULT_ROUTE_COVER_URL,
  normalizePathForPreview,
  normalizeStopsForPreview,
  buildShareRoutePayload,
} from "./routeDetailUtils";

// ✅ Feature flags (V3 kill switch)
import { ROUTES_V3_ENABLED } from "../../config/featureFlags";

// New hooks
import useRDTheme from "./hooks/useRDTheme";
import useRDInteractionBlocker from "./hooks/useRDInteractionBlocker";
import useRDAnchors from "./hooks/useRDAnchors";
import useRDPortalsAndScrollLock from "./hooks/useRDPortalsAndScrollLock";
import useRDActions from "./hooks/useRDActions";
import useRDHeroModel from "./hooks/useRDHeroModel";
import resolveCoverForUi from "./utils/resolveCoverForUi";

// New components
import RouteDetailHeroMobile from "./components/RouteDetailHeroMobile";
import RouteDetailStickyTabsMobile from "./components/RouteDetailStickyTabsMobile";
import RouteDetailMapCardMobile from "./components/RouteDetailMapCardMobile";
import RouteDetailSectionsMobile from "./components/RouteDetailSectionsMobile";
import RouteDetailOverlaysMobile from "./components/RouteDetailOverlaysMobile";

// ✅ Backward compatibility export’ları (IMPORTLAR BİTTİKTEN SONRA!)
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

  // ✅ Portals + scroll lock (same behavior, always)
  const {
    withPortal,
    commentsPortalEl,
    setCommentsPortalEl,
    lightboxPortalEl,
    setLightboxPortalEl,
  } = useRDPortalsAndScrollLock();

  // ✅ Ghost click blocker
  const { interactionBlocked, blockInteractionsBriefly } =
    useRDInteractionBlocker();

  // ✅ Theme
  const { rdTheme, rdThemeSource, themeAnimOn, onToggleTheme } = useRDTheme();

  // ✅ Anchors (tab/url + scroll-spy)
  const routeBodyRefForAnchors = React.useRef(null);
  const {
    tab,
    onTabChange,
    activeSection,
    setActiveSection,
    tabsBarRef,
    tabsBarH,
    stopsSectionRef,
    gallerySectionRef,
    commentsSectionRef,
    gpxSectionRef,
    reportSectionRef,
  } = useRDAnchors({ routeId, routeBodyRef: routeBodyRefForAnchors });

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
    authUid, // ✅ reaktif auth
  } = useRouteDetailData({ routeId, initialRoute, followInitially, ownerFromLink });

  const routeModel = routeDoc || initialRoute;

  // ✅ path canonical
  const rawPath = useMemo(() => {
    const m = routeDoc || initialRoute || {};
    return (
      m?.path ||
      m?.routePath ||
      m?.polyline ||
      m?.points ||
      m?.raw?.path ||
      m?.raw?.polyline ||
      []
    );
  }, [routeDoc, initialRoute]);

  const { pts: pathPts, dropped: pathDropped } = useMemo(
    () => normalizePathForPreview(rawPath),
    [rawPath]
  );

  // ✅ stops canonical (MapPreview/Quest/GPX için)
  const { stops: stopsForPreview, dropped: stopsDropped } = useMemo(
    () => normalizeStopsForPreview(stops || []),
    [stops]
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!routeId) return;
    if (!routeDoc && !initialRoute) return;

    try {
      const rawLen = Array.isArray(rawPath) ? rawPath.length : 0;
      if (pathDropped > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[RouteDetailMobile] path normalize dropped ${pathDropped}/${rawLen}`,
          { routeId }
        );
      }
      const totalStops = (stops || []).length;
      if (totalStops > 0 && stopsDropped > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[RouteDetailMobile] stops missing coords ${stopsDropped}/${totalStops}`,
          { routeId }
        );
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, pathDropped, stopsDropped, routeDoc, initialRoute]);

  const normalizeMediaType = useCallback((it) => {
    try {
      const t = String(it?.type || it?.mime || it?.contentType || "").toLowerCase();
      const u = String(it?.url || "").toLowerCase();
      if (t.includes("video")) return "video";
      if (t.includes("image") || t.includes("photo") || t.includes("img"))
        return "image";
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
  const DEFAULT_ROUTE_COVER_URL_PUBLIC =
    (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg";
  const { isDefaultCoverUrl, handleImgLoadProof, handleImgErrorToDefault } =
    useRouteDetailImgProof({
      routeId,
      defaultPublicUrl: DEFAULT_ROUTE_COVER_URL_PUBLIC,
      defaultConstUrl: DEFAULT_ROUTE_COVER_URL,
      maxLogs: 80,
    });

  // ✅ quest — V3 gate + path/stops
  const { questState, startQuest, stopQuest, finishQuest, questLocLine, ghostMetrics } =
    useRouteDetailQuest({
      routeId,
      enabled: V3_ENABLED,
      path: pathPts,
      stops: stopsForPreview || [],
    });

  const questUi = useMemo(() => {
    if (!V3_ENABLED) return null;

    const hasPath = Array.isArray(pathPts) && pathPts.length >= 2;
    const hasStops = Array.isArray(stopsForPreview) && stopsForPreview.length >= 1;

    const total =
      Number(ghostMetrics?.totalCheckpoints) || (hasStops ? stopsForPreview.length : 0);
    const visitedCount = Number(ghostMetrics?.visitedCount) || 0;

    const completion =
      typeof ghostMetrics?.completion === "number" &&
      Number.isFinite(ghostMetrics.completion)
        ? ghostMetrics.completion
        : 0;

    const pct = Math.max(0, Math.min(1, completion));
    const pctText = Math.round(pct * 100);

    const dist = ghostMetrics?.distanceToRouteM;
    const distText =
      typeof dist === "number" && Number.isFinite(dist) ? `${Math.round(dist)}m` : "—";

    const offRoute = !!ghostMetrics?.offRoute;
    const canFinish = !!ghostMetrics?.canFinish;

    // ✅ FIX: reaktif auth (auth.currentUser değil)
    const isAuthed = !!String(authUid || "").trim();

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
          <div className={`route-detail-quest-badge ${questState === "active" ? "is-active" : ""}`}>
            {statusText}
          </div>
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
              title={
                !isAuthed
                  ? "Ödül için giriş yapmalısın."
                  : !canFinish
                  ? "Bitirmek için en az %85 tamamla."
                  : ""
              }
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
  }, [
    V3_ENABLED,
    pathPts,
    stopsForPreview,
    ghostMetrics,
    questState,
    questLocLine,
    startQuest,
    stopQuest,
    finishQuest,
    authUid,
  ]);

  // ✅ media (cache + gallery + upload)
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
  } = useRouteDetailMedia({ routeId, routeDoc, stops, tab });

  // ✅ merge routeBodyRef for anchors (no behavior change)
  const setRouteBodyEl = useCallback(
    (el) => {
      try {
        routeBodyRef.current = el;
      } catch {}
      try {
        routeBodyRefForAnchors.current = el;
      } catch {}
    },
    [routeBodyRef]
  );

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

  // ✅ Viewer/Edit ayrımı (mode)
  const [mode, setMode] = useState("view"); // "view" | "edit"
  const isEditMode = useMemo(() => !!isOwner && mode === "edit", [isOwner, mode]);
  const modeForTabs = isEditMode ? "edit" : "view";

  const enterEdit = useCallback(() => {
    if (!isOwner) return;
    setMode("edit");
  }, [isOwner]);

  const exitEdit = useCallback(() => {
    setMode("view");
    blockInteractionsBriefly(240);
  }, [blockInteractionsBriefly]);

  useEffect(() => {
    setMode("view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  useEffect(() => {
    if (!isOwner && mode !== "view") setMode("view");
  }, [isOwner, mode]);

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

  // ✅ Comments overlay (anchor’dan ayrı)
  const [commentsOverlayOpen, setCommentsOverlayOpen] = useState(false);

  // ✅ report agg
  const [reportLoaded, setReportLoaded] = useState(false);
  const [routeAgg, setRouteAgg] = useState(null);
  const [stopAgg, setStopAgg] = useState(null);

  const loadReportAgg = useCallback(async () => {
    if (reportLoaded || !routeId) return;
    const [rAgg, sAgg] = await Promise.all([
      getRouteStarsAgg(routeId, 1000).catch(() => null),
      getStopsStarsAgg(routeId, 1000).catch(() => null),
    ]);
    setRouteAgg(rAgg);
    setStopAgg(sAgg);
    setReportLoaded(true);
  }, [reportLoaded, routeId]);

  useEffect(() => {
    if (tab === "report") loadReportAgg();
  }, [tab, loadReportAgg]);

  // ✅ Gallery aktifliği: tab değil activeSection belirler (scroll-spy)
  useEffect(() => {
    setGalleryTabActive(activeSection === "gallery");
  }, [activeSection, setGalleryTabActive]);

  // ✅ Edit modda view-only (report) açık kalmasın + comments overlay kapanır
  useEffect(() => {
    if (!isEditMode) return;
    if (tab === "report") onTabChange("stops");
    if (commentsOverlayOpen) setCommentsOverlayOpen(false);
    if (activeSection === "comments") setActiveSection("stops");
  }, [
    isEditMode,
    tab,
    onTabChange,
    commentsOverlayOpen,
    activeSection,
    setActiveSection,
  ]);

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
      if (commentsOverlayOpen) {
        setCommentsOverlayOpen(false);
        blockInteractionsBriefly(260);
        return;
      }

      if (isEditMode) {
        exitEdit();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    onClose,
    lightboxItems,
    coverPickerOpen,
    closeCoverPicker,
    isEditMode,
    exitEdit,
    showShareSheet,
    commentsOverlayOpen,
    blockInteractionsBriefly,
  ]);

  // ✅ Hero model (Paket 02: ownerId pass)
  const heroModel = useRDHeroModel({
    routeModel,
    owner,
    lockedOwnerDoc,
    stopsForPreview,
    ownerId: ownerIdForProfile,
  });

  // ✅ Actions
  const { onShare, onExportGpx, canRateRoute, onRouteRate, onStopRate, isFav, onToggleFav, canToggleFav } =
    useRDActions({
      routeId,
      routeDoc,
      initialRoute,
      source,
      ownerFromLink,
      stopsForPreview,
      pathPts,
    });

  // ✅ cover resolve
  const coverUi = useMemo(
    () =>
      resolveCoverForUi({
        coverLocal,
        routeModel,
        isDefaultCoverUrl,
        normalizeMediaType,
        mediaCacheRef,
        stops,
        coverUpload,
      }),
    [coverLocal, routeModel, isDefaultCoverUrl, normalizeMediaType, mediaCacheRef, stops, coverUpload]
  );

  const handleBackdropClick = useCallback(() => onClose(), [onClose]);

  // ✅ Kapalı overlay'ler DOM'da KALMAYACAK. Cover picker sadece edit modda mount.
  const showCoverPickerOverlay = !!(isEditMode && coverPickerOpen);
  const overlayOpen = !!(lightboxItems || showShareSheet || showCoverPickerOverlay || commentsOverlayOpen);
  const canInteract = !overlayOpen && !interactionBlocked;

  // ✅ Hero menu state
  const [heroMenuOpen, setHeroMenuOpen] = useState(false);
  const closeHeroMenu = useCallback(() => setHeroMenuOpen(false), []);
  const toggleHeroMenu = useCallback((e) => {
    e?.stopPropagation?.();
    setHeroMenuOpen((x) => !x);
  }, []);

  useEffect(() => {
    setHeroMenuOpen(false);
  }, [rdTheme]);

  useEffect(() => {
    if (!isEditMode) return;
    if (showShareSheet) setShowShareSheet(false);
    if (commentsOverlayOpen) setCommentsOverlayOpen(false);
  }, [isEditMode, showShareSheet, commentsOverlayOpen]);

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

  const shareRoutePayload = useMemo(() => {
    return buildShareRoutePayload(
      { ...(routeDoc || initialRoute || {}), cover: { kind: coverUi.coverKindUi, url: coverUi.coverResolved } },
      owner,
      routeId
    );
  }, [routeDoc, initialRoute, coverUi.coverKindUi, coverUi.coverResolved, owner, routeId]);

  // ✅ Early returns (access/prefill)
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
        title={heroModel.title}
        audienceKey={heroModel.audienceKey}
        audienceLabel={heroModel.audienceLabel}
        ratingAvgLabel={heroModel.ratingAvgLabel}
        metaLine={heroModel.metaLine}
        onClose={onClose}
      />
    );

  if (!routeDoc)
    return withPortal(
      <RouteDetailPrefillSheet
        title="Yükleniyor…"
        audienceKey={heroModel.audienceKey}
        audienceLabel={heroModel.audienceLabel}
        ratingAvgLabel={heroModel.ratingAvgLabel}
        metaLine={heroModel.metaLine}
        onClose={onClose}
      />
    );

  // ✅ Main UI
  const content = (
    <div
      className={`route-detail-backdrop ${rdTheme === "light" ? "route-detail-light" : "route-detail-dark"}${
        overlayOpen ? " rd-overlay-open" : ""
      }`}
      data-theme={rdTheme}
      data-theme-source={rdThemeSource}
      data-theme-anim={themeAnimOn ? "1" : "0"}
      onClick={handleBackdropClick}
    >
      <div className="route-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="route-detail-grab" />

        <RouteDetailHeroMobile
          coverResolved={coverUi.coverResolved}
          handleImgLoadProof={handleImgLoadProof}
          handleImgErrorToDefault={handleImgErrorToDefault}
          heroMenuOpen={heroMenuOpen}
          toggleHeroMenu={toggleHeroMenu}
          closeHeroMenu={closeHeroMenu}
          enterEdit={enterEdit}
          exitEdit={exitEdit}
          isOwner={!!isOwner}
          isEditMode={isEditMode}
          onClose={onClose}
          onShare={onShare}
          onExportGpx={onExportGpx}
          onToggleTheme={onToggleTheme}
          onOpenReport={() => onTabChange("report")}
          onOpenShareSheet={() => setShowShareSheet(true)}
          rdTheme={rdTheme}
          heroCategory={heroModel.heroCategory}
          heroTitle={heroModel.heroTitle}
          heroStarsModel={heroModel.heroStarsModel}
          heroRatingBadgeText={heroModel.heroExplorerLabel || `${heroModel.heroCategory || "Macera"}: 0 Kaşif`}
          heroAvgRating={heroModel.heroRatingInfo?.avg}
          ownerName={heroModel.ownerName}
          ownerAvatarUrl={heroModel.ownerAvatarUrl}
          timeAgoLine={heroModel.timeAgoLine}
          isFav={isFav}
          onToggleFav={onToggleFav}
          canToggleFav={canToggleFav}
          requestOpenProfile={requestOpenProfile}
        />

        <div className="route-detail-body" ref={setRouteBodyEl} style={{ "--rd-sticky-tabs-h": `${tabsBarH}px` }}>
          <RouteDetailStickyTabsMobile
            activeSection={activeSection}
            onTabChange={onTabChange}
            canInteract={canInteract}
            tabsBarRef={tabsBarRef}
            routeDescText={heroModel.routeDescText}
          />

          <RouteDetailMapCardMobile
            routeId={routeId}
            mapsRetryTick={mapsRetryTick}
            retryMap={retryMap}
            pathPts={pathPts}
            stopsForPreview={stopsForPreview || []}
            stopsLoaded={stopsLoaded}
            mapBadgeCount={heroModel.mapBadgeCount}
            mapAreaLabel={heroModel.mapAreaLabel}
          />

          {questUi}

          {isEditMode && (
            <RouteDetailCoverRow
              coverResolved={coverUi.coverResolved}
              coverIsPlaceholder={coverUi.coverIsPlaceholder}
              isOwner={true}
              coverPickBtnLabel={coverUi.coverPickBtnLabel}
              coverStatusText={coverUi.coverStatusText}
              coverUpload={coverUpload}
              coverKindUi={coverUi.coverKindUi}
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

          <div className="rd-sections">
            <RouteDetailSectionsMobile
              stopsSectionRef={stopsSectionRef}
              gallerySectionRef={gallerySectionRef}
              commentsSectionRef={commentsSectionRef}
              gpxSectionRef={gpxSectionRef}
              reportSectionRef={reportSectionRef}
              tab={tab}
              isEditMode={isEditMode}
              canInteract={canInteract}
              modeForTabs={modeForTabs}
              isOwner={!!isOwner}
              stops={stops}
              stopsLoaded={stopsLoaded}
              commentsCount={commentsCount}
              stopAgg={stopAgg}
              uploadState={uploadState}
              mediaCacheRef={mediaCacheRef}
              ensureStopThumbs={ensureStopThumbs}
              cancelUpload={cancelUpload}
              onPickMedia={onPickMedia}
              normalizeMediaType={normalizeMediaType}
              buildLightboxItems={buildLightboxItems}
              openLightbox={(items, idx) => {
                setLightboxItems(items);
                setLightboxIndex(idx);
              }}
              onImgError={handleImgErrorToDefault}
              onStopRate={onStopRate}
              galleryItems={galleryItems}
              galleryState={galleryState}
              gallerySentinelRef={gallerySentinelRef}
              onOpenCommentsOverlay={() => {
                if (!canInteract) return;
                if (isEditMode) return;
                setCommentsOverlayOpen(true);
              }}
              onExportGpx={onExportGpx}
              reportLoaded={reportLoaded}
              routeAgg={routeAgg}
              stopAggForReport={stopAgg}
              distanceText={heroModel.distanceText}
              durationText={heroModel.durationText}
              stopsText={heroModel.stopsText}
              avgSpeedText={heroModel.avgSpeedText}
            />
          </div>
        </div>

        {isEditMode && (
          <div className="route-detail-footer">
            <button type="button" className="route-detail-close-btn" onClick={() => exitEdit()}>
              Düzenlemeyi bitir
            </button>
          </div>
        )}
      </div>

      <RouteDetailOverlaysMobile
        isEditMode={isEditMode}
        blockInteractionsBriefly={blockInteractionsBriefly}
        showShareSheet={showShareSheet}
        setShowShareSheet={setShowShareSheet}
        shareRoutePayload={shareRoutePayload}
        shareStops={stops}
        showCoverPickerOverlay={showCoverPickerOverlay}
        coverPickerMode={coverPickerMode}
        coverPickerState={coverPickerState}
        coverUpload={coverUpload}
        closeCoverPicker={closeCoverPicker}
        backToCoverPickerMenu={backToCoverPickerMenu}
        chooseCoverFromStops={chooseCoverFromStops}
        uploadCoverFromDevice={uploadCoverFromDevice}
        pickCover={pickCover}
        onImgLoadProof={handleImgLoadProof}
        onImgErrorToDefault={handleImgErrorToDefault}
        commentsOverlayOpen={commentsOverlayOpen}
        setCommentsOverlayOpen={setCommentsOverlayOpen}
        routeId={routeId}
        commentsPortalEl={commentsPortalEl}
        setCommentsPortalEl={setCommentsPortalEl}
        lightboxItems={lightboxItems}
        lightboxIndex={lightboxIndex}
        setLightboxItems={setLightboxItems}
        lightboxPortalEl={lightboxPortalEl}
        setLightboxPortalEl={setLightboxPortalEl}
      />
    </div>
  );

  return withPortal(content);
}
