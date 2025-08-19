import React, { useState, useEffect, useRef } from 'react';
import { db, storage, auth } from './firebase';
import { doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import './Post.css';

import { BsChat, BsBookmark, BsBookmarkFill, BsThreeDots } from 'react-icons/bs';
import { FiSend } from 'react-icons/fi';

import StarRatingV2 from './components/StarRatingV2/StarRatingV2';
import { ensureContentDoc, rateContent as sendRating } from './reputationClient';
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from './savesClient';

/* ----------------- UTIL ----------------- */
const formatTimeAgo = (timestamp) => {
  if (!timestamp || typeof timestamp.seconds !== 'number') return '';
  const now = new Date();
  const postDate = new Date(timestamp.seconds * 1000);
  const secondsPast = (now.getTime() - postDate.getTime()) / 1000;
  if (secondsPast < 60) return `${Math.round(secondsPast)} saniye önce`;
  if (secondsPast < 3600) return `${Math.floor(secondsPast / 60)} dakika önce`;
  if (secondsPast <= 86400) return `${Math.floor(secondsPast / 3600)} saat önce`;
  if (secondsPast > 604800)
    return postDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const days = Math.floor(secondsPast / 86400);
  return `${days} gün önce`;
};

const formatCount = (n) => {
  if (typeof n !== 'number') return '';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + 'K';
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + 'M';
  return (n / 1_000_000_000).toFixed(1) + 'B';
};

const buildPermalink = (id, type = 'post') => {
  const origin = window.location.origin;
  // IG benzeri: /p/:id — (type gerekirse query’e eklenir)
  return `${origin}/p/${id}${type && type !== 'post' ? `?type=${encodeURIComponent(type)}` : ''}`;
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    alert('Bağlantı kopyalandı');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      alert('Bağlantı kopyalandı');
    } finally {
      document.body.removeChild(ta);
    }
  }
};

/* --------------- SKELETON --------------- */
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
  const [authorProfile, setAuthorProfile] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  const [showFullCaption, setShowFullCaption] = useState(false);
  const [agg, setAgg] = useState(null);

  const menuRef = useRef(null);

  /* Yazar profili dinle */
  useEffect(() => {
    if (!post?.authorId) return;
    const userRef = doc(db, 'users', post.authorId);
    const unsub = onSnapshot(userRef, (docSnap) => setAuthorProfile(docSnap.exists() ? docSnap.data() : null));
    return () => unsub();
  }, [post?.authorId]);

  /* İçerik agg dinle */
  useEffect(() => {
    if (!post?.id) return;
    const contentRef = doc(db, 'content', post.id);
    const unsub = onSnapshot(contentRef, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      setAgg(d?.agg || null);
    });
    return () => unsub();
  }, [post?.id]);

  /* Kaydet durumunu oku */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await fsIsSaved(post?.id);
      if (!cancelled) setIsSaved(saved);
    })();
    return () => { cancelled = true; };
  }, [post?.id]);

  /* Menü: dışarısı tık / ESC / scroll ile kapanır */
  useEffect(() => {
    if (!optionsOpen) return;
    const onDown = (e) => { if (e.key === 'Escape') setOptionsOpen(false); };
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOptionsOpen(false); };
    const onScroll = () => setOptionsOpen(false);
    document.addEventListener('keydown', onDown);
    document.addEventListener('click', onClick);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll);
    };
  }, [optionsOpen]);

  const handleDelete = async () => {
    if (!window.confirm('Bu gönderiyi silmek istediğinizden emin misiniz?')) return;
    try {
      if (post.mediaStoragePath) await deleteObject(ref(storage, post.mediaStoragePath));
      await deleteDoc(doc(db, 'posts', post.id));
    } catch (error) {
      console.error('Gönderi silinirken hata oluştu:', error);
    }
  };

  const handleToggleSave = async () => {
    // iyimser
    setIsSaved((s) => !s);
    try {
      const { saved } = await fsToggleSave({
        contentId: post.id,
        type: post.type || 'post',
        authorId: post.authorId,
        mediaUrl: post.mediaUrl,
        caption: post.mesaj || '',
      });
      setIsSaved(saved);
    } catch (e) {
      setIsSaved((s) => !s);
      console.error('Kaydet sırasında hata:', e);
    }
  };

  const handleShare = async () => {
    const url = buildPermalink(post.id, post.type || 'post');
    const data = {
      title: 'Gönderi',
      text: post?.mesaj ? String(post.mesaj).slice(0, 120) : '',
      url
    };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch { /* user cancel */ }
    }
    await copyToClipboard(url);
  };

  const handleCopyLink = async () => {
    const url = buildPermalink(post.id, post.type || 'post');
    await copyToClipboard(url);
  };

  const openInModal = () => {
    onCommentClick?.(post); // IG “Gönderiye git”e benzer davranış (route’suz modal)
  };

  if (!authorProfile) return <PostSkeleton />;

  const mediaUrl = post.mediaUrl;
  const mediaType = post.mediaType || 'image';
  const username = authorProfile?.kullaniciAdi || 'bilinmeyen';
  const avatarUrl = authorProfile?.profilFoto || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P';

  /* REP / GOLD */
  const rep = authorProfile?.reputation || {};
  const badges = authorProfile?.badges || {};
  const visibleScore = typeof rep?.visible === 'number' ? rep.visible : (rep?.visible ? Number(rep.visible) : 0);
  const sample = typeof rep?.sample === 'number' ? rep.sample : (rep?.sample ? Number(rep.sample) : 0);
  const showGold = badges?.gold === true || (visibleScore >= 4.5 && sample >= 1000);

  const handleRate = async (value) => {
    const user = auth.currentUser;
    if (!user || !post?.id || !post?.authorId) return;
    await ensureContentDoc(post.id, post.authorId, 'post');
    await sendRating({ contentId: post.id, authorId: post.authorId, value, type: 'post' });
  };

  const isOwner = post?.authorId === aktifKullaniciId;

  /* Caption kırpma */
  const captionText = post?.mesaj || '';
  const CAPTION_LIMIT = 140;
  const needsClamp = captionText.length > CAPTION_LIMIT;
  const captionPreview = needsClamp ? captionText.slice(0, CAPTION_LIMIT).trim() : captionText;

  return (
    <article className="postDk-article">
      <header className="postDk-header">
        <div
          className={`postDk-avatarWrap ${showGold ? 'gold' : ''}`}
          onClick={() => onUserClick?.(post.authorId)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' ? onUserClick?.(post.authorId) : null)}
          aria-label={`${username} profilini aç`}
        >
          <img src={avatarUrl} alt={username} className="postDk-avatar" draggable="false" />
          {showGold && <span className="postDk-goldStar" aria-hidden="true">★</span>}
        </div>

        <div className="postDk-userMeta" onClick={() => onUserClick?.(post.authorId)}>
          <span className="postDk-username">{username}</span>
          <span className="postDk-repPill" title="Topluluk puanı">
            <span className="rep-star">★</span>
            <span className="rep-value">{visibleScore.toFixed(1)}</span>
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
            <BsThreeDots />
          </button>
          {optionsOpen && (
            <div id="post-menu" className="postDk-optionsMenu" role="menu">
              {/* PAYLAŞ/BAĞLANTI */}
              <button onClick={handleShare} className="option-item" role="menuitem">
                Paylaş…
              </button>
              <button onClick={handleCopyLink} className="option-item" role="menuitem">
                Bağlantıyı kopyala
              </button>
              <button onClick={openInModal} className="option-item" role="menuitem">
                Gönderiyi aç
              </button>

              {/* SAHİP İSE SİL */}
              {isOwner && (
                <button onClick={handleDelete} className="option-item delete" role="menuitem">
                  Sil
                </button>
              )}

              <button onClick={() => setOptionsOpen(false)} className="option-item" role="menuitem">
                Vazgeç
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="postDk-media">
        {!isMediaLoaded && <div className="media-placeholder skeleton-media" aria-hidden="true" />}
        {mediaUrl && (
          mediaType.startsWith('image') ? (
            <img
              src={mediaUrl}
              alt="Gönderi görseli"
              className={`postDk-image ${isMediaLoaded ? 'loaded' : ''}`}
              onLoad={() => setIsMediaLoaded(true)}
              draggable="false"
              loading="lazy"
            />
          ) : (
            <video
              src={mediaUrl}
              controls
              className={`postDk-video ${isMediaLoaded ? 'loaded' : ''}`}
              onCanPlay={() => setIsMediaLoaded(true)}
              playsInline
            />
          )
        )}
      </div>

      <div className="postDk-content">
        <div className="postDk-actions">
          <div className="postDk-starWrap">
            <StarRatingV2 size={28} readOnly={isOwner} onRate={handleRate} />
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
            <BsChat className="postDk-actionIcon" />
          </button>

          <button
            className="postDk-actionBtn"
            aria-label="Paylaş"
            title="Paylaş"
            onClick={handleShare}
          >
            <FiSend className="postDk-actionIcon" />
          </button>

          <button
            onClick={handleToggleSave}
            className="postDk-actionBtn save"
            aria-label={isSaved ? 'Kaydedildi' : 'Kaydet'}
            title={isSaved ? 'Kaydedildi' : 'Kaydet'}
          >
            {isSaved ? <BsBookmarkFill className="postDk-actionIcon" /> : <BsBookmark className="postDk-actionIcon" />}
          </button>
        </div>

        {captionText && (
          <p className="postDk-caption">
            <strong onClick={() => onUserClick?.(post.authorId)}>{username}</strong>
            <span> {showFullCaption ? captionText : captionPreview}</span>
            {needsClamp && !showFullCaption && (
              <>
                <span>… </span>
                <button
                  className="postDk-moreBtn"
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
          <button className="postDk-commentsLink" onClick={() => onCommentClick?.(post)}>
            Tüm {post.yorumlar.length} yorumu gör
          </button>
        )}

        <p className="postDk-date">{formatTimeAgo(post.tarih)}</p>
      </div>
    </article>
  );
}

export default Post;
