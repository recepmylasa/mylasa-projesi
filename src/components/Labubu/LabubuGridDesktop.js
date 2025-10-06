// src/components/Labubu/LabubuGridDesktop.js
import React, { useEffect, useState } from "react";
import "./Labubu.css";

/** Tek işlevi: kart görselini güvenli yüklemek (LOVE önizleme sorunu dâhil). */
function ThumbBG({ asset }) {
  const [url, setUrl] = useState(asset || "/cards/_SILHOUETTE.jpg");

  useEffect(() => {
    let cancelled = false;

    const norm = (s) => (s || "").trim();
    const primary = norm(asset);

    // Adaylar: verilen URL + uzantı değişimleri (png/jpg/jpeg)
    const candidates = [];
    if (primary) {
      candidates.push(primary);
      if (/\.png$/i.test(primary)) candidates.push(primary.replace(/\.png$/i, ".jpg"));
      if (/\.jpe?g$/i.test(primary)) candidates.push(primary.replace(/\.jpe?g$/i, ".png"));
    }
    // Hiçbiri tutmazsa silüet
    candidates.push("/cards/_SILHOUETTE.jpg");

    let i = 0;
    const tryNext = () => {
      const src = candidates[i++];
      if (!src) return;
      const img = new Image();
      img.onload = () => { if (!cancelled) setUrl(src); };
      img.onerror = () => tryNext();
      img.src = src;
    };

    tryNext();
    return () => { cancelled = true; };
  }, [asset]);

  return <div className="labubu-thumb" style={{ backgroundImage: `url(${url})` }} />;
}

export default function LabubuGridDesktop({ cards = [], boxesReady = 0, onOpenBox, onOpenCard }) {
  return (
    <div className="labubu-grid labubu-grid--desktop">
      {/* KUTU – mevcut stillerine dokunmadım */}
      <button
        type="button"
        className={`labubu-cell labubu-cell--box ${boxesReady > 0 ? "ready" : ""}`}
        onDoubleClick={() => { if (boxesReady > 0) onOpenBox?.("standardBox"); }}
        title={boxesReady > 0 ? "Çift tık: Kutuyu aç" : "Kutu yok"}
      >
        <div className="labubu-box-illu" />
        <div className="labubu-box-label">
          {boxesReady > 0 ? `Kutu: ${boxesReady}` : "Kutu yok"}
          <span className="labubu-hint">double-click</span>
        </div>
      </button>

      {/* KARTLAR */}
      {cards.map((c) => (
        <button
          key={c.code}
          className={`labubu-cell labubu-cell--card rarity-${c.rarity}`}
          onClick={() => onOpenCard?.(c)}
          title={c.name}
        >
          <ThumbBG asset={c.asset} />
          <div className="labubu-name">{c.name}</div>
          {c.count > 1 && <span className="labubu-count">×{c.count}</span>}
        </button>
      ))}
    </div>
  );
}
