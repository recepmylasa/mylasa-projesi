import React, { useRef } from "react";
import "./BoxTile.css";

/**
 * Kutuyu gösteren hücre
 * - count > 0 ise sağ üstte rozet görünür ve çift tık/çift dokun ile açılır.
 * - count == 0 olsa da kutu hep “nefes alır”; sadece rozet çıkmaz.
 */
export default function BoxTile({ count = 0, onOpen = () => {} }) {
  const lastTapRef = useRef(0);
  const ready = count > 0;

  const handleDoubleClick = () => {
    if (ready) onOpen();
  };

  // Mobil “double tap”
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      handleDoubleClick();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <button
      type="button"
      className={`labubu-cell labubu-cell--box breathing ${ready ? "ready" : ""}`}
      onDoubleClick={handleDoubleClick}
      onClick={handleTap}
      title={ready ? "Çift tıkla: Kutuyu aç" : "Kutu"}
      aria-label={ready ? "Kutu: açılmaya hazır" : "Kutu"}
    >
      {/* Bildirim rozeti (yalnızca hazırsa) */}
      {ready && <span className="labubu-box-badge">{count}</span>}

      {/* Görsel */}
      <img
        className="labubu-box-img"
        src="/boxes/mystic-box.png"
        alt="MyBox"
        draggable={false}
      />

      {/* Hafif gölge */}
      <span className="labubu-box-shadow" aria-hidden="true" />
    </button>
  );
}
