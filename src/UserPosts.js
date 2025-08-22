import React, { useMemo, useCallback } from "react";
import "./UserPosts.css";

/* ===== Overlay ikonları ===== */
const StarIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="white">
    <path d="M12 17.27 18.18 21 16.54 13.97 22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
  </svg>
);
const CommentIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2">
    <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" strokeLinejoin="round"/>
  </svg>
);
const EyeIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" strokeWidth="2">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

const ReelsBadge = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
    <g fill="white" stroke="none">
      <path d="M5 6h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" opacity=".3"/>
      <path d="M5 8h14v2H5zM10 6l3 4H9z"/>
      <path d="M10 12l6 3-6 3z"/>
    </g>
  </svg>
);

const isVideoUrl = (url) => !!url && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);

/** mode: 'posts' | 'reels' */
export default function UserPosts({ content, onPostClick, mode = "posts" }) {
  const list = useMemo(() => {
    const arr = Array.isArray(content) ? content : [];
    const map = new Map();
    for (const it of arr) {
      if (!it || !it.id) continue;
      if (!map.has(it.id)) map.set(it.id, it);
    }
    return Array.from(map.values());
  }, [content]);

  const handleOpen = useCallback((it) => {
    if (!it?.id) return;
    onPostClick?.({
      id: it.id,
      type: it.type || (isVideoUrl(it.mediaUrl || it.imageUrl) ? "clip" : "post"),
    });
  }, [onPostClick]);

  if (!Array.isArray(content)) {
    return <div className="user-posts-message"><span>Yükleniyor...</span></div>;
  }
  if (list.length === 0) {
    return (
      <div className="user-posts-message">
        <span className="icon">📷</span>
        <div>Henüz Paylaşım Yok</div>
      </div>
    );
  }

  const containerClass = `user-posts-grid ${mode === "reels" ? "reels-mode" : ""}`;

  return (
    <div className={containerClass} role="list">
      {list.map((item) => {
        const url = item.mediaUrl || item.imageUrl || "";
        if (!url) return null;

        const isClip = item.type === "clip" || isVideoUrl(url);
        const isReelsLayout = mode === "reels";

        return (
          <button
            key={item.id}
            type="button"
            className={`post-grid-item ${isReelsLayout ? "is-clip-9x16" : ""}`}
            onClick={() => handleOpen(item)}
            aria-label="Gönderiyi aç"
            role="listitem"
          >
            {isClip ? (
              <video
                src={url}
                className="post-grid-image"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={url}
                alt={item.aciklama || "gönderi"}
                className="post-grid-image"
                loading="lazy"
              />
            )}

            {isClip && (
              <div className="post-grid-icon-wrapper" aria-hidden="true" title="Reels">
                <ReelsBadge />
              </div>
            )}

            <div className="post-grid-overlay">
              <div className="overlay-stat">
                {isReelsLayout ? <EyeIcon /> : <StarIcon />}
                <span>
                  {isReelsLayout
                    ? (item.izlenme ?? item.views ?? 0)
                    : (item?.rating?.count ?? item?.begenenler?.length ?? 0)}
                </span>
              </div>
              <div className="overlay-stat">
                <CommentIcon />
                <span>{item.yorumlar?.length || 0}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
