// src/components/Labubu/LabubuGridDesktop.js
import React from "react";
import "./Labubu.css";

export default function LabubuGridDesktop({ cards = [], boxesReady = 0, onOpenBox, onOpenCard }) {
  return (
    <div className="labubu-grid labubu-grid--desktop">
      <button
        type="button"
        className={`labubu-cell labubu-cell--box ${boxesReady>0?"ready":""}`}
        onDoubleClick={()=>{ if (boxesReady>0) onOpenBox?.("standardBox"); }}
        title={boxesReady>0 ? "Çift tık: Kutuyu aç" : "Kutu yok"}
      >
        <div className="labubu-box-illu" />
        <div className="labubu-box-label">
          {boxesReady>0 ? `Kutu: ${boxesReady}` : "Kutu yok"}
          <span className="labubu-hint">double-click</span>
        </div>
      </button>

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
