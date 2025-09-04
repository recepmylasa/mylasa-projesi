// src/components/StarRatingV2/StarRatingV2.js
// Tek ikon yıldız + (masaüstü: tek tıkta panel) (dokunmatik: uzun bas)
// Panel ve büyük yıldız createPortal ile <body> içine çizilir; z-index/overflow sorunu yok.

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "./StarRatingV2.css";
import StarFeedbackAnimation from "./StarFeedbackAnimation";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Bas kontur yıldız (renksiz görünüm)
function OutlineStar({ size = 28, active = false, className = "", title }) {
  return (
    <svg
      aria-hidden="true"
      role="img"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`sr2-star ${active ? "active" : ""} ${className}`}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M12 2l2.955 6.201 6.844.996-4.95 4.826 1.169 6.817L12 17.77 5.982 20.84l1.169-6.817-4.95-4.826 6.844-.996L12 2z"
        fill="#FFFFFF"
        stroke="#111"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Props:
 * - onRate: (value: 1..5) => Promise|void
 * - size?: number
 * - soundSrc?: string
 * - disabled?: boolean
 * - className?: string
 */
export default function StarRatingV2({
  onRate,
  size = 28,
  soundSrc = null,
  disabled = false,
  className = "",
}) {
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const holdTimer = useRef(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const [hoverStars, setHoverStars] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackValue, setFeedbackValue] = useState(0);

  // paneli ekranda imlecin biraz ALTINDA aç (dikey liste)
  const openPanelAt = useCallback((clientX, clientY) => {
    const OFFSET_Y = 12;
    const px = clamp(clientX, 40, window.innerWidth - 40);
    const py = clamp(clientY + OFFSET_Y, 60, window.innerHeight - 80);
    setPanelPos({ x: px, y: py });
    setHoverStars(0); // başlangıçta dolu olmasın
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setHoverStars(0);
  }, []);

  // panel içi hangi yıldıza denk geliyor? (dikey veya yatay çalışır)
  const computeStarsFromPointer = useCallback((clientX, clientY) => {
    const el = panelRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();

    // dikey panelse yükseklik daha baskındır
    const isVertical = rect.height >= rect.width;
    if (isVertical) {
      const relY = clamp(clientY - rect.top, 0, rect.height);
      const step = rect.height / 5;
      const idx = Math.ceil(relY / step);
      return clamp(idx, 1, 5);
    } else {
      const relX = clamp(clientX - rect.left, 0, rect.width);
      const step = rect.width / 5;
      const idx = Math.ceil(relX / step);
      return clamp(idx, 1, 5);
    }
  }, []);

  // oy işlemi + animasyon + ses
  const commitVote = useCallback(
    async (value) => {
      if (disabled || !value) return;
      try {
        if (soundSrc && typeof Audio !== "undefined") {
          try {
            const a = new Audio(soundSrc);
            a.volume = 0.6;
            a.play().catch(() => {});
          } catch {}
        }
        await onRate?.(value);
      } finally {
        setFeedbackValue(value);
        setShowFeedback(true);
        window.setTimeout(() => setShowFeedback(false), 700);
      }
    },
    [disabled, onRate, soundSrc]
  );

  // pointer olayları
  const onPointerDown = (e) => {
    if (disabled) return;
    const p = e.touches?.[0] || e;

    // Masaüstü: tek tıkta paneli hemen aç
    if (!e.touches) {
      openPanelAt(p.clientX, p.clientY);
      return;
    }

    // Dokunmatik: uzun basınca aç
    holdTimer.current = window.setTimeout(() => {
      openPanelAt(p.clientX, p.clientY);
    }, 300);
  };

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const onPointerUp = async (e) => {
    if (disabled) return;
    const up = e.changedTouches?.[0] || e;

    // Panel açıksa bırakma konumuna göre oyla
    if (panelOpen) {
      clearHold();
      const el = panelRef.current;
      if (!el) {
        closePanel();
        return;
      }
      const rect = el.getBoundingClientRect();
      const inside =
        up.clientX >= rect.left &&
        up.clientX <= rect.right &&
        up.clientY >= rect.top &&
        up.clientY <= rect.bottom;

      if (inside && hoverStars > 0) {
        closePanel();
        await commitVote(hoverStars);
      } else {
        closePanel();
      }
      return;
    }

    // Panel kapalı (dokunmatik kısa dokunuş): 1★ ver
    if (e.touches) {
      clearHold();
      await commitVote(1);
    }
  };

  const onPointerMove = (e) => {
    if (!panelOpen) return;
    const move = e.touches?.[0] || e;
    const stars = computeStarsFromPointer(move.clientX, move.clientY);
    setHoverStars(stars);
    if (e.cancelable) e.preventDefault(); // panel açıkken sayfayı kaydırma
  };

  // dışa tıklayınca/Escape’te kapat
  useEffect(() => {
    const onDocDown = (e) => {
      if (!panelOpen) return;
      const p = panelRef.current;
      if (p && !p.contains(e.target)) closePanel();
    };
    const onKey = (e) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("pointerdown", onDocDown, { capture: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocDown, { capture: true });
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen, closePanel]);

  // temizlik
  useEffect(() => () => clearHold(), []);

  return (
    <div
      ref={rootRef}
      className={`sr2-root ${className}`}
      onTouchStart={onPointerDown}
      onTouchEnd={onPointerUp}
      onTouchMove={onPointerMove}
      onMouseDown={onPointerDown}
      onMouseUp={onPointerUp}
      onMouseMove={onPointerMove}
      role="button"
      aria-label="Yıldız ver"
      tabIndex={0}
    >
      {/* Tek ikon (renksiz) */}
      <OutlineStar size={size} title="Yıldız ver" />

      {/* Panel (5 yıldız) — body portal */}
      {panelOpen &&
        createPortal(
          <div
            className="sr2-panel"
            ref={panelRef}
            style={{ left: panelPos.x, top: panelPos.y }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className="sr2-panel-btn"
                onMouseEnter={() => setHoverStars(n)}
                onFocus={() => setHoverStars(n)}
                onClick={async (e) => {
                  e.stopPropagation();
                  closePanel();
                  await commitVote(n);
                }}
                aria-label={`${n} yıldız seç`}
                type="button"
              >
                <OutlineStar size={30} active={n <= hoverStars} />
              </button>
            ))}
          </div>,
          document.body
        )}

      {/* Büyük geri bildirim (body portal) */}
      {showFeedback &&
        createPortal(
          <StarFeedbackAnimation
            visible={showFeedback}
            value={feedbackValue}
          />,
          document.body
        )}
    </div>
  );
}
