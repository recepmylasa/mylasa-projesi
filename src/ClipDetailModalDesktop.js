// src/ClipDetailModalDesktop.js
// Masaüstü Clip modalı — Reels paritesi: tekil menü + kısa TR zaman + BODY portal menü

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ClipDetailModalDesktop.css";

/* ================= Helpers ================= */
function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts < 2e12 ? ts * 1000 : ts; // s→ms
  if (typeof ts === "string") {
    const t = Date.parse(ts);
    return Number.isNaN(t) ? 0 : t;
  }
  if (ts.seconds) return ts.seconds * 1000;
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return 0;
}

function formatTimeAgoTR(input) {
  const then = toMillis(input);
  if (!then) return "";
  const diffS = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffS < 60) return `${diffS}s`;                 // Xs
  const m = Math.floor(diffS / 60);
  if (m < 60) return `${m}dk`;                        // Xdk
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa`;                        // Xsa
  const g = Math.floor(h / 24);
  return `${g}g`;                                     // Xg
}

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

/* =============== Body portal ================= */
function useBodyPortal() {
  const elRef = useRef(null);
  if (!elRef.current) {
    const el = document.createElement("div");
    el.setAttribute("data-portal", "clipdesk-menu");
    elRef.current = el;
  }
  useEffect(() => {
    const el = elRef.current;
    document.body.appendChild(el);
    return () => {
      try { document.body.removeChild(el); } catch (_) {}
    };
  }, []);
  return elRef.current;
}

/* ================= Component ================= */
export default function ClipDetailModalDesktop({ clip, onClose, onUserClick }) {
  const videoRef = useRef(null);
  const portalRoot = useBodyPortal();

  // Tekil menü durumu: { id, x, y } veya null
  const [openMenu, setOpenMenu] = useState(null);

  const src =
    clip?.mediaUrl || clip?.videoUrl || clip?.url || clip?.sourceUrl || "";
  const yorumlar = useMemo(
    () => (Array.isArray(clip?.yorumlar) ? clip.yorumlar : []),
    [clip]
  );

  /* ESC: menü açıksa kapat; aksi halde modalı kapat */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (openMenu) setOpenMenu(null);
        else onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, openMenu]);

  /* Dış tıkla menü kapama (capture:true) */
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e) => {
      const menuEl = document.querySelector('[data-clipdesk-menu="true"]');
      const trigger = document.querySelector(`*[data-cm-trigger="${openMenu.id}"]`);
      if (menuEl && menuEl.contains(e.target)) return;
      if (trigger && trigger.contains(e.target)) return;
      setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [openMenu]);

  /* Autoplay güvenli başlatma */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.playsInline = true;
    const start = async () => {
      try { await v.play(); } catch (_) {}
    };
    start();
  }, []);

  const onMoreClick = (cid, ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuW = 180;
    const menuH = 100;
    const x = clamp(r.left + r.width - menuW, 8, vw - menuW - 8);
    const y = clamp(r.top + r.height + 8, 8, vh - menuH - 8);
    setOpenMenu((prev) => (prev && prev.id === cid ? null : { id: cid, x, y }));
  };

  const renderMenu = () => {
    if (!openMenu || !portalRoot) return null;
    const style = {
      position: "fixed",
      left: `${openMenu.x}px`,
      top: `${openMenu.y}px`,
      zIndex: 2600, // modal içinde en üst katmanda
      background: "#fff",
      border: "1px solid rgba(0,0,0,.15)",
      borderRadius: 12,
      boxShadow: "0 8px 24px rgba(0,0,0,.2)",
      padding: 8,
      minWidth: 160,
      color: "#111",
    };
    const itemCls = "clipdesk__menuItem";
    return createPortal(
      <div style={style} data-clipdesk-menu="true" role="menu">
        <button role="menuitem" className={itemCls} onClick={() => setOpenMenu(null)}>
          Bağlantıyı Kopyala
        </button>
        <button role="menuitem" className={itemCls} onClick={() => setOpenMenu(null)}>
          İptal
        </button>
      </div>,
      portalRoot
    );
  };

  return (
    <div className="clipdesk__panel" role="dialog" aria-modal="true">
      <button className="clipdesk__close" onClick={onClose} aria-label="Kapat">✕</button>

      <div className="clipdesk__content">
        <div className="clipdesk__videoWrap">
          {src ? (
            <video ref={videoRef} src={src} controls playsInline muted className="clipdesk__video" />
          ) : (
            <div className="clipdesk__empty">Video bulunamadı</div>
          )}
        </div>

        <aside className="clipdesk__meta">
          {/* Başlık */}
          {clip?.kullaniciAdi && (
            <div className="clipdesk__header">
              <span className="clipdesk__username" onClick={() => onUserClick?.(clip?.authorId)}>
                {clip.kullaniciAdi}
              </span>
              {clip?.tarih && (
                <span className="clipdesk__time" title={new Date(toMillis(clip.tarih)).toLocaleString("tr-TR")}>
                  {formatTimeAgoTR(clip.tarih)}
                </span>
              )}
            </div>
          )}

          {/* Açıklama */}
          {clip?.caption && <div className="clipdesk__caption">{clip.caption}</div>}

          {/* Yorumlar */}
          <div className="clipdesk__comments">
            {yorumlar.map((y, i) => {
              const cid = y.commentId || `${y.userId || "u"}_${i}`;
              const isOpen = openMenu?.id === cid;
              return (
                <div className={`clipdesk__cmtRow ${isOpen ? "menu-open" : ""}`} key={cid}>
                  <img
                    className="clipdesk__cmtAvatar"
                    src={y.photoURL || "https://placehold.co/32x32/EFEFEF/AAAAAA?text=P"}
                    alt={y.username || ""}
                  />
                  <div className="clipdesk__cmtBody">
                    <div className="clipdesk__cmtTop">
                      <b className="clipdesk__cmtUser" onClick={() => onUserClick?.(y.userId)}>
                        {y.username || ""}
                      </b>
                      <span className="clipdesk__cmtTime" title={new Date(toMillis(y.timestamp)).toLocaleString("tr-TR")}>
                        {formatTimeAgoTR(y.timestamp)}
                      </span>
                    </div>

                    {y.text && <div className="clipdesk__cmtText">{y.text}</div>}

                    <div className="clipdesk__cmtActions">
                      <button
                        className="clipdesk__cmtMore"
                        aria-haspopup="menu"
                        aria-expanded={isOpen}
                        onClick={(ev) => onMoreClick(cid, ev)}
                        data-cm-trigger={cid}
                        title="Daha fazla"
                      >
                        …
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {renderMenu()}
    </div>
  );
}
