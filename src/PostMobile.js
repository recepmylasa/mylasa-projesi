import React from "react";
import "./PostMobile.css";

import { CommentIcon, ShareIcon, SaveIcon, KebabIcon } from "./icons";
import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { usePostLogic } from "./hooks/usePostLogic";
import { formatTimeAgo, formatCount } from "./utils";

/** Mobil ana akış gönderi kartı */
export default function PostMobile({ post, aktifKullaniciId, onUserClick, onCommentClick }) {
  const {
    authorProfile,
    isSaved,
    optionsOpen,
    setOptionsOpen,
    isMediaLoaded,
    setIsMediaLoaded,
    agg,
    menuRef,
    isOwner,
    handleDelete,
    handleToggleSave,
    handleShare,
    handleToggleComments,
    handleGoToPost,
    handleRate,
  } = usePostLogic(post, aktifKullaniciId, onCommentClick);

  if (!authorProfile) {
    return (
      <article className="pm-article skeleton" aria-busy="true">
        <header className="pm-header">
          <div className="skel-avatar" />
          <div className="skel-line w80" />
        </header>
        <div className="skel-media" />
      </article>
    );
  }

  const username = authorProfile?.kullaniciAdi || "kullanıcı";
  const avatarUrl = authorProfile?.profilFoto || "/avatars/default.png";

  const mediaUrl = post?.mediaUrl || "";
  const isVideo = (post?.mediaType || "").startsWith("video");

  const yorumAdet = Array.isArray(post?.yorumlar) ? post.yorumlar.length : (post?.commentsCount || 0);
  const paylasAdet = post?.sharesCount || (Array.isArray(post?.paylasimlar) ? post.paylasimlar.length : 0);

  return (
    <article className="pm-article">
      <header className="pm-header">
        <button
          className="pm-user"
          onClick={() => onUserClick?.(post.authorId)}
          aria-label={`${username} profilini aç`}
        >
          <img src={avatarUrl} alt="" className="pm-avatar" />
          <span className="pm-username">{username}</span>
        </button>

        <div className="pm-more" ref={menuRef}>
          <button
            className="pm-kebab"
            onClick={() => setOptionsOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={!!optionsOpen}
          >
            <KebabIcon />
          </button>

          {optionsOpen && (
            <div className="pm-menu" role="menu">
              <button className="pm-menu-item" onClick={handleGoToPost} role="menuitem">Gönderiye git</button>
              {isOwner && (
                <button className="pm-menu-item" onClick={handleToggleComments} role="menuitem">
                  {post?.yorumlarKapali ? "Yorumları aç" : "Yorumları kapat"}
                </button>
              )}
              {isOwner && (
                <button className="pm-menu-item danger" onClick={handleDelete} role="menuitem">Sil</button>
              )}
              <button className="pm-menu-item" onClick={() => setOptionsOpen(false)} role="menuitem">Vazgeç</button>
            </div>
          )}
        </div>
      </header>

      <div className="pm-media">
        {!isMediaLoaded && <div className="skel-media" aria-hidden="true" />}
        {mediaUrl &&
          (isVideo ? (
            <video
              className={`pm-media-el ${isMediaLoaded ? "loaded" : ""}`}
              src={mediaUrl}
              controls
              playsInline
              onCanPlay={() => setIsMediaLoaded(true)}
              onClick={() => onCommentClick?.(post)}
            />
          ) : (
            <img
              className={`pm-media-el ${isMediaLoaded ? "loaded" : ""}`}
              src={mediaUrl}
              alt="Gönderi görseli"
              loading="lazy"
              decoding="async"
              draggable="false"
              onLoad={() => setIsMediaLoaded(true)}
              onClick={() => onCommentClick?.(post)}
            />
          ))}
      </div>

      <div className="pm-actions">
        <div className="pm-actions-left">
          <div className="pm-act">
            <StarRatingV2 className="pm-btn" size={28} onRate={handleRate} />
          </div>

          <div className="pm-act">
            <button className="pm-btn" onClick={() => onCommentClick?.(post)} aria-label="Yorumlar">
              <CommentIcon size={28} weight="regular" />
            </button>
            {yorumAdet > 0 && <span className="pm-num">{formatCount(yorumAdet)}</span>}
          </div>

          <div className="pm-act">
            <button className="pm-btn" onClick={handleShare} aria-label="Paylaş">
              <ShareIcon size={28} weight="regular" />
            </button>
            {paylasAdet > 0 && <span className="pm-num">{formatCount(paylasAdet)}</span>}
          </div>
        </div>

        <div className="pm-act">
          <button
            className="pm-btn"
            onClick={handleToggleSave}
            aria-label={isSaved ? "Kaydedildi" : "Kaydet"}
          >
            <SaveIcon size={28} active={isSaved} weight="regular" />
          </button>
        </div>
      </div>

      <div className="pm-footer">
        {post?.mesaj && (
          <p className="pm-caption">
            <strong className="pm-cap-user" onClick={() => onUserClick?.(post.authorId)}>{username}</strong>{" "}
            <span>{post.mesaj}</span>
          </p>
        )}
        <time className="pm-time" dateTime={String(post?.tarih || "")}>
          {formatTimeAgo(post?.tarih)}
        </time>
      </div>
    </article>
  );
}
