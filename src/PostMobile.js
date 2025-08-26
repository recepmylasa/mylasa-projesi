import React from "react";
import "./PostMobile.css";
import { BsChat, BsBookmark, BsBookmarkFill, BsThreeDots } from "react-icons/bs";
import { FiSend } from "react-icons/fi";

import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { usePostLogic } from "./hooks/usePostLogic";
import { formatTimeAgo, formatCount } from "./utils";

/* --------------- SKELETON --------------- */
const MobileSkeleton = () => (
  <article className="m-post-article skeleton" aria-busy="true" aria-live="polite">
    <header className="m-post-header">
      <div className="m-skeleton-avatar" />
      <div className="m-skeleton-text m-skeleton-username" />
    </header>
    <div className="m-skeleton-media" />
    <div className="m-post-content">
      <div className="m-skeleton-text" />
      <div className="m-skeleton-text short" />
    </div>
  </article>
);

function PostMobile({ post, aktifKullaniciId, onUserClick, onCommentClick }) {
  const {
    authorProfile,
    isSaved,
    optionsOpen,
    setOptionsOpen,
    isMediaLoaded,
    setIsMediaLoaded,
    showFullCaption,
    setShowFullCaption,
    agg,
    menuRef,
    isOwner,
    hasRated,
    isRating,
    visibleScore,
    showGold,
    handleDelete,
    handleToggleSave,
    handleShare,
    handleToggleComments,
    handleGoToPost,
    handleRate,
  } = usePostLogic(post, aktifKullaniciId, onCommentClick);

  if (!authorProfile) return <MobileSkeleton />;

  const mediaUrl = post.mediaUrl;
  const mediaType = post.mediaType || "image";
  const username = authorProfile?.kullaniciAdi || "bilinmeyen";
  const avatarUrl =
    authorProfile?.profilFoto || "https://placehold.co/40x40/EFEFEF/AAAAAA?text=P";

  const captionText = post?.mesaj || "";
  const CAPTION_LIMIT = 120;
  const needsClamp = captionText.length > CAPTION_LIMIT;
  const captionPreview = needsClamp
    ? captionText.slice(0, CAPTION_LIMIT).trim()
    : captionText;

  return (
    <article className="m-post-article">
      <header className="m-post-header">
        <div
          className={`m-avatar-wrap ${showGold ? "gold" : ""}`}
          onClick={() => onUserClick?.(post.authorId)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" ? onUserClick?.(post.authorId) : null)}
          aria-label={`${username} profilini aç`}
        >
          <img src={avatarUrl} alt={username} className="m-post-avatar" draggable="false" />
          {showGold && <span className="m-gold-star" aria-hidden="true">★</span>}
        </div>

        <div className="m-user-meta" onClick={() => onUserClick?.(post.authorId)}>
          <span className="m-post-username" title={username}>
            {username}
          </span>
          <span className="m-rep-pill" title="Topluluk puanı">
            <span className="m-rep-star">★</span>
            <span className="m-rep-value">{Number(visibleScore).toFixed(1)}</span>
          </span>
        </div>

        <div className="m-post-options" ref={menuRef}>
          <button
            className="m-post-options-btn"
            onClick={() => setOptionsOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={optionsOpen}
          >
            <BsThreeDots />
          </button>
          {optionsOpen && (
            <div className="m-post-options-menu" role="menu">
              <button onClick={handleGoToPost} className="m-option-item" role="menuitem">
                Gönderiye git
              </button>
              {isOwner && (
                <button onClick={handleToggleComments} className="m-option-item" role="menuitem">
                  {post?.yorumlarKapali ? "Yorumları aç" : "Yorumları kapat"}
                </button>
              )}
              {isOwner && (
                <button onClick={handleDelete} className="m-option-item delete" role="menuitem">
                  Sil
                </button>
              )}
              <button onClick={() => setOptionsOpen(false)} className="m-option-item" role="menuitem">
                Vazgeç
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="m-post-media">
        {!isMediaLoaded && <div className="m-media-placeholder skeleton" aria-hidden="true" />}
        {mediaUrl &&
          (mediaType.startsWith("image") ? (
            <img
              src={mediaUrl}
              alt="Gönderi görseli"
              className={`m-post-image ${isMediaLoaded ? "loaded" : ""}`}
              onLoad={() => setIsMediaLoaded(true)}
              draggable="false"
              loading="lazy"
            />
          ) : (
            <video
              src={mediaUrl}
              controls
              className={`m-post-video ${isMediaLoaded ? "loaded" : ""}`}
              onCanPlay={() => setIsMediaLoaded(true)}
              playsInline
            />
          ))}
      </div>

      <div className="m-post-content">
        <div className="m-post-actions">
          <div className="m-star-wrap">
            <StarRatingV2
              size={32}
              disabled={isOwner || hasRated || isRating}
              onRate={handleRate}
            />
            {agg?.avg > 0 && agg?.count > 0 && (
              <span className="m-star-meta" aria-label="Bu gönderinin puanı">
                {Number(agg.avg).toFixed(1)} ★ · {formatCount(agg.count)} oy
              </span>
            )}
          </div>

          <button
            onClick={() => onCommentClick?.(post)}
            className="m-action-btn"
            aria-label="Yorumlar"
            title="Yorumlar"
          >
            <BsChat className="m-action-icon" />
          </button>

          <button
            className="m-action-btn"
            onClick={handleShare}
            aria-label="Paylaş"
            title="Paylaş"
          >
            <FiSend className="m-action-icon" />
          </button>

          <button
            onClick={handleToggleSave}
            className="m-action-btn save"
            aria-label={isSaved ? "Kaydedildi" : "Kaydet"}
            title={isSaved ? "Kaydedildi" : "Kaydet"}
          >
            {isSaved ? (
              <BsBookmarkFill className="m-action-icon" />
            ) : (
              <BsBookmark className="m-action-icon" />
            )}
          </button>
        </div>

        {post?.yorumlarKapali && <div className="m-comments-locked">Yorumlar kapalı</div>}

        {captionText && (
          <p className="m-post-caption">
            <strong onClick={() => onUserClick?.(post.authorId)}>{username}</strong>
            <span> {showFullCaption ? captionText : captionPreview}</span>
            {needsClamp && !showFullCaption && (
              <>
                <span>… </span>
                <button
                  className="m-more-btn"
                  onClick={() => setShowFullCaption(true)}
                  aria-label="Devamını göster"
                >
                  devamı
                </button>
              </>
            )}
          </p>
        )}

        {post?.yorumlar?.length > 0 && (
          <button className="m-post-comments-link" onClick={() => onCommentClick?.(post)}>
            Tüm {post.yorumlar.length} yorumu gör
          </button>
        )}

        <p className="m-post-date">{formatTimeAgo(post?.tarih)}</p>
      </div>
    </article>
  );
}

export default PostMobile;
