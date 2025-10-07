import React from "react";
import "./Labubu.css";
import BoxTile from "./BoxTile";

/**
 * Masaüstü grid:
 * - Kutu: hep canlı, ready olduğunda rozet çıkıyor
 * - Kart hücrelerinde isim YOK; hover’da hafif büyür
 * - LOVE dahil tüm kartlar img ile gösterilir; hata olursa silüete düşer
 */
export default function LabubuGridDesktop({
  cards = [],
  boxesReady = 0,
  onOpenBox,
  onOpenCard,
}) {
  return (
    <div className="labubu-grid labubu-grid--desktop">
      <BoxTile
        count={boxesReady}
        onOpen={() => onOpenBox?.("standardBox")}
      />

      {cards.map((c) => (
        <button
          key={c.code}
          className={`labubu-cell labubu-card rarity-${c.rarity}`}
          onClick={() => onOpenCard?.(c)}
          title={c.name}
        >
          <img
            className="labubu-thumb-img"
            src={c.asset}
            alt={c.name}
            loading="lazy"
            onError={(e) => { e.currentTarget.src = "/cards/_SILHOUETTE.jpg"; }}
            draggable={false}
          />
          {c.count > 1 && <span className="labubu-count">×{c.count}</span>}
        </button>
      ))}
    </div>
  );
}
