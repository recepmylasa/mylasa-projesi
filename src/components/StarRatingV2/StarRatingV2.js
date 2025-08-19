// StarRatingV2.js
// Tek ikon yıldız + uzun basınca 5'li panel + sürükle-bırak seçim + büyük yıldız animasyonu
// Notlar:
// - Varsayılan tek ikon: içi beyaz, dışı siyah konturlu (renksiz).
// - Panelde seçilen yıldızlar sarıya döner (highlight).
// - Kısa dokunma/tık = 1★. 300ms+ basılı tut = panel açılır.
// - Bırakınca ekranda büyük sarı yıldız + verilen puan animasyonu çıkar.
// - Ses opsiyonel: soundSrc vermezsen sessiz çalışır.

import React, { useEffect, useRef, useState, useCallback } from "react";
import "./StarRatingV2.css";
import StarFeedbackAnimation from "./StarFeedbackAnimation";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Bas kontur yıldız (renksiz görünüm)
function OutlineStar({ size = 28, active = false, className = "", title }) {
  // SVG beşgen yıldız (normalize)
  return (
    <svg
      aria-hidden="true"
      role="img"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`sr2-star ${active ? "active" : ""} ${className}`}
    >
      <title>{title}</title>
      <path
        d="M12 2l2.955 6.201 6.844.996-4.95 4.826 1.169 6.817L12 17.77 5.982 20.84l1.169-6.817-4.95-4.826 6.844-.996L12 2z"
        fill={active ? "#FFD400" : "#FFFFFF"}
        stroke="#111"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Props:
 * - onRate: (value: 1..5) => Promise|void    // oy gönderimi çağrısı (ör. rateContent)
 * - size?: number                            // tek ikonun piksel boyu (default 28)
 * - soundSrc?: string                        // opsiyonel ses (örn: '/assets/sounds/star.mp3')
 * - disabled?: boolean                       // devre dışı
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
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 }); // viewport koordinatı
  const [hoverStars, setHoverStars] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackValue, setFeedbackValue] = useState(0);

  // dokunuş/mouse ile panel açma
  const openPanelAt = useCallback((clientX, clientY) => {
    // paneli parmağın/imlecin biraz üstünde göster
    const OFFSET_Y = 56; // parmak üstü
    const px = clamp(clientX, 40, window.innerWidth - 40);
    const py = clamp(clientY - OFFSET_Y, 60, window.innerHeight - 80);
    setPanelPos({ x: px, y: py });
    setHoverStars(3); // varsayılan orta
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setHoverStars(0);
  }, []);

  // panel içi hangi yıldıza denk geliyor?
  const computeStarsFromPointer = useCallback((clientX) => {
    const el = panelRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const relX = clamp(clientX - rect.left, 0, rect.width);
    const step = rect.width / 5;
    const idx = Math.ceil(relX / step);
    return clamp(idx, 1, 5);
  }, []);

  // oy işlemi + animasyon + ses
  const commitVote = useCallback(
    async (value) => {
      if (disabled || !value) return;
      try {
        // Ses (opsiyonel)
        if (soundSrc && typeof Audio !== "undefined") {
          try {
            const a = new Audio(soundSrc);
            a.volume = 0.6;
            a.play().catch(() => {});
          } catch {}
        }
        // Gönder
        await onRate?.(value);
      } finally {
        setFeedbackValue(value);
        setShowFeedback(true);
        setTimeout(() => setShowFeedback(false), 650); // animasyon süresi ile aynı
      }
    },
    [disabled, onRate, soundSrc]
  );

  // pointer olayları
  const onPointerDown = (e) => {
    if (disabled) return;
    const { clientX, clientY } =
      e.touches?.length ? e.touches[0] : e;
    // uzun bas tespiti
    holdTimer.current = setTimeout(() => {
      openPanelAt(clientX, clientY);
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
    // kısa tık: 1★
    if (!panelOpen) {
      clearHold();
      await commitVote(1);
      return;
    }
    // panel açıksa bırakma konumuna göre oyla veya iptal et
    clearHold();
    const up = e.changedTouches?.length ? e.changedTouches[0] : e;
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
      // iptal
      closePanel();
    }
  };

  const onPointerMove = (e) => {
    if (!panelOpen) return;
    const move = e.touches?.length ? e.touches[0] : e;
    const stars = computeStarsFromPointer(move.clientX);
    setHoverStars(stars);
    // panel açıkken sayfayı kaydırma
    if (e.cancelable) e.preventDefault();
  };

  // dışa tıklayınca kapat
  useEffect(() => {
    const onDocDown = (e) => {
      if (!panelOpen) return;
      const p = panelRef.current;
      if (p && !p.contains(e.target)) {
        closePanel();
      }
    };
    document.addEventListener("pointerdown", onDocDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [panelOpen, closePanel]);

  return (
    <div
      className={`sr2-root ${className}`}
      ref={rootRef}
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

      {/* Panel (5 yıldız) */}
      {panelOpen && (
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
              <OutlineStar size={28} active={n <= hoverStars} />
            </button>
          ))}
        </div>
      )}

      {/* Büyük geri bildirim */}
      <StarFeedbackAnimation
        visible={showFeedback}
        value={feedbackValue}
      />
    </div>
  );
}
