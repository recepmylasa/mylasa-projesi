// src/pages/RouteDetailMobile/components/RouteDetailCoverPickerOverlayMobile.js
import React from "react";

export default function RouteDetailCoverPickerOverlayMobile({
  open,
  mode,
  state,
  upload,
  onClose,
  onBack,
  onChooseFromStops,
  onUploadFromDevice,
  onPickCover,
  onImgLoad,
  onImgError,
}) {
  if (!open) return null;

  return (
    <div className="route-detail-cover-picker-overlay" onClick={onClose}>
      <div className="route-detail-cover-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="route-detail-cover-picker-head">
          {mode === "stops" && (
            <button
              type="button"
              className="route-detail-cover-picker-back"
              onClick={onBack}
              aria-label="Geri"
              title="Geri"
            >
              ←
            </button>
          )}
          <div className="route-detail-cover-picker-title">Kapak seç</div>
          <button
            type="button"
            className="route-detail-cover-picker-close"
            onClick={onClose}
            aria-label="Kapat"
            title="Kapat"
          >
            ✕
          </button>
        </div>

        {mode === "menu" && (
          <>
            {state?.error && <div className="route-detail-cover-picker-error">Kapak medyaları yüklenemedi. ({state.error})</div>}

            <div className="route-detail-cover-picker-actions">
              <button
                type="button"
                className="route-detail-cover-picker-actionBtn"
                onClick={onChooseFromStops}
                disabled={!!upload?.uploading}
                title="Durak fotoğraflarından kapak seç"
              >
                Durak fotoğraflarından seç <span aria-hidden="true">›</span>
              </button>

              <button
                type="button"
                className="route-detail-cover-picker-actionBtn"
                onClick={onUploadFromDevice}
                disabled={!!upload?.uploading}
                title="Cihazdan fotoğraf yükle"
              >
                Cihazdan yükle <span aria-hidden="true">⤴</span>
              </button>
            </div>

            <div className="route-detail-cover-picker-hint">Not: Durakta foto olmasa bile “Cihazdan yükle” her zaman çalışır.</div>
          </>
        )}

        {mode === "stops" && (
          <>
            {state?.error && <div className="route-detail-cover-picker-error">Kapak medyaları yüklenemedi. ({state.error})</div>}
            {state?.loading && <div className="route-detail-cover-picker-loading">Yükleniyor…</div>}

            {!state?.loading && (
              <div className="route-detail-cover-grid">
                {(state?.items || []).map((it) => (
                  <button
                    key={`${it.stopId}_${it.mediaId || it.id}`}
                    type="button"
                    className="route-detail-cover-grid-item"
                    onClick={() => onPickCover(it)}
                    title="Kapak olarak seç"
                  >
                    <img
                      src={it.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onLoad={(e) => onImgLoad?.(e, { scope: "cover_picker", stopId: it.stopId, mediaId: it.mediaId || it.id || null })}
                      onError={(e) => onImgError?.(e, { scope: "cover_picker", stopId: it.stopId, mediaId: it.mediaId || it.id || null })}
                    />
                  </button>
                ))}

                {(state?.items || []).length === 0 && <div className="route-detail-cover-picker-empty">Bu rotada kapak için seçilebilir foto yok.</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
