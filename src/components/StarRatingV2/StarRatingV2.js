// src/components/StarRatingV2/StarRatingV2.js
// Masaüstünde tek tıkla 5'li paneli aç, seçimle oy ver.
// Dokunmatik/uzun bas destekli. Büyük yıldız animasyonu korunur.

import React, { useEffect, useRef, useState, useCallback } from "react";
import "./StarRatingV2.css";
import StarFeedbackAnimation from "./StarFeedbackAnimation";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

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

  // === Yardımcılar ===
  const starCenter = useCallback(() => {
    const el = rootRef.current;
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, []);

  const openPanelAt = useCallback((clientX, clientY) => {
    const OFFSET_Y = 56; // parmak üstünde/ikonun biraz üzerinde göster
    const px = clamp(clientX, 40, window.innerWidth - 40);
    const py = clamp(clientY - OFFSET_Y, 60, window.innerHeight - 80);
    setPanelPos({ x: px, y: py });
    setHoverStars(3);
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setHoverStars(0);
  }, []);

  const computeStarsFromPointer = useCallback((clientX) => {
    const el = panelRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const relX = clamp(clientX - rect.left, 0, rect.width);
    const step = rect.width / 5;
    const idx = Math.ceil(relX / step);
    return clamp(idx, 1, 5);
  }, []);

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
        setTimeout(() => setShowFeedback(false), 650);
      }
    },
    [disabled, onRate, soundSrc]
  );

  // === Etkileşim: Pointer tabanlı birleşik yaklaşım ===
  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    // Uzun basınca panel açılsın
    const p = e.nativeEvent;
    const clientX = p.clientX ?? starCenter().x;
    const clientY = p.clientY ?? starCenter().y;
    clearHold();
    holdTimer.current = setTimeout(() => openPanelAt(clientX, clientY), 300);
  };

  const onPointerUp = async (e) => {
    if (disabled) return;
    // Eğer panel açık değilse KISA TIKTA artık 1★ VERMİYORUZ —
    // Masaüstünde kısa tık, 5'li paneli açsın.
    if (!panelOpen) {
      clearHold();
      const { x, y } = starCenter();
      openPanelAt(x, y);
      return;
    }

    clearHold();
    const up = e.nativeEvent;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) { closePanel(); return; }

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
  };

  const onPointerMove = (e) => {
    if (!panelOpen) return;
    const p = e.nativeEvent;
    const stars = computeStarsFromPointer(p.clientX);
    setHoverStars(stars);
    if (e.cancelable) e.preventDefault();
  };

  // Dışa tıklayınca veya ESC ile kapat
  useEffect(() => {
    const onDocDown = (ev) => {
      if (!panelOpen) return;
      const p = panelRef.current;
      if (p && !p.contains(ev.target)) closePanel();
    };
    const onEsc = (ev) => {
      if (ev.key === "Escape") closePanel();
    };
    document.addEventListener("pointerdown", onDocDown, { passive: true });
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onDocDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [panelOpen, closePanel]);

  return (
    <div
      className={`sr2-root ${className}`}
      ref={rootRef}
      // Pointer tabanlı birleşik eventler
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerMove={onPointerMove}
      role="button"
      aria-label="Yıldız ver"
      tabIndex={0}
    >
      <OutlineStar size={size} title="Yıldız ver" />

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

      <StarFeedbackAnimation visible={showFeedback} value={feedbackValue} />
    </div>
  );
}
