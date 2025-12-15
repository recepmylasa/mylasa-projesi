// src/pages/RouteDetailMobile/components/Lightbox.js
import React, { useCallback, useEffect, useState } from "react";

export default function Lightbox({ items = [], index = 0, onClose = () => {} }) {
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
