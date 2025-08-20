import React, { useState, useEffect, useRef } from "react";
import { db, storage, auth } from "./firebase";
import { doc, onSnapshot, deleteDoc } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import "./PostMobile.css";

import { BsChat, BsBookmark, BsBookmarkFill, BsThreeDots } from "react-icons/bs";
import { FiSend } from "react-icons/fi";

import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { ensureContentDoc, rateContent as sendRating } from "./reputationClient";
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from "./savesClient";

/* ----------------- UTIL ----------------- */
const formatTimeAgo = (timestamp) => {
  if (!timestamp || typeof timestamp.seconds !== "number") return "";
  const now = new Date();
  const postDate = new Date(timestamp.seconds * 1000);
  const secondsPast = (now.getTime() - postDate.getTime()) / 1000;
  if (secondsPast < 60) return `${Math.round(secondsPast)} saniye önce`;
  if (secondsPast < 3600) return `${Math.floor(secondsPast / 60)} dakika önce`;
  if (secondsPast <= 86400) return `${Math.floor(secondsPast / 3600)} saat önce`;
  if (secondsPast > 604800)
    return postDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const days = Math.floor(secondsPast / 86400);
  return `${days} gün önce`;
};

const formatCount = (n) => {
  if (typeof n !== "number") return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + "M";
  return (n / 1_000_000_000).toFixed(1) + "B";
};

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
  const [authorProfile, setAuthorProfile] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  const [showFullCaption, setShowFullCaption] = useState(false);
  const [agg, setAgg] = useState(null);

  const menuRef = useRef(null);

  useEffect(() => {
    if (!post?.authorId) return;
    const userRef = doc(db, "users", post.authorId);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      setAuthorProfile(docSnap.exists() ? docSnap.data() : null);
    });
    return () => unsubscribe();
  }, [post?.authorId]);

  useEffect(() => {
    if (!post?.id) return;
    const contentRef = doc(db, "content", post.id);
    const unsub = onSnapshot(contentRef, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      setAgg(d?.agg || null);
    });
    return () => unsub();
  }, [post?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await fsIsSaved(post?.id);
      if (!cancelled) setIsSaved(saved);
    })();
    return () => { cancelled = true; };
  }, [post?.id]);

  useEffect(() => {
    if (!optionsOpen) return;
    const onDown = (e) => { if (e.key === "Escape") setOptionsOpen(false); };
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOptionsOpen(false); };
    const onScroll = () => setOptionsOpen(false);
    document.addEventListener("keydown", onDown);
    document.addEventListener("click", onClick);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("keydown", onDown);
      document.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScroll);
    };
  }, [optionsOpen]);

  const handleDelete = async () => {
    if (!window.confirm("Bu gönderiyi silmek istediğinizden emin misiniz?")) return;
    try {
      if (post?.mediaStoragePath) await deleteObject(ref(storage, post.mediaStoragePath));
      await deleteDoc(doc(db, "posts", post.id));
    } catch (error) {
      console.error("Gönderi silinirken hata oluştu:", error);
    }
  };

  const handleToggleSave = async () => {
    setIsSaved((s) => !s);
    try {
      const { saved } = await fsToggleSave({
        contentId: post.id,
        type: "post",
        authorId: post.authorId,
        mediaUrl: post.mediaUrl,
        caption: post.mesaj || "",
      });
      setIsSaved(saved);
    } catch (e) {
      setIsSaved((s) => !s);
      console.error("Kaydet sırasında hata:", e);
    }
  };

  if (!authorProfile) return <MobileSkeleton />;

  const mediaUrl = post.mediaUrl;
  const mediaType = post.mediaType || "image";
  const username = authorProfile?.kullaniciAdi || "bilinmeyen";
  const avatarUrl = authorProfile?.profilFoto || "https://placehold.co/40x40/EFEFEF/AAAAAA?text=P";

  const rep = authorProfile?.reputation || {};
  const badges = authorProfile?.badges || {};
  const visibleScore = typeof rep?.visible === "number" ? rep.visible : rep?.visible ? Number(rep.visible) : 0;
  const sample = typeof rep?.sample === "number" ? rep.sample : rep?.sample ? Number(rep.sample) : 0;
  const showGold = badges?.gold === true || (visibleScore >= 4.5 && sample >= 1000);

  const isOwner = post?.authorId === aktifKullaniciId;

  const handleRate = async (value) => {
    const user = auth.currentUser;
    if (!user || !post?.id || !post?.authorId) return;
    await ensureContentDoc(post.id, post.authorId, "post");
    await sendRating({ contentId: post.id, authorId: post.authorId, value, type: "post" });
  };

  const captionText = post?.mesaj || "";
  const CAPTION_LIMIT = 120;
  const needsClamp = captionText.length > CAPTION_LIMIT;
  const captionPreview = needsClamp ? captionText.slice(0, CAPTION_LIMIT).trim() : captionText;

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
          <span className="m-post-username" title={username}>{username}</span>
          <span className="m-rep-pill" title="Topluluk puanı">
            <span className="m-rep-star">★</span>
            <span className="m-rep-value">{visibleScore.toFixed(1)}</span>
          </span>
        </div>

        <div className="m-post-options" ref={menuRef}>
          <button className="m-post-options-btn" onClick={() => setOptionsOpen((v) => !v)} aria-haspopup="menu" aria-expanded={optionsOpen}>
            <BsThreeDots />
          </button>
          {optionsOpen && (
            <div className="m-post-options-menu" role="menu">
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
            <StarRatingV2 size={32} readOnly={isOwner} onRate={handleRate} />
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

          <button className="m-action-btn" aria-label="Paylaş" title="Paylaş">
            <FiSend className="m-action-icon" />
          </button>

          <button
            onClick={handleToggleSave}
            className="m-action-btn save"
            aria-label={isSaved ? "Kaydedildi" : "Kaydet"}
            title={isSaved ? "Kaydedildi" : "Kaydet"}
          >
            {isSaved ? <BsBookmarkFill className="m-action-icon" /> : <BsBookmark className="m-action-icon" />}
          </button>
        </div>

        {/* Yorumlar kapalı bandı */}
        {post?.yorumlarKapali && <div className="m-comments-locked">Yorumlar kapalı</div>}

        {captionText && (
          <p className="m-post-caption">
            <strong onClick={() => onUserClick?.(post.authorId)}>{username}</strong>
            <span> {showFullCaption ? captionText : captionPreview}</span>
            {needsClamp && !showFullCaption && (
              <>
                <span>… </span>
                <button className="m-more-btn" onClick={() => setShowFullCaption(true)} aria-label="Devamını göster">
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
