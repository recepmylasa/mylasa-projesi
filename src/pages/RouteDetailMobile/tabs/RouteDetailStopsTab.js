// FILE: src/pages/RouteDetailMobile/tabs/RouteDetailStopsTab.js
import React, { useCallback, useMemo, useRef } from "react";
import StarBars from "../components/StarBars";
import StarRatingV2 from "../../../components/StarRatingV2/StarRatingV2";

export default function RouteDetailStopsTab({
  mode = "view", // "view" | "edit"
  isOwner = false,
  canInteract = true,

  stops,
  stopsLoaded = true, // ✅ NEW: parent’tan geliyor (loading/empty ayrımı)
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

  const safeBuildLightboxItems = (arr) => {
    try {
      return typeof buildLightboxItems === "function" ? buildLightboxItems(arr) : arr;
    } catch {
      return arr;
    }
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

  const list = Array.isArray(stops) ? stops : [];
  const len = list.length;

  return (
    <div
      className="rdtab rdtab--stops"
      data-mode={mode}
      data-owner={isOwner ? "1" : "0"}
      data-interact={canInteract ? "1" : "0"}
    >
      <div className="rd-stops">
        {list.map((s, idx) => {
          const cache = mediaCacheRef?.current?.get?.(s.id) || {};
          const media = Array.isArray(cache.items) ? cache.items : [];
          const up = uploadState?.[s.id];
          const hadPermErr = cache.__error && String(cache.__error).includes("permission");

          const nRaw = Number(s?.order);
          const n = Number.isFinite(nRaw) && nRaw > 0 ? nRaw : idx + 1;
          const nLabel = String(n).padStart(2, "0");

          const isLast = idx === len - 1;

          // ✅ Manus: 1–2 thumb (fazlası +N)
          const preview = media.slice(0, 2);
          const extraCount = Math.max(0, media.length - preview.length);

          return (
            <div
              key={s.id}
              className={`rd-stop rd-stopItem rdglass-card${isLast ? " is-last" : ""}`}
              data-last={isLast ? "1" : "0"}
              data-is-last={isLast ? "true" : "false"} // ✅ CSS paritesi için ek sinyal
              onPointerEnter={() => requestThumbs(s.id)}
              onFocus={() => requestThumbs(s.id)}
              onTouchStart={() => requestThumbs(s.id)}
            >
              {/* Sol: index card (mevcut davranış bozulmasın) */}
              <div className="rd-stop-left" aria-hidden="true">
                <div className="rd-stop-indexCard">
                  <span className="rd-stop-indexCard__label">Durak</span>
                  <span className="rd-stop-indexCard__num">{nLabel}</span>
                </div>
              </div>

              {/* Orta: timeline hairline */}
              <div
                className={`rd-stop-mid${isLast ? " is-last" : ""}`}
                aria-hidden="true"
                data-last={isLast ? "1" : "0"}
                data-is-last={isLast ? "true" : "false"}
              />

              {/* Sağ: içerik */}
              <div className="rd-stop-right">
                <div className="rd-stop-title">{s.title || `Durak ${nLabel}`}</div>

                <div className="rd-stop-miniRow">
                  {stopAgg && stopAgg[s.id] ? (
                    <div className="rd-stop-agg" aria-label="Durak puan dağılımı">
                      <StarBars
                        counts={stopAgg[s.id].counts}
                        total={stopAgg[s.id].total}
                        compact
                        height={8}
                        showNumbers={false}
                      />
                    </div>
                  ) : (
                    <div className="rd-stop-agg rd-stop-agg--empty" aria-hidden="true" />
                  )}

                  {/* ✅ Rating mini satır: title altı (Flash paritesi) */}
                  <StarRatingV2
                    onRated={(v) => {
                      if (!canInteract) return;
                      if (isOwner) return;
                      if (isEdit) return;
                      if (typeof onStopRate !== "function") return;
                      onStopRate(s.id, v);
                    }}
                    size={20}
                    disabled={!canInteract || isOwner || isEdit}
                  />

                  {/* ✅ Edit modda yalnızca owner için “Medya Ekle” (mini boy) */}
                  {isEdit && (
                    <button
                      type="button"
                      onClick={() => safePickMedia(s.id)}
                      className="rdglass-btn rd-stop-addMediaBtn"
                      disabled={!canInteract}
                    >
                      Medya Ekle
                    </button>
                  )}
                </div>

                {/* Açıklama: yoksa hiç render olmasın */}
                {s.note ? <div className="rd-stop-desc">{s.note}</div> : null}

                {/* Medya row: Manus -> 1–2 thumb + “+N” */}
                {preview.length > 0 ? (
                  <div className="rd-stop-media" data-thumb-count={String(preview.length)}>
                    {preview.map((m, mIdx) => {
                      const isVideo = normalizeMediaType?.(m) === "video";
                      return (
                        <button
                          key={m.id || mIdx}
                          type="button"
                          className="rd-stop-mediaItem"
                          onClick={() => safeOpenLightbox(safeBuildLightboxItems(media), mIdx)}
                          title={isVideo ? "Video" : "Fotoğraf"}
                          aria-label={isVideo ? "Videoyu görüntüle" : "Fotoğrafı görüntüle"}
                          disabled={!canInteract}
                        >
                          {isVideo && (
                            <div className="rd-stop-mediaItem__videoBadge" aria-hidden="true">
                              ▶︎
                            </div>
                          )}

                          {/* ✅ Ghost click kırıcı: preview elementleri pointer-events:none */}
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

                    {extraCount > 0 ? (
                      <div className="rd-stop-mediaMore" aria-hidden="true" title={`+${extraCount} medya`}>
                        +{extraCount}
                      </div>
                    ) : null}
                  </div>
                ) : hadPermErr ? (
                  <div className="rd-stop-mediaHint rdglass-muted">Medya erişimi kısıtlı.</div>
                ) : null}

                {/* Upload row */}
                {up ? (
                  <div className="rd-stop-upload">
                    <div className="rd-stop-uploadRow">
                      <div className="rdglass-progress-track">
                        <div className="rd-stop-uploadFill" style={{ width: `${up.p || 0}%` }} />
                      </div>

                      <div className="rd-stop-uploadPct rdglass-muted">{up.p || 0}%</div>

                      <button
                        type="button"
                        onClick={() => (canInteract && typeof cancelUpload === "function" ? cancelUpload(s.id) : null)}
                        className="rdglass-btn rd-stop-uploadCancel"
                        disabled={!canInteract}
                      >
                        İptal
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {/* ✅ Loading/Empty ayrımı */}
        {len === 0 && !stopsLoaded ? (
          <div className="rdglass-card rdglass-card--pad rdglass-empty">
            <div className="rdglass-muted" style={{ fontSize: 13 }}>
              Duraklar yükleniyor…
            </div>
          </div>
        ) : null}

        {len === 0 && !!stopsLoaded ? (
          <div className="rdglass-card rdglass-card--pad rdglass-empty">
            <div className="rdglass-muted" style={{ fontSize: 13 }}>
              Bu rotada durak yok.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}