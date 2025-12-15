// src/pages/RouteDetailMobile.ui.js

import React, { useCallback, useEffect, useState } from "react";

export function Lightbox({ items = [], index = 0, onClose = () => {} }) {
  const clamp = useCallback(
    (v) => {
      const max = Math.max(0, items.length - 1);
      return Math.min(Math.max(0, Number(v) || 0), max);
    },
    [items.length]
  );

  const [i, setI] = useState(() => clamp(index));

  useEffect(() => {
    setI(clamp(index));
  }, [index, clamp]);

  const goPrev = useCallback(() => setI((p) => Math.max(0, p - 1)), []);
  const goNext = useCallback(
    () => setI((p) => Math.min(items.length - 1, p + 1)),
    [items.length]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, onClose]);

  if (!items.length) return null;
  const cur = items[i];

  const overlay = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.85)",
    zIndex: 3000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const navBtn = (side) => ({
    position: "absolute",
    top: "50%",
    [side]: 10,
    transform: "translateY(-50%)",
    background: "rgba(0,0,0,.4)",
    color: "#fff",
    border: "0",
    borderRadius: 999,
    width: 44,
    height: 44,
    fontSize: 20,
    cursor: "pointer",
  });
  const closeBtnStyle = {
    position: "absolute",
    top: 10,
    right: 10,
    background: "rgba(0,0,0,.4)",
    color: "#fff",
    border: "0",
    borderRadius: 999,
    width: 40,
    height: 40,
    fontSize: 18,
    cursor: "pointer",
  };

  return (
    <div style={overlay} onMouseDown={onClose}>
      <button
        style={closeBtnStyle}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ✕
      </button>

      {i > 0 && (
        <button
          style={navBtn("left")}
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
        >
          ‹
        </button>
      )}

      {i < items.length - 1 && (
        <button
          style={navBtn("right")}
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
        >
          ›
        </button>
      )}

      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: "92vw", maxHeight: "86vh" }}
      >
        {cur.type === "video" ? (
          <video
            src={cur.url}
            controls
            style={{ maxWidth: "92vw", maxHeight: "86vh" }}
          />
        ) : (
          <img
            src={cur.url}
            alt={cur.title || "media"}
            style={{
              maxWidth: "92vw",
              maxHeight: "86vh",
              objectFit: "contain",
            }}
          />
        )}
      </div>
    </div>
  );
}

export function StarBars({
  counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  total = 0,
  compact = false,
  showNumbers = true,
  height = 10,
}) {
  const rows = [5, 4, 3, 2, 1];
  const maxCount = Math.max(...rows.map((r) => counts[r] || 0), 1);

  const barStyle = (r) => ({
    height,
    width: total
      ? `${Math.max(4, Math.round(((counts[r] || 0) / maxCount) * 100))}%`
      : "4%",
    background: "#1a73e8",
    borderRadius: 999,
    transition: "width .25s ease",
  });

  const wrap = {
    display: "grid",
    gridTemplateColumns: compact ? "1fr" : "24px 1fr 48px",
    gap: 8,
    width: "100%",
  };
  const rowCss = { display: "contents" };

  return (
    <div style={{ width: "100%" }}>
      <div style={wrap}>
        {rows.map((r) => (
          <div key={r} style={rowCss}>
            {!compact && <div style={{ fontSize: 12, opacity: 0.7 }}>{r}★</div>}
            <div
              style={{
                background: "#e5e7eb",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div style={barStyle(r)} />
            </div>
            {!compact && showNumbers && (
              <div style={{ fontSize: 12, textAlign: "right", opacity: 0.8 }}>
                {counts[r] || 0}
              </div>
            )}
          </div>
        ))}
      </div>

      {!compact && (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
          Toplam: {total}
        </div>
      )}
    </div>
  );
}
