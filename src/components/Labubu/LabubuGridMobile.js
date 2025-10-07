import React from "react";
import "./Labubu.css";
import BoxTile from "./BoxTile";

/**
 * Mobil grid:
 * - Aynı görünüm; hover yok, tap’te hafif scale
 */
export default function LabubuGridMobile({
  cards = [],
  boxesReady = 0,
  onOpenBox,
  onOpenCard,
}) {
  return (
    <div className="labubu-grid labubu-grid--mobile">
      <BoxTile
        count={boxesReady}
        onOpen={() => onOpenBox?.("standardBox")}
      />

      {cards.map((c) => (
        <button
          key={c.code}
          className={`labubu-cell labubu-card labubu-card--mobile rarity-${c.rarity}`}
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
