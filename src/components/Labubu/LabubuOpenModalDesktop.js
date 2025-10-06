// src/components/Labubu/LabubuOpenModalDesktop.js
import React, { useEffect, useState } from "react";
import "./LabubuOpenModal.css";
import { safeResolve, preload } from "../../utils/cardAssets";

export default function LabubuOpenModalDesktop({ drop = null, onClose = () => {} }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const resolved = await safeResolve(drop?.asset);
      preload(resolved);
      if (alive) setUrl(resolved);
    })();
    return () => { alive = false; };
  }, [drop?.asset]);

  const rarityLabel =
    drop?.rarity === "legendaryHidden" ? "Legendary" :
    drop?.rarity === "rare" ? "Rare" : "Common";

  const handleShare = async () => {
    const shareData = {
      title: `Mylasa • ${drop?.name || "Card"}`,
      text: `${drop?.name || "Card"} — ${rarityLabel}`,
      url: typeof window !== "undefined" ? window.location.href : "",
    };
    if (navigator?.share) { try { await navigator.share(shareData); } catch {} }
  };

  return (
    <div className="labubu-modal" role="dialog" aria-modal="true" aria-label="Labubu Card Result">
      <div className="labubu-header">
        <div className="labubu-title">Kutudan çıkan kart</div>
        <button className="labubu-close" onClick={onClose} aria-label="Kapat">×</button>
      </div>

      <div className="labubu-body">
        <div className="card-frame" aria-live="polite">
          {url ? (
            <img src={url} alt={drop?.name || "Card"} />
          ) : (
            <img src={"/cards/_SILHOUETTE.jpg"} alt="placeholder" />
          )}
          <div className="card-name">{drop?.name || "UNKNOWN"}</div>
        </div>

        <div className="card-meta">
          <span className="badge">Rarity: {rarityLabel}</span>
          {drop?.dupe ? <span className="badge">Dupe +1</span> : null}
        </div>

        <div className="actions">
          <button className="btn" onClick={handleShare}>Paylaş</button>
          <button className="btn primary" onClick={onClose}>Tamam</button>
        </div>
      </div>
    </div>
  );
}
