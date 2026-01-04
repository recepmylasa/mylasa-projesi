// src/pages/RouteDetailMobile/tabs/RouteDetailStopsTab.js
import React from "react";
import StarBars from "../components/StarBars";
import StarRatingV2 from "../../../components/StarRatingV2/StarRatingV2";

export default function RouteDetailStopsTab({
  stops,
  stopAgg,
  isOwner,
  uploadState,
  mediaCacheRef,
  ensureStopThumbs,
  onStopRate,
  onPickMedia,
  cancelUpload,
  normalizeMediaType,
  buildLightboxItems,
  openLightbox,
  onImgError,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(stops || []).map((s) => {
        const cache = mediaCacheRef.current.get(s.id) || {};
        const media = cache.items || [];
        const up = uploadState[s.id];
        const hadPermErr = cache.__error && String(cache.__error).includes("permission");

        return (
          <div key={s.id} style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
            <div
              style={{
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {s.order ? `${s.order}. ` : ""}
                  {s.title || `Durak ${s.order || ""}`}
                </div>
                {s.note && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{s.note}</div>}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {stopAgg && stopAgg[s.id] && (
                  <div style={{ minWidth: 120 }}>
                    <StarBars counts={stopAgg[s.id].counts} total={stopAgg[s.id].total} compact height={8} showNumbers={false} />
                  </div>
                )}

                <StarRatingV2 onRated={(v) => onStopRate(s.id, v)} size={22} disabled={isOwner} />

                {isOwner && (
                  <button
                    type="button"
                    onClick={() => onPickMedia(s.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      background: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Medya Ekle
                  </button>
                )}
              </div>
            </div>

            <div
              onMouseEnter={() => ensureStopThumbs(s.id)}
              onTouchStart={() => ensureStopThumbs(s.id)}
              style={{ display: "flex", gap: 6, padding: "8px 10px", overflowX: "auto" }}
            >
              {media.slice(0, 4).map((m, idx) => {
                const isVideo = normalizeMediaType(m) === "video";
                return (
                  <div
                    key={m.id || idx}
                    className="route-detail-media-tile"
                    onClick={() => openLightbox(buildLightboxItems(media), idx)}
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "#f3f4f6",
                      flex: "0 0 auto",
                      cursor: "pointer",
                      position: "relative",
                    }}
                    title={m.type}
                  >
                    {isVideo && (
                      <div className="route-detail-video-badge" aria-hidden="true">
                        ▶︎
                      </div>
                    )}

                    {isVideo ? (
                      <video
                        src={m.url}
                        muted
                        playsInline
                        preload="metadata"
                        disablePictureInPicture
                        controlsList="nodownload noplaybackrate"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <img
                        src={m.url}
                        alt="media"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => onImgError?.(e, { scope: "stop_media", stopId: s.id, mediaId: m?.id || null })}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    )}
                  </div>
                );
              })}

              {media.length === 0 && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>{hadPermErr ? "Medya erişimi kısıtlı." : "Medya yok"}</div>
              )}
            </div>

            {up && (
              <div style={{ padding: "0 10px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 8, background: "#eee", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${up.p || 0}%`, height: "100%", background: "#1a73e8" }} />
                  </div>
                  <div style={{ fontSize: 12, width: 36, textAlign: "right" }}>{up.p || 0}%</div>
                  <button
                    type="button"
                    onClick={() => cancelUpload(s.id)}
                    style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer" }}
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {(stops || []).length === 0 && (
        <div style={{ padding: "10px 4px", fontSize: 13, opacity: 0.7 }}>Bu rotada durak yok.</div>
      )}
    </div>
  );
}
