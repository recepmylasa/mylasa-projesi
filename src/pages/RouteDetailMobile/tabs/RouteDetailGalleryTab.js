// src/pages/RouteDetailMobile/tabs/RouteDetailGalleryTab.js
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {(galleryItems || []).map((it, idx) => {
          const isVideo = normalizeMediaType(it) === "video";
          return (
            <button
              key={`${it.stopId || "s"}_${it.id || idx}`}
              type="button"
              style={{
                border: "none",
                padding: 0,
                borderRadius: 10,
                overflow: "hidden",
                background: "#f3f4f6",
                aspectRatio: "1 / 1",
                position: "relative",
                cursor: "pointer",
              }}
              onClick={() => openLightbox(buildLightboxItems(galleryItems), idx)}
              title={isVideo ? "Video" : "Fotoğraf"}
            >
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
              {isVideo && (
                <div
                  style={{
                    position: "absolute",
                    right: 6,
                    top: 6,
                    background: "rgba(0,0,0,.55)",
                    color: "#fff",
                    padding: "2px 6px",
                    borderRadius: 999,
                    fontSize: 11,
                  }}
                >
                  ▶︎
                </div>
              )}
            </button>
          );
        })}
      </div>

      {(galleryItems || []).length === 0 && (
        <div style={{ fontSize: 13, opacity: 0.7, padding: "6px 4px" }}>Henüz galeri medyası yok.</div>
      )}

      <div ref={gallerySentinelRef} style={{ height: 1 }} />
      {galleryState?.loading && <div style={{ fontSize: 12, opacity: 0.7, padding: "6px 4px" }}>Yükleniyor…</div>}
      {galleryState?.done && (galleryItems || []).length > 0 && (
        <div style={{ fontSize: 12, opacity: 0.6, padding: "6px 4px" }}>Hepsi bu kadar.</div>
      )}
    </div>
  );
}
