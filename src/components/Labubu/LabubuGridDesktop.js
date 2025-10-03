// src/components/Labubu/LabubuGridDesktop.js
import React, { useCallback, useState } from "react";
import "./Labubu.css";
import { safeResolve } from "../../utils/cardAssets";

export default function LabubuGridDesktop({
  cards = [],
  boxesReady = 0,
  onOpenBox,
  onOpenCard,
}) {
  const [opening, setOpening] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const runOpenAnimation = useCallback(async () => {
    if (!boxesReady || opening) return;
    setOpening(true);
    try {
      const maybeDrop = await (onOpenBox ? onOpenBox("standardBox") : null);
      if (maybeDrop?.asset) {
        const url = await safeResolve(maybeDrop.asset);
        setPreviewUrl(url);
      }
    } catch {/* noop */}
    finally {
      setTimeout(() => {
        setOpening(false);
        setPreviewUrl(null);
      }, 1200);
    }
  }, [boxesReady, opening, onOpenBox]);

  return (
    <div className="labubu-grid labubu-grid--desktop">
      <button
        type="button"
        className={`labubu-cell labubu-cell--box ${boxesReady>0?"ready":""} ${opening?"is-opening":""}`}
        onDoubleClick={runOpenAnimation}
        title={boxesReady>0 ? "Çift tık: Kutuyu aç" : "Kutu yok"}
        disabled={opening}
      >
        <div className="labubu-box-illu" />
        <div className="labubu-box-label">
          {boxesReady>0 ? `Kutu: ${boxesReady}` : "Kutu yok"}
          <span className="labubu-hint">double-click</span>
        </div>

        {opening && (
          <div className="labubu-opening" aria-hidden="true">
            <div
              className="labubu-opening-card"
              style={{ backgroundImage: `url(${previewUrl || "/cards/_SILHOUETTE.jpg"})` }}
            />
          </div>
        )}
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
