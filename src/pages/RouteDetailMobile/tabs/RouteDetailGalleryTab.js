// FILE: src/pages/RouteDetailMobile/tabs/RouteDetailGalleryTab.js
import React from "react";

export default function RouteDetailGalleryTab({
  mode = "view", // "view" | "edit"
  isOwner = false,
  canInteract = true,

  galleryItems,
  galleryState,
  gallerySentinelRef,
  normalizeMediaType,
  buildLightboxItems,
  openLightbox,
  onImgError,
}) {
  const items = Array.isArray(galleryItems) ? galleryItems : [];
  const isLoading = !!galleryState?.loading;

  // Loading + içerik azsa 6–8 skeleton
  const showSkeleton = isLoading && items.length < 6;
  const skeletonCount = showSkeleton ? Math.max(6, Math.min(8, 8 - items.length)) : 0;

  const openAt = (idx) => {
    if (!canInteract) return;
    try {
      openLightbox(buildLightboxItems(items), idx);
    } catch {}
  };

  return (
    <div className="rdtab rdtab--gallery" data-mode={mode} data-owner={isOwner ? "1" : "0"} data-interact={canInteract ? "1" : "0"}>
      <div className="rd-gallery" aria-busy={isLoading ? "true" : "false"}>
        {items.map((it, idx) => {
          const isVideo = normalizeMediaType(it) === "video";
          const key = `${it.stopId || "s"}_${it.id || idx}`;

          return (
            <button
              key={key}
              type="button"
              className="rd-galleryItem"
              onClick={() => openAt(idx)}
              title={isVideo ? "Video" : "Fotoğraf"}
              aria-label={isVideo ? "Galeride video" : "Galeride fotoğraf"}
              disabled={!canInteract}
            >
              {isVideo && (
                <div className="rd-galleryItem__videoBadge" aria-hidden="true">
                  ▶︎
                </div>
              )}

              {/* ✅ Ghost click/video click-yutma kırıcı: preview elementleri pointer-events:none */}
              {isVideo ? (
                <video
                  src={it.url}
                  muted
                  playsInline
                  preload="metadata"
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate"
                  style={{ pointerEvents: "none" }}
                />
              ) : (
                <img
                  src={it.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ pointerEvents: "none" }}
                  onError={(e) =>
                    onImgError?.(e, {
                      scope: "gallery_grid",
                      stopId: it.stopId || null,
                      mediaId: it.id || null,
                    })
                  }
                />
              )}
            </button>
          );
        })}

        {showSkeleton &&
          Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={`sk_${i}`} className="rd-gallerySkeleton" aria-hidden="true" />
          ))}
      </div>

      {items.length === 0 && !isLoading && <div className="rd-galleryEmpty">Galeride medya yok.</div>}

      <div ref={gallerySentinelRef} className="rd-gallerySentinel" />

      {galleryState?.done && items.length > 0 && !isLoading && (
        <div className="rd-galleryEmpty rd-galleryEmpty--foot">Hepsi bu kadar.</div>
      )}
    </div>
  );
}
