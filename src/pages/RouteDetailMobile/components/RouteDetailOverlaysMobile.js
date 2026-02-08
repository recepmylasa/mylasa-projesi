// FILE: src/pages/RouteDetailMobile/components/RouteDetailOverlaysMobile.js
import React from "react";

import CommentsPanel from "../../../components/CommentsPanel/CommentsPanel";
import ShareSheetMobile from "../../../components/ShareSheetMobile";
import Lightbox from "./Lightbox";
import RouteDetailCoverPickerOverlayMobile from "./RouteDetailCoverPickerOverlayMobile";

const overlayWrapStyle = { position: "fixed", inset: 0, zIndex: 975, pointerEvents: "auto" };

export default function RouteDetailOverlaysMobile({
  // edit / blockers
  isEditMode,
  blockInteractionsBriefly,

  // share sheet
  showShareSheet,
  setShowShareSheet,
  shareRoutePayload,
  shareStops,

  // cover picker
  showCoverPickerOverlay,
  coverPickerMode,
  coverPickerState,
  coverUpload,
  closeCoverPicker,
  backToCoverPickerMenu,
  chooseCoverFromStops,
  uploadCoverFromDevice,
  pickCover,
  onImgLoadProof,
  onImgErrorToDefault,

  // comments
  commentsOverlayOpen,
  setCommentsOverlayOpen,
  routeId,
  commentsPortalEl,
  setCommentsPortalEl,

  // lightbox
  lightboxItems,
  lightboxIndex,
  setLightboxItems,
  lightboxPortalEl,
  setLightboxPortalEl,
}) {
  const hasLightboxItems = Array.isArray(lightboxItems) && lightboxItems.length > 0;

  return (
    <>
      {showShareSheet && !isEditMode && (
        <div
          className="route-detail-share-overlay rdglass-overlay"
          style={overlayWrapStyle}
          onClick={(e) => {
            e.stopPropagation();
            setShowShareSheet(false);
            blockInteractionsBriefly(260);
          }}
        >
          <div className="route-detail-share-overlay__inner rdglass-overlay__inner" onClick={(e) => e.stopPropagation()}>
            <ShareSheetMobile
              route={shareRoutePayload}
              stops={shareStops}
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
            onImgLoad={onImgLoadProof}
            onImgError={onImgErrorToDefault}
          />
        </div>
      )}

      {/* ✅ Comments overlay (anchor’dan ayrı state) */}
      {commentsOverlayOpen && !isEditMode && (
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
              setCommentsOverlayOpen(false);
              blockInteractionsBriefly(260);
            }}
            portalTarget={commentsPortalEl || undefined}
          />
        </div>
      )}

      {/* ✅ Lightbox FIX: boş array [] overlay’yi kilitlemesin */}
      {hasLightboxItems && (
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
    </>
  );
}
