import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ClipDetailModalDesktop.css";

/* ===== Helpers ===== */
function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts < 2e12 ? ts * 1000 : ts; // s->ms
  if (typeof ts === "string") {
    const t = Date.parse(ts);
    return Number.isNaN(t) ? 0 : t;
  }
  if (ts.seconds) return ts.seconds * 1000;
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return 0;
}
function formatDateTR(input) {
  const ms = toMillis(input);
  if (!ms) return "";
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/* ===== Component ===== */
export default function ClipDetailModalDesktop({
  clip,                // { id, mediaUrl, yorumlar, tarih, kullaniciAdi, authorId, ... }
  onClose,             // modalı kapat
  onUserClick,         // kullanıcı adına tık
  onDeleteComment,     // yorum sil
}) {
  const videoRef = useRef(null);
  const commentsRef = useRef(null);

  // Post tarafındaki gibi TEK menü anahtarı
  const [openMenuId, setOpenMenuId] = useState(null);

  const src =
    clip?.mediaUrl || clip?.videoUrl || clip?.url || clip?.sourceUrl || "";
  const yorumlar = useMemo(
    () => (Array.isArray(clip?.yorumlar) ? clip.yorumlar : []),
    [clip]
  );

  /* ESC: menü açıksa kapat; değilse modalı kapat */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (openMenuId) setOpenMenuId(null);
        else onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMenuId, onClose]);

  /* Scroll/resize: açık menüyü kapat */
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    const list = commentsRef.current;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    if (list) list.addEventListener("scroll", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      if (list) list.removeEventListener("scroll", close);
    };
  }, [openMenuId]);

  /* Video güvenli başlatma */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.playsInline = true;
    const start = async () => { try { await v.play(); } catch {} };
    start();
  }, []);

  const handleDelete = (cid) => {
    setOpenMenuId(null);
    try { onDeleteComment?.(cid); } catch {}
  };

  return (
    <div
      className="clipdesk__root"
      data-modal-root="true"
      // Panelin içinden gelen olayları üst overlay’e sızdırma
      onPointerDownCapture={(e) => e.stopPropagation()}
      onClickCapture={(e) => e.stopPropagation()}
      onClick={() => openMenuId && setOpenMenuId(null)}
    >
      <div className="clipdesk__panel" onClick={(e) => e.stopPropagation()}>
        <button className="clipdesk__close" onClick={onClose} aria-label="Kapat">✕</button>

        <div className="clipdesk__content">
          {/* Sol: medya */}
          <div className="clipdesk__videoWrap">
            {src ? (
              <video
                ref={videoRef}
                src={src}
                controls
                playsInline
                muted
                className="clipdesk__video"
              />
            ) : (
              <div className="clipdesk__empty">Video bulunamadı</div>
            )}
          </div>

          {/* Sağ: meta & yorumlar */}
          <aside className="clipdesk__meta">
            {/* Header */}
            {clip?.kullaniciAdi && (
              <div className="clipdesk__header">
                <span
                  className="clipdesk__username"
                  onClick={() => onUserClick?.(clip?.authorId)}
                >
                  {clip.kullaniciAdi}
                </span>
                {clip?.tarih && (
                  <span
                    className="clipdesk__time"
                    title={formatDateTR(clip.tarih)}
                  >
                    {formatDateTR(clip.tarih)}
                  </span>
                )}
              </div>
            )}

            {/* Yorumlar */}
            <div className="clipdesk__comments" ref={commentsRef}>
              {yorumlar.map((y, i) => {
                const cid = y.commentId || `${y.userId || "u"}_${i}`;
                const menuOpen = openMenuId === cid;
                return (
                  <div
                    key={cid}
                    className={`clipdesk__cmtRow${menuOpen ? " menu-open" : ""}`}
                  >
                    <img
                      className="clipdesk__cmtAvatar"
                      src={y.photoURL || "https://placehold.co/32x32/EFEFEF/AAAAAA?text=P"}
                      alt={y.username || ""}
                    />
                    <div className="clipdesk__cmtBody">
                      <div className="clipdesk__cmtTop">
                        <b
                          className="clipdesk__cmtUser"
                          onClick={() => onUserClick?.(y.userId)}
                        >
                          {y.username || ""}
                        </b>
                        <span
                          className="clipdesk__cmtTime"
                          title={formatDateTR(y.timestamp)}
                        >
                          {formatDateTR(y.timestamp)}
                        </span>
                      </div>

                      {y.text && <div className="clipdesk__cmtText">{y.text}</div>}

                      <div className="clipdesk__cmtActions">
                        {/* 3 nokta */}
                        <button
                          className="clipdesk__cmtMore"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          title="Daha fazla"
                          onMouseDown={(e) => {
                            // overlay'e sızmasın + native dblclick senaryosunu da kes
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenMenuId((prev) => (prev === cid ? null : cid));
                          }}
                        >
                          …
                        </button>

                        {/* MENÜ — Post’ta olduğu gibi satır içinde, PORTAL YOK */}
                        {menuOpen && (
                          <div className="clipdesk__cmMenu" role="menu">
                            <button
                              role="menuitem"
                              className="danger"
                              onClick={() => handleDelete(cid)}
                            >
                              Sil
                            </button>
                            <button
                              role="menuitem"
                              onClick={() => setOpenMenuId(null)}
                            >
                              İptal
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Alt bant — sadece TARİH */}
            {clip?.tarih && (
              <div className="clipdesk__footer" aria-label="İçerik tarihi">
                {formatDateTR(clip.tarih)}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
