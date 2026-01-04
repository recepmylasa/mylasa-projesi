// src/pages/RouteDetailMobile/components/RouteDetailCoverRow.js
import React from "react";
import { DEFAULT_ROUTE_COVER_URL } from "../routeDetailUtils";

export default function RouteDetailCoverRow({
  coverResolved,
  coverIsPlaceholder,
  isOwner,
  coverPickBtnLabel,
  coverStatusText,
  coverUpload,
  coverKindUi,
  onOpenPicker,
  onClearCover,
  onImgLoad,
  onImgError,
}) {
  return (
    <div className="route-detail-cover-row">
      <div className="route-detail-cover-thumb">
        <img
          src={coverResolved || DEFAULT_ROUTE_COVER_URL}
          alt="Kapak"
          loading="lazy"
          decoding="async"
          onLoad={onImgLoad}
          onError={onImgError}
        />
        {isOwner && coverIsPlaceholder && (
          <button type="button" className="route-detail-cover-cta" onClick={onOpenPicker}>
            Kapak seç
          </button>
        )}
      </div>

      <div className="route-detail-cover-meta">
        <div className="route-detail-cover-title">Kapak fotoğrafı</div>
        <div className="route-detail-cover-sub">{coverStatusText}</div>

        {isOwner && coverUpload?.error && (
          <div className="route-detail-cover-upload-error">Yükleme başarısız oldu. ({coverUpload.error})</div>
        )}

        {isOwner && (
          <div className="route-detail-cover-actions">
            <button type="button" className="route-detail-cover-btn" onClick={onOpenPicker} disabled={!!coverUpload?.uploading}>
              {coverPickBtnLabel}
            </button>

            {coverKindUi === "picked" && !coverUpload?.uploading && (
              <button type="button" className="route-detail-cover-btn route-detail-cover-btn--danger" onClick={onClearCover}>
                Kapağı kaldır
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
