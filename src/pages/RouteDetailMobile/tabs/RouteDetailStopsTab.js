// FILE: src/pages/RouteDetailMobile/tabs/RouteDetailStopsTab.js
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
    <div className="rdtab rdtab--stops">
      <div className="rd-stops">
        {(stops || []).map((s, idx) => {
          const cache = mediaCacheRef.current.get(s.id) || {};
          const media = cache.items || [];
          const up = uploadState[s.id];
          const hadPermErr = cache.__error && String(cache.__error).includes("permission");

          const nRaw = Number(s?.order);
          const n = Number.isFinite(nRaw) && nRaw > 0 ? nRaw : idx + 1;
          const nLabel = String(n).padStart(2, "0");

          return (
            <div key={s.id} className="rd-stop rdglass-card">
              {/* Sol rail / timeline */}
              <div className="rd-stop-rail" aria-hidden="true">
                <div className="rd-stop-badge">
                  <span className="rd-stop-badge__label">Sıra</span>
                  <span className="rd-stop-badge__num">{nLabel}</span>
                </div>
              </div>

              {/* İç içerik */}
              <div className="rd-stop-content">
                <div className="rd-stop-head">
                  <div className="rd-stop-title">
                    {s.title || `Durak ${nLabel}`}
                    {s.order ? null : null}
                  </div>

                  {s.note ? <div className="rd-stop-desc">{s.note}</div> : null}
                </div>

                <div className="rd-stop-actions">
                  {stopAgg && stopAgg[s.id] && (
                    <div className="rd-stop-agg" aria-label="Durak puan dağılımı">
                      <StarBars
                        counts={stopAgg[s.id].counts}
                        total={stopAgg[s.id].total}
                        compact
                        height={8}
                        showNumbers={false}
                      />
                    </div>
                  )}

                  <StarRatingV2 onRated={(v) => onStopRate(s.id, v)} size={22} disabled={isOwner} />

                  {isOwner && (
                    <button type="button" onClick={() => onPickMedia(s.id)} className="rdglass-btn">
                      Medya Ekle
                    </button>
                  )}
                </div>

                {/* Medya satırı */}
                <div
                  className="rd-stop-media"
                  onMouseEnter={() => ensureStopThumbs(s.id)}
                  onTouchStart={() => ensureStopThumbs(s.id)}
                >
                  {media.slice(0, 4).map((m, mIdx) => {
                    const isVideo = normalizeMediaType(m) === "video";
                    return (
                      <div
                        key={m.id || mIdx}
                        className="rd-stop-mediaItem"
                        onClick={() => openLightbox(buildLightboxItems(media), mIdx)}
                        title={isVideo ? "Video" : "Fotoğraf"}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openLightbox(buildLightboxItems(media), mIdx);
                          }
                        }}
                      >
                        {isVideo && (
                          <div className="rd-stop-mediaItem__videoBadge" aria-hidden="true">
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
                          />
                        ) : (
                          <img
                            src={m.url}
                            alt="Durak medyası"
                            loading="lazy"
                            decoding="async"
                            onError={(e) => onImgError?.(e, { scope: "stop_media", stopId: s.id, mediaId: m?.id || null })}
                          />
                        )}
                      </div>
                    );
                  })}

                  {media.length === 0 && (
                    <div className="rd-stop-mediaEmpty rdglass-muted">
                      {hadPermErr ? "Medya erişimi kısıtlı." : "Medya yok"}
                    </div>
                  )}
                </div>

                {/* Upload row */}
                {up && (
                  <div className="rd-stop-upload">
                    <div className="rd-stop-uploadRow">
                      <div className="rdglass-progress-track">
                        <div className="rd-stop-uploadFill" style={{ width: `${up.p || 0}%` }} />
                      </div>

                      <div className="rd-stop-uploadPct rdglass-muted">{up.p || 0}%</div>

                      <button type="button" onClick={() => cancelUpload(s.id)} className="rdglass-btn rd-stop-uploadCancel">
                        İptal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {(stops || []).length === 0 && (
          <div className="rdglass-card rdglass-card--pad rdglass-empty">
            <div className="rdglass-muted" style={{ fontSize: 13 }}>
              Bu rotada durak yok.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
