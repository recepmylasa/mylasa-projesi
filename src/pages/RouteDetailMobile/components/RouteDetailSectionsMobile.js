// FILE: src/pages/RouteDetailMobile/components/RouteDetailSectionsMobile.js
import React, { useMemo } from "react";

import RouteDetailStopsTab from "../tabs/RouteDetailStopsTab";
import RouteDetailGalleryTab from "../tabs/RouteDetailGalleryTab";
import RouteDetailReportTab from "../tabs/RouteDetailReportTab";

export default function RouteDetailSectionsMobile({
  // refs
  stopsSectionRef,
  gallerySectionRef,
  commentsSectionRef,
  gpxSectionRef,
  reportSectionRef,

  // state
  tab,
  onRequestTab, // ✅ NEW: dış tetikler için (comments/gpx vs.)
  isEditMode,
  canInteract,
  modeForTabs,

  // data
  isOwner,
  stops,
  stopsLoaded,
  commentsCount,

  // media / upload
  stopAgg,
  uploadState,
  mediaCacheRef,
  ensureStopThumbs,
  cancelUpload,
  onPickMedia,
  normalizeMediaType,
  buildLightboxItems,
  openLightbox,
  onImgError,

  // rating
  onStopRate,

  // gallery
  galleryItems,
  galleryState,
  gallerySentinelRef,

  // actions
  onOpenCommentsOverlay,
  onExportGpx,

  // report
  reportLoaded,
  routeAgg,
  stopAggForReport,
  distanceText,
  durationText,
  stopsText,
  avgSpeedText,
}) {
  const activeTab = useMemo(() => {
    const t = String(tab || "stops");
    if (t === "report") return "report";
    if (t === "gallery") return "gallery";
    if (t === "comments") return "comments";
    if (t === "gpx") return "gpx";
    return "stops";
  }, [tab]);

  return (
    <div className="rd-sections" data-active-tab={activeTab} data-route-skin="manus">
      {/* ✅ EMİR: Sadece seçili tab içeriği render edilir (alt alta akış biter) */}

      {activeTab === "stops" && (
        <section ref={stopsSectionRef} className="rd-section" data-section="stops">
          <div className="rd-sectionHead">
            <div className="rd-sectionTitle">Duraklar</div>
          </div>

          {/* ✅ Manus: timeline wrapper */}
          <div className="rd-stopsTimeline" data-variant="timeline">
            <RouteDetailStopsTab
              mode={modeForTabs}
              isOwner={!!isOwner}
              canInteract={canInteract}
              stops={stops}
              stopsLoaded={stopsLoaded}
              stopAgg={stopAgg}
              uploadState={uploadState}
              mediaCacheRef={mediaCacheRef}
              ensureStopThumbs={ensureStopThumbs}
              onStopRate={onStopRate}
              onPickMedia={onPickMedia}
              cancelUpload={cancelUpload}
              normalizeMediaType={normalizeMediaType}
              buildLightboxItems={buildLightboxItems}
              openLightbox={openLightbox}
              onImgError={onImgError}
            />
          </div>
        </section>
      )}

      {activeTab === "gallery" && (
        <section ref={gallerySectionRef} className="rd-section" data-section="gallery">
          <div className="rd-sectionHead">
            <div className="rd-sectionTitle">Galeri</div>
          </div>

          <RouteDetailGalleryTab
            mode={modeForTabs}
            isOwner={!!isOwner}
            canInteract={canInteract}
            galleryItems={galleryItems}
            galleryState={galleryState}
            gallerySentinelRef={gallerySentinelRef}
            normalizeMediaType={normalizeMediaType}
            buildLightboxItems={buildLightboxItems}
            openLightbox={openLightbox}
            onImgError={onImgError}
          />
        </section>
      )}

      {activeTab === "comments" && (
        <section ref={commentsSectionRef} className="rd-section" data-section="comments">
          <div className="rd-sectionHead">
            <div className="rd-sectionTitle">Yorumlar</div>

            <button
              type="button"
              className="rd-sectionCta"
              onClick={() => {
                if (!canInteract) return;
                if (isEditMode) return;

                // ✅ EMİR: “Tümünü aç” tetiklenince comments tab otoritesi
                try {
                  onRequestTab?.("comments");
                } catch {}

                onOpenCommentsOverlay?.();
              }}
              disabled={!canInteract || isEditMode}
              title={isEditMode ? "Düzenleme modunda yorumlar kapalı." : ""}
            >
              {typeof commentsCount === "number" ? `Tümünü aç (${commentsCount})` : "Tümünü aç"}
            </button>
          </div>

          <div className="rd-commentsCard">
            <div className="rd-commentsCardText">
              Yorumları görmek ve yazmak için <b>Tümünü aç</b>’a dokun.
            </div>
          </div>
        </section>
      )}

      {activeTab === "gpx" && (
        <section ref={gpxSectionRef} className="rd-section" data-section="gpx">
          <div className="rd-sectionHead">
            <div className="rd-sectionTitle">GPX</div>

            <button
              type="button"
              className="rd-sectionCta"
              onClick={() => {
                if (!canInteract) return;
                try {
                  onRequestTab?.("gpx");
                } catch {}
                onExportGpx?.();
              }}
              disabled={!canInteract}
            >
              İndir
            </button>
          </div>

          <div className="rd-gpxCard">
            <div className="rd-gpxCardText">Rotayı GPX olarak indirip saat/app’te kullanabilirsin.</div>
          </div>
        </section>
      )}

      {/* ✅ Rapor: hero menüden açılıyor */}
      {activeTab === "report" && !isEditMode && (
        <section ref={reportSectionRef} className="rd-section" data-section="report">
          <div className="rd-sectionHead">
            <div className="rd-sectionTitle">Rapor</div>
          </div>

          <RouteDetailReportTab
            reportLoaded={reportLoaded}
            routeAgg={routeAgg}
            stopAgg={stopAggForReport}
            stops={stops}
            distanceText={distanceText}
            durationText={durationText}
            stopsText={stopsText}
            avgSpeedText={avgSpeedText}
          />
        </section>
      )}
    </div>
  );
}