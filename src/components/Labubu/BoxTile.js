// src/components/Labubu/BoxTile.jsx
import React, { useRef, useState } from "react";
import "./BoxTile.css";

export default function BoxTile({ count = 0, onOpen = () => {} }) {
  const [opening, setOpening] = useState(false);
  const lastTap = useRef(0);

  const run = async () => {
    if (!count || opening) return;
    setOpening(true);
    try { await onOpen(); } finally { setTimeout(() => setOpening(false), 600); }
  };

  // mobile double-tap
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      run();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  return (
    <button
      type="button"
      className={`labubu-cell labubu-box ${count > 0 ? "ready" : "disabled"} ${opening ? "opening" : ""}`}
      onDoubleClick={run}
      onClick={handleTap}
      title={count > 0 ? "MY BOX • çift tık/dokun: aç" : "Kutu yok"}
      aria-label={count > 0 ? "My Box, açmak için çift tıkla" : "Kutu yok"}
      disabled={!count || opening}
    >
      {count > 1 && <span className="labubu-count">×{count}</span>}

      <div className="box-wrap">
        {/* IMG ile getiriyoruz; public/boxes/mystic-box.png */}
        <img className="box-img" src="/boxes/mystic-box.png" alt="" />
        <div className="box-shadow" />
      </div>
    </button>
  );
}
