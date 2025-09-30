import React from "react";
import "./Post.css";
import { CommentIcon, ShareIcon, KebabIcon } from "./icons";
import * as Ph from "@phosphor-icons/react";

import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { usePostLogic } from "./hooks/usePostLogic";
import { formatTimeAgo, formatCount } from "./utils";

const PostSkeleton = () => (
  <article className="postDk-article skeleton" aria-busy="true" aria-live="polite">
    <header className="postDk-header">
      <div className="skeleton-avatar" />
      <div className="skeleton-text skeleton-username" />
    </header>
    <div className="skeleton-media" />
    <div className="postDk-content">
      <div className="skeleton-text" />
      <div className="skeleton-text short" />
    </div>
  </article>
);

function Post({ post, aktifKullaniciId, onUserClick, onCommentClick }) {
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
    visibleScore,
    showGold,
    handleDelete,
    handleToggleSave,
    handleShare,
    handleToggleComments,
    handleGoToPost,
    handleRate,
  } = usePostLogic(post, aktifKullaniciId, onCommentClick);

  if (!authorProfile) return <PostSkeleton />;

  const mediaUrl = post.mediaUrl;
  const mediaType = post.mediaType || "image";
  const username = authorProfile?.kullaniciAdi || "bilinmeyen";
  const avatarUrl =
    authorProfile?.profilFoto || "https://placehold.co/32x32/EFEFEF/AAAAAA?text=P";

  const captionText = post?.mesaj || "";
  const CAPTION_LIMIT = 140;
  const needsClamp = captionText.length > CAPTION_LIMIT;
  const captionPreview = needsClamp ? captionText.slice(0, CAPTION_LIMIT).trim() : captionText;

  return (
    <article className="postDk-article">
      <header className="postDk-header">
        <div
          className={`postDk-avatarWrap ${showGold ? "gold" : ""}`}
          onClick={() => onUserClick?.(post.authorId)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" ? onUserClick?.(post.authorId) : null)}
          aria-label={`${username} profilini aç`}
        >
          <img src={avatarUrl} alt={username} className="postDk-avatar" draggable="false" />
          {showGold && <span className="postDk-goldStar" aria-hidden="true">★</span>}
        </div>

        <div className="postDk-userMeta" onClick={() => onUserClick?.(post.authorId)}>
          <span className="postDk-username">{username}</span>
          <span className="postDk-repPill" title="Topluluk puanı">
            <span className="rep-star">★</span>
            <span className="rep-value">{Number(visibleScore).toFixed(1)}</span>
          </span>
        </div>

        <div className="postDk-options" ref={menuRef}>
          <button
            className="postDk-optionsBtn"
            onClick={() => setOptionsOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={optionsOpen}
            aria-controls="post-menu"
          >
            <KebabIcon />
          </button>
          {optionsOpen && (
            <div id="post-menu" className="postDk-optionsMenu" role="menu">
              <button onClick={handleGoToPost} className="option-item" role="menuitem">Gönderiye git</button>
              {isOwner && (
                <button onClick={handleToggleComments} className="option-item" role="menuitem">
                  {post?.yorumlarKapali ? "Yorumları aç" : "Yorumları kapat"}
                </button>
              )}
              {isOwner && (
                <button onClick={handleDelete} className="option-item delete" role="menuitem">Sil</button>
              )}
              <button onClick={() => setOptionsOpen(false)} className="option-item" role="menuitem">Vazgeç</button>
            </div>
          )}
        </div>
      </header>

      <div className="postDk-media">
        {!isMediaLoaded && <div className="media-placeholder skeleton-media" aria-hidden="true" />}
        {mediaUrl && (mediaType.startsWith("image") ? (
          <img
            src={mediaUrl}
            alt="Gönderi görseli"
            className={`postDk-image ${isMediaLoaded ? "loaded" : ""}`}
            onLoad={() => setIsMediaLoaded(true)}
            onClick={() => onCommentClick?.(post)}
            draggable="false"
            loading="lazy"
          />
        ) : (
          <video
            src={mediaUrl}
            controls
            className={`postDk-video ${isMediaLoaded ? "loaded" : ""}`}
            onCanPlay={() => setIsMediaLoaded(true)}
            onClick={() => onCommentClick?.(post)}
            playsInline
          />
        ))}
      </div>

      <div className="postDk-content">
        <div className="postDk-actions">
          <div className="postDk-starWrap">
            <StarRatingV2 className="postDk-actionBtn" size={28} onRate={handleRate} />
            {agg?.avg > 0 && agg?.count > 0 && (
              <span className="postDk-starMeta" aria-label="Bu gönderinin puanı">
                {Number(agg.avg).toFixed(1)} ★ · {formatCount(agg.count)} oy
              </span>
            )}
          </div>

          <button
            onClick={() => onCommentClick?.(post)}
            className="postDk-actionBtn"
            aria-label="Yorumlar"
            title="Yorumlar"
          >
            <CommentIcon size={28} weight="regular" className="postDk-actionIcon" />
          </button>

          <button
            className="postDk-actionBtn"
            onClick={handleShare}
            aria-label="Paylaş"
            title="Paylaş"
          >
            <ShareIcon size={28} weight="regular" className="postDk-actionIcon" />
          </button>

          <button
            onClick={handleToggleSave}
            className="postDk-actionBtn save"
            aria-label={isSaved ? "Kaydedildi" : "Kaydet"}
            title={isSaved ? "Kaydedildi" : "Kaydet"}
          >
            {isSaved ? (
              <Ph.BookmarkSimple size={28} weight="fill" className="postDk-actionIcon" />
            ) : (
              <Ph.BookmarkSimple size={28} weight="regular" className="postDk-actionIcon" />
            )}
          </button>
        </div>

        {post?.yorumlarKapali && <div className="comments-locked">Yorumlar kapalı</div>}

        {captionText && (
          <p className="postDk-caption">
            <strong onClick={() => onUserClick?.(post.authorId)}>{username}</strong>
            <span> {showFullCaption ? captionText : captionPreview}</span>
            {needsClamp && !showFullCaption && (
              <>
                <span>… </span>
                <button className="postDk-moreBtn" onClick={() => setShowFullCaption(true)} aria-label="Devamını göster">
                  devamı
                </button>
              </>
            )}
          </p>
        )}

        {post?.yorumlar?.length > 0 && (
          <button className="postDk-commentsLink" onClick={() => onCommentClick?.(post)}>
            Tüm {post.yorumlar.length} yorumu gör
          </button>
        )}

        <p className="postDk-date">{formatTimeAgo(post?.tarih)}</p>
      </div>
    </article>
  );
}
export default Post;
