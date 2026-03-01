// FILE: src/ProfileHighlightsMobile.js
import React from "react";
import "./ProfileHighlightsMobile.css";

/** IG mobil “Öne Çıkanlar”
 *
 * ARGE7 — EMİR PAKETİ 2/3:
 * - Soldaki “+ / Yeni” tile KALDIRILDI.
 * - Highlights boşsa: return null (bölüm tamamen görünmez).
 * - Highlights doluysa: sadece highlight’lar görünür.
 */
export default function ProfileHighlightsMobile({
  items = [],
  onAdd = () => {}, // (kaldırmadık; upstream prop uyumu için)
  onOpen = () => {},
  username = "",
}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];

  // ✅ Seçenek A: boşsa tamamen gizle
  if (!list.length) return null;

  return (
    <section className="hl-row" aria-label={`${username || "profil"} öne çıkanlar`}>
      {list.map((it, i) => (
        <button
          key={it?.id || i}
          type="button"
          className="hl-col"
          onClick={() => onOpen(it, i)}
          aria-label={`${it?.title || "Öne çıkan"} aç`}
          title={it?.title || "Öne çıkan"}
        >
          <span className="hl-bubble" aria-hidden="true">
            {it?.coverUrl ? (
              <img src={it.coverUrl} alt="" />
            ) : (
              <span style={{ fontWeight: 700 }}>{((it?.title || "?").toString() || "?")[0]}</span>
            )}
          </span>
          <span className="hl-label">{it?.title || "Öne çıkan"}</span>
        </button>
      ))}
    </section>
  );
}