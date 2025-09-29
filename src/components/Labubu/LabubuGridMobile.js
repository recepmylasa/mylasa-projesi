// src/components/Labubu/LabubuGridMobile.js
import React, { useState } from "react";
import "./Labubu.css";

export default function LabubuGridMobile({ cards = [], boxesReady = 0, onOpenBox, onOpenCard }) {
  const [tapCount, setTapCount] = useState(0);

  const handleDoubleTap = () => {
    const t = Date.now();
    setTapCount((prevTs) => {
      const prev = typeof prevTs === "number" ? prevTs : 0;
      if (t - prev < 350) {
        if (boxesReady > 0) onOpenBox?.("standardBox");
        return 0;
      }
      return t;
    });
  };

  return (
    <div className="labubu-grid labubu-grid--mobile">
      {/* Gizli Kutu hücresi */}
      <button
        type="button"
        className={`labubu-cell labubu-cell--box ${boxesReady>0?"ready":""}`}
        onClick={handleDoubleTap}
        onDoubleClick={(e)=>{ e.preventDefault(); if (boxesReady>0) onOpenBox?.("standardBox"); }}
        title={boxesReady>0 ? "Çift dokun: Kutuyu aç" : "Kutu yok"}
      >
        <div className="labubu-box-illu" />
        <div className="labubu-box-label">
          {boxesReady>0 ? `Kutu: ${boxesReady}` : "Kutu yok"}
          <span className="labubu-hint">çift dokun</span>
        </div>
      </button>

      {/* Kartlar */}
      {cards.map((c) => (
        <button
          key={c.code}
          className={`labubu-cell labubu-cell--card rarity-${c.rarity}`}
          onClick={()=>onOpenCard?.(c)}
          title={c.name}
        >
          <div className="labubu-thumb" style={{ backgroundImage:`url(${c.asset})` }} />
          <div className="labubu-name">{c.name}</div>
          {c.count>1 && <span className="labubu-count">×{c.count}</span>}
        </button>
      ))}
    </div>
  );
}
