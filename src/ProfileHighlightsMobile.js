import React from "react";
import "./ProfileHighlightsMobile.css";

/** IG mobil “Öne Çıkanlar” */
export default function ProfileHighlightsMobile({
  items = [],
  onAdd = () => {},
  onOpen = () => {},
  username = "",
}) {
  const list = Array.isArray(items) ? items : [];

  return (
    <section className="hl-row" aria-label={`${username || "profil"} öne çıkanlar`}>
      {/* + Yeni */}
      <button type="button" className="hl-col" onClick={onAdd} aria-label="Yeni öne çıkan">
        <span className="hl-bubble" aria-hidden="true">
          <span style={{ fontSize: 28, lineHeight: 1 }}>+</span>
        </span>
        <span className="hl-label">Yeni</span>
      </button>

      {list.map((it, i) => (
        <button
          key={it.id || i}
          type="button"
          className="hl-col"
          onClick={() => onOpen(it, i)}
          aria-label={`${it.title || "Öne çıkan"} aç`}
          title={it.title || "Öne çıkan"}
        >
          <span className="hl-bubble" aria-hidden="true">
            {it.coverUrl ? (
              <img src={it.coverUrl} alt="" />
            ) : (
              <span style={{ fontWeight: 700 }}>
                {(it.title || "?")[0]}
              </span>
            )}
          </span>
          <span className="hl-label">{it.title || "Öne çıkan"}</span>
        </button>
      ))}
    </section>
  );
}
