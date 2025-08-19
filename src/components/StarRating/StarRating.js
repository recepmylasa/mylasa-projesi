// src/components/StarRating/StarRating.js
import React, { useEffect, useRef, useState, useCallback } from "react";
import "./StarRating.css";
import {
  auth,
  db,
} from "../../firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  rateContent,
  onContentAggregate,
  CONTENT_COL,
  RATINGS_SUBCOL,
} from "../../reputationClient";

const StarIcon = ({ filled, half, size = 20 }) => {
  // Tek path ile doldurma; half olduğunda clip ile yarım doldurur
  return (
    <svg
      className={`mr-star ${filled ? "filled" : ""} ${half ? "half" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mr-half">
          <stop offset="50%" stopColor="currentColor" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {half && (
        <path
          d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2v15.27z"
          fill="url(#mr-half)"
        />
      )}
    </svg>
  );
};

function useMyRating(contentId) {
  const [my, setMy] = useState(null);
  useEffect(() => {
    const uid = auth?.currentUser?.uid;
    if (!uid || !contentId) return;
    const ref = doc(db, CONTENT_COL, contentId, RATINGS_SUBCOL, uid);
    const unsub = onSnapshot(ref, (snap) => {
      setMy(snap.exists() ? snap.data()?.value || null : null);
    });
    return () => unsub && unsub();
  }, [contentId]);
  return my;
}

export default function StarRating({
  contentId,
  authorId,
  type = "post", // 'post' | 'story' | 'clip'
  size = "md",   // 'sm' | 'md' | 'lg'
  readOnly = false,
  showMeta = true, // ortalama ve oy sayısını göster
  className = "",
}) {
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const pressTimer = useRef(null);
  const lastTapRef = useRef(0);

  const my = useMyRating(contentId);

  // İçerik agregesini canlı izle
  useEffect(() => {
    if (!contentId) return;
    const unsub = onContentAggregate(contentId, (agg) => {
      const a = Number(agg?.bayes || 0);
      const c = Number(agg?.count || 0);
      setAvg(a);
      setCount(c);
    });
    return () => unsub && unsub();
  }, [contentId]);

  const submit = useCallback(
    async (val) => {
      if (readOnly || !contentId || !authorId) return;
      if (!Number.isInteger(val) || val < 1 || val > 5) return;
      try {
        setBusy(true);
        await rateContent({ contentId, authorId, value: val, type });
        setChooserOpen(false);
      } catch (e) {
        console.error("rateContent error:", e);
      } finally {
        setBusy(false);
      }
    },
    [contentId, authorId, type, readOnly]
  );

  // Double-tap/double-click → hızlı 5★
  const onQuickFive = useCallback(
    (e) => {
      const now = Date.now();
      if (now - lastTapRef.current < 350) {
        submit(5);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    },
    [submit]
  );

  // Basılı tut → büyük seçici
  const onPressStart = useCallback(() => {
    if (readOnly) return;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setChooserOpen(true), 300);
  }, [readOnly]);
  const onPressEnd = useCallback(() => {
    clearTimeout(pressTimer.current);
  }, []);

  const label = count > 0 ? `${avg.toFixed(1)} • ${Intl.NumberFormat().format(count)} oy` : "Puanla";

  const sizeClass = size === "lg" ? "mr-lg" : size === "sm" ? "mr-sm" : "mr-md";

  return (
    <div className={`mr-wrap ${sizeClass} ${className}`}>
      <div
        className={`mr-row ${readOnly ? "read-only" : ""}`}
        role="radiogroup"
        aria-label="Yıldızla puanla"
        onDoubleClick={onQuickFive}
        onTouchStart={onPressStart}
        onTouchEnd={onPressEnd}
        onMouseDown={onPressStart}
        onMouseUp={onPressEnd}
      >
        {[1, 2, 3, 4, 5].map((v) => {
          const active = hover ? v <= hover : my ? v <= my : false;
          return (
            <button
              key={v}
              type="button"
              className={`mr-starbtn ${active ? "active" : ""}`}
              aria-checked={my === v}
              role="radio"
              onMouseEnter={() => setHover(v)}
              onMouseLeave={() => setHover(0)}
              onClick={() => submit(v)}
              disabled={busy || readOnly}
            >
              <StarIcon filled={active} />
              <span className="sr-only">{v} yıldız</span>
            </button>
          );
        })}
      </div>

      {showMeta && (
        <div className="mr-meta" aria-live="polite">
          {label}
        </div>
      )}

      {/* Büyük seçici (basılı tut) */}
      {chooserOpen && !readOnly && (
        <div className="mr-chooser" onClick={() => setChooserOpen(false)}>
          <div className="mr-chooser-box" onClick={(e) => e.stopPropagation()}>
            <div className="mr-chooser-title">Puan ver</div>
            <div className="mr-chooser-stars">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  className="mr-chooser-btn"
                  onClick={() => submit(v)}
                  disabled={busy}
                >
                  <StarIcon filled size={28} />
                  <div className="mr-chooser-label">{v}</div>
                </button>
              ))}
            </div>
            <button className="mr-chooser-close" onClick={() => setChooserOpen(false)}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
