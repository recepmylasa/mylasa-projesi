// Tek ikon -> tıklayınca (mouse) panel; dokunmatikte kısa dokunuş 1★, uzun bas panel.
// Panel BodyPortal ile <body>’ye çizilir.

import React, { useEffect, useRef, useState, useCallback } from "react";
import "./StarRatingV2.css";
import StarFeedbackAnimation from "./StarFeedbackAnimation";
import BodyPortal from "../BodyPortal";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const DEBUG = typeof window !== "undefined" && window.localStorage?.sr2Debug === "1";
const dlog = (...a) => { if (DEBUG) console.log("[SR2]", ...a); };

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
 * - onRate: (1..5) => Promise|void
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
  const holdFired = useRef(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const [hoverStars, setHoverStars] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackValue, setFeedbackValue] = useState(0);

  // ---- AJAN: yıldızın merkezinde kim üstte? (her 350ms kontrol) ----
  const [blocker, setBlocker] = useState(null);
  useEffect(() => {
    if (!DEBUG) return;
    let lastKey = "";
    const iv = setInterval(() => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const topEl = document.elementFromPoint(cx, cy);
      let key = "";
      if (topEl && !el.contains(topEl)) {
        key =
          (topEl.id ? `#${topEl.id}` : "") ||
          (typeof topEl.className === "string" && topEl.className.split(" ").filter(Boolean)[0]) ||
          topEl.nodeName?.toLowerCase();
      }
      if (key !== lastKey) {
        lastKey = key;
        setBlocker(key || null);
        if (key) dlog("BLOCKED BY:", key, topEl);
        else dlog("NOT BLOCKED");
      }
    }, 350);
    return () => clearInterval(iv);
  }, []);

  // belge seviyesinde pointerdown logu (isteğe bağlı yardımcı)
  useEffect(() => {
    if (!DEBUG) return;
    const onDocDown = (e) => {
      const topEl = document.elementFromPoint(e.clientX, e.clientY);
      dlog("DOC pointerdown topEl:", topEl?.className || topEl?.id || topEl?.nodeName, topEl);
    };
    document.addEventListener("pointerdown", onDocDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDocDown, { capture: true });
  }, []);

  const openPanelAt = useCallback((clientX, clientY) => {
    const OFFSET_Y = 12;
    const px = clamp(clientX, 40, window.innerWidth - 40);
    const py = clamp(clientY + OFFSET_Y, 60, window.innerHeight - 80);
    setPanelPos({ x: px, y: py });
    setHoverStars(0);
    setPanelOpen(true);
    dlog("panel open @", { px, py });
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setHoverStars(0);
    dlog("panel close");
  }, []);

  const computeStarsFromPointer = useCallback((clientX, clientY) => {
    const el = panelRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const relX = clamp(clientX - rect.left, 0, rect.width);
    const step = rect.width / 5;
    return clamp(Math.ceil(relX / step), 1, 5);
  }, []);

  const commitVote = useCallback(
    async (value) => {
      if (disabled || !value) return;
      dlog("commit", value);
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

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    holdFired.current = false;
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    // mouse: anında panel
    if (e.pointerType === "mouse") {
      openPanelAt(e.clientX, e.clientY);
      return;
    }
    // touch/pen: 300ms uzun bas → panel; kısa dokunuş = 1★
    holdTimer.current = window.setTimeout(() => {
      holdFired.current = true;
      openPanelAt(e.clientX, e.clientY);
    }, 300);
  };

  const onPointerUp = async (e) => {
    if (disabled) return;
    if (panelOpen) {
      clearHold();
      const el = panelRef.current;
      if (!el) return closePanel();
      const r = el.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside) {
        const stars = hoverStars > 0 ? hoverStars : computeStarsFromPointer(e.clientX, e.clientY);
        if (stars > 0) {
          closePanel();
          await commitVote(stars);
          return;
        }
      }
      closePanel();
      return;
    }
    // panel yoksa ve uzun bas tetiklenmediyse -> hızlı 1★
    if (!holdFired.current && e.pointerType !== "mouse") {
      clearHold();
      await commitVote(1);
    } else {
      clearHold();
    }
  };

  const onPointerMove = (e) => {
    if (!panelOpen) return;
    const stars = computeStarsFromPointer(e.clientX, e.clientY);
    setHoverStars(stars);
    // preventDefault kullanmıyoruz; pasif listener uyarısına gerek yok.
  };

  // dış tık/Escape kapatsın
  useEffect(() => {
    const onDocDown = (e) => {
      if (!panelOpen) return;
      const p = panelRef.current;
      const r = rootRef.current;
      if (p && p.contains(e.target)) return;
      if (r && r.contains(e.target)) return;
      closePanel();
    };
    const onKey = (e) => e.key === "Escape" && closePanel();
    document.addEventListener("pointerdown", onDocDown, { capture: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocDown, { capture: true });
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen, closePanel]);

  useEffect(() => () => clearHold(), []);

  // ---- RENDER ----
  return (
    <button
      ref={rootRef}
      type="button"
      data-sr2="1"
      className={`sr2-root ${className || ""}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerMove={onPointerMove}
      onPointerDownCapture={(e) => e.stopPropagation()} // üst tıklamalara balonlanmasın
      onClickCapture={(e) => e.stopPropagation()}
      aria-label="Yıldız ver"
      title="Yıldız ver"
    >
      <OutlineStar size={size} title="Yıldız ver" />

      {/* DEBUG rozet: yalnızca sr2Debug=1 iken görünür */}
      {DEBUG && blocker && (
        <span className="sr2-debug-pill" title="Bu eleman tıklamayı örtüyor">
          blocked by: {blocker}
        </span>
      )}

      {(panelOpen || showFeedback) && (
        <BodyPortal id="star-rating-v2">
          {panelOpen && (
            <div className="sr2-panel" ref={panelRef} style={{ left: panelPos.x, top: panelPos.y }}>
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
            </div>
          )}

          {showFeedback && (
            <StarFeedbackAnimation visible={showFeedback} value={feedbackValue} />
          )}
        </BodyPortal>
      )}
    </button>
  );
}
