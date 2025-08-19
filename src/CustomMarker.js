import React from 'react';
import './CustomMarker.css';

function CustomMarker({ user = {}, onStoryClick, onProfileClick }) {
  // Bitmoji / avatar görseli tercihi (tam boy gösterilecek)
  const bitmojiUrl =
    user.bitmojiUrl ||
    user.avatarUrl ||
    user.profilFoto ||
    'https://placehold.co/80x80/eeeeee/aaaaaa?text=+';

  // 24 saat içinde hikaye var mı? (Map tarafı hasStory atıyor)
  const hasStory = !!user.hasStory;

  return (
    <div className="marker">
      {/* Bitmoji: tam boy, doğal oran, gölge */}
      <img
        src={bitmojiUrl}
        alt={user.kullaniciAdi || 'Konum'}
        className="marker-bitmoji"
        onClick={() => onProfileClick && onProfileClick(user)}
        draggable={false}
      />

      {/* Hikaye rozeti: bitmojinin kafasının üstünde */}
      {hasStory && (
        <button
          type="button"
          className="story-badge"
          aria-label="Hikayeyi görüntüle"
          onClick={(e) => {
            e.stopPropagation();
            onStoryClick && onStoryClick(user);
          }}
        >
          <span className="story-badge-ring">
            <span className="story-badge-inner">
              <img
                src={user.profilFoto || bitmojiUrl}
                alt=""
                className="story-badge-img"
                draggable={false}
              />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

export default CustomMarker;
