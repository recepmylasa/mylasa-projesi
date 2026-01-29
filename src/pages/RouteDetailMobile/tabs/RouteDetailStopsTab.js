// FILE: src/pages/RouteDetailMobile/tabs/RouteDetailStopsTab.js
import React, { useCallback, useMemo, useRef } from "react";
import StarBars from "../components/StarBars";
import StarRatingV2 from "../../../components/StarRatingV2/StarRatingV2";

export default function RouteDetailStopsTab({
  mode = "view", // "view" | "edit"
  isOwner = false,
  canInteract = true,

  stops,
  stopAgg,
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
  const isEdit = useMemo(() => !!isOwner && mode === "edit", [isOwner, mode]);

  const safeOpenLightbox = (items, idx) => {
    if (!canInteract) return;
    if (typeof openLightbox !== "function") return;
    try {
      openLightbox(items, idx);
    } catch {}
  };

  const safePickMedia = (stopId) => {
    if (!canInteract) return;
    if (typeof onPickMedia !== "function") return;
    try {
      onPickMedia(stopId);
    } catch {}
  };

  // ✅ Thumb request spam kırıcı (hover/touch aynı durağa üst üste çağırmasın)
  const thumbsReqRef = useRef(new Map());
  const requestThumbs = useCallback(
    (stopId) => {
      if (!canInteract) return;
      if (typeof ensureStopThumbs !== "function") return;

      const now = Date.now();
      const last = thumbsReqRef.current.get(stopId) || 0;

      // 2.5s throttle: aynı stop için sürekli tetiklenmesin
      if (now - last < 2500) return;

      thumbsReqRef.current.set(stopId, now);
      try {
        ensureStopThumbs(stopId);
      } catch {}
    },
    [canInteract, ensureStopThumbs]
  );

  return (
    <div
      className="rdtab rdtab--stops"
      data-mode={mode}
      data-owner={isOwner ? "1" : "0"}
      data-interact={canInteract ? "1" : "0"}
    >
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
                  <div className="rd-stop-title">{s.title || `Durak ${nLabel}`}</div>
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

                  {/* ✅ EMİR 13: Owner ve edit modda rating UI pasif (pırıl pırıl parite) */}
                  <StarRatingV2
                    onRated={(v) => {
                      if (!canInteract) return;
                      if (isOwner) return;
                      if (isEdit) return;
                      if (typeof onStopRate !== "function") return;
                      onStopRate(s.id, v);
                    }}
                    size={22}
                    disabled={!canInteract || isOwner || isEdit}
                  />

                  {/* ✅ EMİR 13: Edit modda yalnızca owner için “Medya Ekle” */}
                  {isEdit && (
                    <button
                      type="button"
                      onClick={() => safePickMedia(s.id)}
                      className="rdglass-btn"
                      disabled={!canInteract}
                    >
                      Medya Ekle
                    </button>
                  )}
                </div>

                {/* Medya satırı */}
                <div
                  className="rd-stop-media"
                  onMouseEnter={() => requestThumbs(s.id)}
                  onTouchStart={() => requestThumbs(s.id)}
                >
                  {media.slice(0, 4).map((m, mIdx) => {
                    const isVideo = normalizeMediaType(m) === "video";
                    return (
                      <button
                        key={m.id || mIdx}
                        type="button"
                        className="rd-stop-mediaItem"
                        onClick={() => safeOpenLightbox(buildLightboxItems(media), mIdx)}
                        title={isVideo ? "Video" : "Fotoğraf"}
                        aria-label={isVideo ? "Videoyu görüntüle" : "Fotoğrafı görüntüle"}
                        disabled={!canInteract}
                      >
                        {isVideo && (
                          <div className="rd-stop-mediaItem__videoBadge" aria-hidden="true">
                            ▶︎
                          </div>
                        )}

                        {/* ✅ Ghost click/video click-yutma kırıcı: preview elementleri pointer-events:none */}
                        {isVideo ? (
                          <video
                            src={m.url}
                            muted
                            playsInline
                            preload="metadata"
                            disablePictureInPicture
                            controlsList="nodownload noplaybackrate"
                            tabIndex={-1}
                            aria-hidden="true"
                            style={{ pointerEvents: "none" }}
                          />
                        ) : (
                          <img
                            src={m.url}
                            alt="Durak medyası"
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            style={{ pointerEvents: "none" }}
                            onError={(e) =>
                              onImgError?.(e, { scope: "stop_media", stopId: s.id, mediaId: m?.id || null })
                            }
                          />
                        )}
                      </button>
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

                      <button
                        type="button"
                        onClick={() => (canInteract ? cancelUpload(s.id) : null)}
                        className="rdglass-btn rd-stop-uploadCancel"
                        disabled={!canInteract}
                      >
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
