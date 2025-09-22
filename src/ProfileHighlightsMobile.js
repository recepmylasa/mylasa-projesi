// src/ProfileHighlightsMobile.jsx
import React from "react";
import "./ProfileHighlightsMobile.css";
import { PlusIcon } from "./icons";

/**
 * Highlights (Öne Çıkanlar) — IG mobil stili
 *
 * Props:
 * - items: [{ id, title, coverUrl }]  // title zorunlu, cover opsiyonel
 * - onAdd: () => void                 // "+ Yeni" tıklaması
 * - onOpen: (item, index) => void     // highlight tıklaması
 * - username: string                  // a11y için
 */
export default function ProfileHighlightsMobile({
  items = [],
  onAdd = () => {},
  onOpen = () => {},
  username = "kullanıcı",
}) {
  const list = Array.isArray(items) ? items : [];

  return (
    <section className="phl" aria-label={`${username} öne çıkanlar`}>
      {/* + Yeni balonu */}
      <button
        type="button"
        className="phl-col"
        aria-label="Yeni öne çıkan oluştur"
        onClick={onAdd}
      >
        <span className="phl-bubble add" aria-hidden="true">
          <PlusIcon size={24} />
        </span>
        <span className="phl-label">Yeni</span>
      </button>

      {/* Öğeler */}
      {list.map((it, idx) => (
        <button
          key={it.id || `${it.title}-${idx}`}
          type="button"
          className="phl-col"
          onClick={() => onOpen(it, idx)}
          aria-label={`${it.title} öne çıkanı aç`}
          title={it.title}
        >
          <span className="phl-bubble" aria-hidden="true">
            {it.coverUrl ? (
              <img src={it.coverUrl} alt="" />
            ) : (
              <span className="phl-placeholder">{(it.title || "?")[0]}</span>
            )}
          </span>
          <span className="phl-label" aria-hidden="false">
            {it.title || "Öne çıkan"}
          </span>
        </button>
      ))}
    </section>
  );
}
