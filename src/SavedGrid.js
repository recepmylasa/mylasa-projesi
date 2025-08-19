import React from "react";
import "./SavedGrid.css";

const ClipBadge = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
    <g fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2">
      <path d="M2.001 7.877a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8.246a2 2 0 0 1-2-2h-16a2 2 0 0 1-2-2Z" />
      <path d="m15.945 12.42-4.13 2.383a.5.5 0 0 1-.75-.434v-4.764a.5.5 0 0 1 .75-.434l4.13 2.383a.5.5 0 0 1 0 .868Z" />
    </g>
  </svg>
);

export default function SavedGrid({ items = [], onItemClick }) {
  if (!items || items.length === 0) {
    return (
      <div className="saved-empty">
        <div className="saved-empty-card">
          <div className="saved-empty-lock">🔒</div>
          <h3>Kaydedilenler</h3>
          <p>Kaydettiğin gönderiler burada görünür. Yalnızca sen görebilirsin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="saved-grid">
      {items.map((it) => {
        const type = it.type || "post";
        const thumb = it.mediaUrl || "https://placehold.co/600x600/eeeeee/aaaaaa?text=%20";
        return (
          <button
            key={it.contentId}
            className="saved-tile"
            onClick={() =>
              onItemClick?.({
                id: it.contentId,
                type,
                mediaUrl: it.mediaUrl || null,
                authorId: it.authorId || null,
              })
            }
            aria-label={type === "clip" ? "Kaydedilen klibi aç" : "Kaydedilen gönderiyi aç"}
          >
            <img className="saved-img" src={thumb} alt="" loading="lazy" />
            {type === "clip" && (
              <span className="saved-badge" title="Clip">
                <ClipBadge />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
