// FILE: src/pages/RouteDetailMobile/tabs/RouteDetailGalleryTab.js
import React from "react";

export default function RouteDetailGalleryTab({
  galleryItems,
  galleryState,
  gallerySentinelRef,
  normalizeMediaType,
  buildLightboxItems,
  openLightbox,
  onImgError,
}) {
  return (
    <div className="rdtab rdtab--gallery">
      <div className="rdglass-gallery-grid">
        {(galleryItems || []).map((it, idx) => {
          const isVideo = normalizeMediaType(it) === "video";
          return (
            <button
              key={`${it.stopId || "s"}_${it.id || idx}`}
              type="button"
              className="rdglass-gallery-tile route-detail-media-tile"
              onClick={() => openLightbox(buildLightboxItems(galleryItems), idx)}
              title={isVideo ? "Video" : "Fotoğraf"}
            >
              {isVideo && (
                <div className="route-detail-video-badge" aria-hidden="true">
                  ▶︎
                </div>
              )}

              {isVideo ? (
                <video
                  src={it.url}
                  muted
                  playsInline
                  preload="metadata"
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <img
                  src={it.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={(e) => onImgError?.(e, { scope: "gallery_grid", stopId: it.stopId || null, mediaId: it.id || null })}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {(galleryItems || []).length === 0 && (
        <div className="rdglass-card rdglass-card--pad rdglass-empty">
          <div className="rdglass-muted" style={{ fontSize: 13 }}>
            Henüz galeri medyası yok.
          </div>
        </div>
      )}

      <div ref={gallerySentinelRef} className="rdglass-row" style={{ height: 1 }} />

      {galleryState?.loading && (
        <div className="rdglass-card rdglass-card--pad rdglass-empty">
          <div className="rdglass-muted" style={{ fontSize: 12 }}>
            Yükleniyor…
          </div>
        </div>
      )}

      {galleryState?.done && (galleryItems || []).length > 0 && (
        <div className="rdglass-card rdglass-card--pad rdglass-empty">
          <div className="rdglass-muted" style={{ fontSize: 12 }}>
            Hepsi bu kadar.
          </div>
        </div>
      )}
    </div>
  );
}
