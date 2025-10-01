// StarRatingV2 – tek tetikleyici, portal popover, responsive yıldız boyutu,
// capture ile alttaki tıklamayı keser. Oy yazımı reputationClient.rateContent.
// Çalışmıyorsa bile event yayınlar (logda görürsün).

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import "./StarRatingV2.css";

import { auth } from "../../firebase";
import { rateContent } from "../../reputationClient";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const vw = () => (typeof window !== "undefined" ? window.innerWidth : 360);
const vh = () => (typeof window !== "undefined" ? window.innerHeight : 640);

function Star({ size = 28, active = false, title }) {
  return (
    <svg
      aria-hidden="true"
      role="img"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`sr2-star ${active ? "active" : ""}`}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M12 2l2.955 6.201 6.844.996-4.95 4.826 1.169 6.817L12 17.77 5.982 20.84l1.169-6.817-4.95-4.826 6.844-.996L12 2z"
        fill="#fff"
        stroke="#111"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* --------------------------------- FEEDBACK -------------------------------- */
function Feedback({ x, y, value, onDone }) {
  const left = clamp(x, 16, vw() - 16);
  const top = clamp(y, 24, vh() - 24);
  useEffect(() => {
    const t = setTimeout(onDone, 900);
    return () => clearTimeout(t);
  }, [onDone]);
  return ReactDOM.createPortal(
    <div className="sr2-feedback" style={{ left, top }}>
      {"★".repeat(value)}
      <span className="sr2-feedback-mul">×{value}</span>
    </div>,
    document.body
  );
}

/* --------------------------------- POPOVER --------------------------------- */
function useFitStarSize() {
  // 5 yıldız + 4 gap + yatay padding popover’a sığacak şekilde icon boyutunu düşür.
  const [size, setSize] = useState(30);
  useEffect(() => {
    const calc = () => {
      const maxWidth = Math.min(400, vw() - 32); // 16px sağ/sol tampon
      const gap = 6;
      const padX = 20; // 10px sağ + 10px sol
      let s = 30;
      // 5*s + 4*gap + padX <= maxWidth
      while (5 * s + 4 * gap + padX > maxWidth && s > 18) s -= 1;
      setSize(s);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return size;
}

function Popover({ x, y, onClose, onSelect }) {
  const left = clamp(x, 16, vw() - 16);
  const top = clamp(y, 56, vh() - 16);
  const icon = useFitStarSize();
  const [hover, setHover] = useState(0);
  const wrapRef = useRef(null);

  // ESC
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stopAll = (e) => {
    if (!e) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent?.stopImmediatePropagation) e.nativeEvent.stopImmediatePropagation();
  };

  // Parmağı panel üzerinde gezdirirken hover güncelle (mobilde "hover yok" sorununu çözer)
  const onPointerMove = (e) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const relX = clamp(e.clientX - box.left, 0, box.width);
    const step = box.width / 5;
    const h = clamp(Math.ceil(relX / step), 1, 5);
    setHover(h);
  };

  const node = (
    <>
      <div className="sr2-backdrop" onMouseDownCapture={stopAll} onClick={onClose} />
      <div
        ref={wrapRef}
        className="sr2-popover"
        style={{ left, top }}
        role="dialog"
        aria-label="Puan seç"
        onMouseDownCapture={stopAll}
        onClick={stopAll}
        onPointerMove={onPointerMove}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="sr2-item"
            aria-label={`${n} yıldız`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onClick={(e) => {
              stopAll(e);
              onSelect(n);
            }}
          >
            <Star size={icon} active={n <= hover} />
            <span className="sr-only">{n}</span>
          </button>
        ))}
      </div>
    </>
  );

  return ReactDOM.createPortal(node, document.body);
}

/* --------------------------------- ROOT ------------------------------------ */
/**
 * Props:
 *  - contentId, authorId, type: "post" | "clip" | "story"
 *  - className, size, disabled
 *  - onRated?(value:number)
 */
export default function StarRatingV2({
  contentId,
  authorId,
  type = "post",
  className = "",
  size = 28,
  disabled = false,
  onRated,
}) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState(null); // {x,y,val}

  const stopAll = useCallback((e) => {
    if (!e) return;
    if (e.cancelable) e.preventDefault(); // alttaki link/anchor’ı iptal
    e.stopPropagation();
    if (e.nativeEvent?.stopImmediatePropagation) e.nativeEvent.stopImmediatePropagation();
  }, []);

  const openFromTrigger = useCallback(
    (e) => {
      stopAll(e);
      if (disabled) return;
      const r = btnRef.current?.getBoundingClientRect?.();
      if (!r) return;
      setPos({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top) });
      setOpen(true);
    },
    [disabled, stopAll]
  );

  const close = useCallback(() => setOpen(false), []);

  const select = useCallback(
    async (val) => {
      if (disabled || busy) return;
      setOpen(false);

      // feedback (balon) – tetik noktasının biraz üstünden başlat
      const r = btnRef.current?.getBoundingClientRect?.();
      if (r) setFb({ x: r.left + r.width / 2, y: Math.max(24, r.top - 8), val });

      try {
        const uid = auth?.currentUser?.uid;
        if (uid && contentId && authorId) {
          setBusy(true);
          await rateContent({ contentId, authorId, value: val, type });
        } else {
          // dev
          window.dispatchEvent(new CustomEvent("mylasa:rate", { detail: { value: val } }));
          // eslint-disable-next-line no-console
          console.log("[StarRatingV2] seçilen oy:", val);
        }
        onRated && onRated(val);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[StarRatingV2] rateContent hata:", err);
      } finally {
        setBusy(false);
      }
    },
    [authorId, busy, contentId, disabled, onRated, type]
  );

  // FEED ALT BARI İÇİN: capture + pointerdown + click -> tüm kontekslerde çalışır
  const handlers = useMemo(
    () => ({
      onMouseDownCapture: stopAll,
      onTouchStartCapture: stopAll,
      onPointerDownCapture: stopAll,
      onPointerDown: openFromTrigger, // mouse & touch anında aç
      onClick: openFromTrigger, // bazı yapılar pointerdown'u bastırabiliyor
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") openFromTrigger(e);
      },
    }),
    [openFromTrigger, stopAll]
  );

  return (
    <div className={`sr2-wrap ${className}`} data-sr2="wrap">
      <button
        ref={btnRef}
        type="button"
        className="sr2-trigger"
        aria-label="Yıldız ver"
        disabled={disabled || busy}
        {...handlers}
      >
        <Star size={size} title="Yıldız ver" />
      </button>

      {open && <Popover x={pos.x} y={pos.y} onClose={close} onSelect={select} />}

      {fb && (
        <Feedback
          x={fb.x}
          y={fb.y}
          value={fb.val}
          onDone={() => setFb(null)}
        />
      )}
    </div>
  );
}
