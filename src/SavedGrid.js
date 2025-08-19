import React from 'react';
import './Profile.css';

function SavedGrid({ items = [], onOpen }) {
  if (!items || items.length === 0) {
    return (
      <div className="saved-empty">
        <div className="saved-note">🔒 Kaydedilenler — yalnızca sen görebilirsin</div>
        <p>Henüz kaydedilmiş içerik yok.</p>
      </div>
    );
  }

  return (
    <>
      <div className="saved-note">🔒 Kaydedilenler — yalnızca sen görebilirsin</div>
      <div className="saved-grid">
        {items.map((it) => (
          <button
            key={it.id}
            className="saved-item"
            onClick={() => onOpen?.({ id: it.id, type: it.type, mediaUrl: it.mediaUrl, authorId: it.authorId })}
            aria-label="Kaydedilen içeriği aç"
            title="Kaydedilen içeriği aç"
          >
            {/* Görsel/Video önizleme */}
            {it.mediaUrl ? (
              <img src={it.mediaUrl} alt="" loading="lazy" />
            ) : (
              <div className="saved-placeholder" />
            )}

            {/* Reels/Clip için oynat simgesi */}
            {it.type === 'clip' && (
              <span className="saved-play">&#9658;</span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}

export default SavedGrid;
