import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import './PostDetailModal.css';

// StarRatingV2
import StarRatingV2 from './components/StarRatingV2/StarRatingV2';
import { ensureContentDoc, rateContent as sendRating } from './reputationClient';
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from './savesClient';

// Basit ikonlar (yorum, paylaş, kaydet)
const CommentIcon = () => (
  <svg aria-label="Yorum Yap" height="24" role="img" viewBox="0 0 24 24" width="24">
    <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></path>
  </svg>
);
const ShareIcon = () => (
  <svg aria-label="Gönderiyi Paylaş" height="24" role="img" viewBox="0 0 24 24" width="24">
    <line fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" x1="22" x2="11" y1="2" y2="13"></line>
    <polygon fill="none" points="22 2 15 22 11 13 2 9 22 2" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></polygon>
  </svg>
);
const SaveIcon = ({ isSaved }) => (
  <svg aria-label="Kaydet" height="24" role="img" viewBox="0 0 24 24" width="24">
    <polygon fill={isSaved ? 'currentColor' : 'none'} points="20 21 12 13.44 4 21 4 3 20 3 20 21" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></polygon>
  </svg>
);

// Zaman formatlayıcı
const formatTimeAgo = (ts) => {
  if (!ts) return '';
  const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
};

// 1.2K / 3.4M
const formatCount = (n) => {
  if (typeof n !== 'number') return '';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + 'K';
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + 'M';
  return (n / 1_000_000_000).toFixed(1) + 'B';
};

function PostDetailModal({ post, onClose, onUserClick, aktifKullaniciId }) {
  const [contentData, setContentData] = useState(post);
  const [authorProfile, setAuthorProfile] = useState(null);
  const [yeniYorum, setYeniYorum] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [agg, setAgg] = useState(null); // {avg, count}

  const currentUser = auth.currentUser;

  // Body scroll kilidi + ESC kapatma
  useEffect(() => {
    const onDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
      document.removeEventListener('keydown', onDown);
    };
  }, [onClose]);

  // İçerik canlı takip (post/clip)
  useEffect(() => {
    if (!post || !post.id || !post.type) return;
    const collectionName = post.type === 'clip' ? 'clips' : 'posts';
    const ref = doc(db, collectionName, post.id);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setContentData({ id: snap.id, type: post.type, ...snap.data() });
    });
    return () => unsub();
  }, [post]);

  // Yazar profili
  useEffect(() => {
    if (!contentData?.authorId) return;
    const ref = doc(db, 'users', contentData.authorId);
    const unsub = onSnapshot(ref, (snap) => snap.exists() && setAuthorProfile(snap.data()));
    return () => unsub();
  }, [contentData?.authorId]);

  // Reputation agg (avg & count) – content/{id}
  useEffect(() => {
    if (!contentData?.id) return;
    const ref = doc(db, 'content', contentData.id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      setAgg(d?.agg || null);
    });
    return () => unsub();
  }, [contentData?.id]);

  // Kaydet durumunu oku (auth guard + try/catch)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!contentData?.id || !auth.currentUser) {
        if (!cancelled) setIsSaved(false);
        return;
      }
      try {
        const saved = await fsIsSaved(contentData.id);
        if (!cancelled) setIsSaved(saved);
      } catch (e) {
        console.error('Kaydet durumu okunamadı:', e);
        if (!cancelled) setIsSaved(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contentData?.id]);

  // Yorum gönder
  const handleYorumGonder = async (e) => {
    e.preventDefault();
    if (!yeniYorum.trim() || !currentUser || !contentData) return;
    setIsSubmitting(true);
    try {
      const coll = contentData.type === 'clip' ? 'clips' : 'posts';
      const ref = doc(db, coll, contentData.id);
      const yorum = {
        text: yeniYorum,
        username: currentUser.displayName,
        userId: currentUser.uid,
        photoURL: currentUser.photoURL,
        timestamp: new Date().toISOString(),
        likes: [],
      };
      await updateDoc(ref, { yorumlar: arrayUnion(yorum) });
      setYeniYorum('');
    } catch (err) {
      console.error('Yorum eklenirken hata:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Yıldız oylama
  const handleRate = async (value) => {
    if (!contentData?.id || !contentData?.authorId) return;
    const type = contentData.type === 'clip' ? 'clip' : 'post';
    await ensureContentDoc(contentData.id, contentData.authorId, type);
    await sendRating({
      contentId: contentData.id,
      authorId: contentData.authorId,
      value,
      type,
    });
  };

  // Kaydet toggle (auth guard + busy kilidi + iyimser güncelleme)
  const handleToggleSave = async () => {
    if (saveBusy) return;
    if (!auth.currentUser || !contentData?.id) return;
    setSaveBusy(true);
    setIsSaved((s) => !s);
    try {
      const { saved } = await fsToggleSave({
        contentId: contentData.id,
        type: contentData.type,
        authorId: contentData.authorId,
        mediaUrl: contentData.mediaUrl,
        caption: contentData.aciklama || contentData.mesaj || '',
      });
      setIsSaved(saved);
    } catch (e) {
      setIsSaved((s) => !s);
      console.error('Kaydet sırasında hata:', e);
    } finally {
      setSaveBusy(false);
    }
  };

  if (!contentData) {
    return (
      <div className="pdm-overlay" onClick={onClose}>
        <div className="pdm-content" onClick={(e) => e.stopPropagation()} />
      </div>
    );
  }

  const aciklama = contentData?.aciklama || contentData?.mesaj;
  const yorumlar = contentData?.yorumlar
    ? [...contentData.yorumlar].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    : [];
  const isOwner = contentData?.authorId === aktifKullaniciId;

  return (
    <div className="pdm-overlay" onClick={onClose}>
      <div className="pdm-content" onClick={(e) => e.stopPropagation()}>
        {/* Medya */}
        <div className="pdm-media">
          {contentData.type === 'clip' ? (
            <video
              src={contentData?.mediaUrl}
              className="pdm-video"
              autoPlay
              controls
              playsInline
            />
          ) : (
            <img src={contentData?.mediaUrl} alt="Gönderi" />
          )}
        </div>

        {/* Bilgi / Yorumlar */}
        <div className="pdm-info">
          <header className="info-header">
            <img
              src={authorProfile?.profilFoto || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'}
              alt={authorProfile?.kullaniciAdi}
              className="info-avatar"
              onClick={() => onUserClick?.(contentData.authorId)}
            />
            <span
              className="info-username"
              onClick={() => onUserClick?.(contentData.authorId)}
            >
              {authorProfile?.kullaniciAdi}
            </span>
          </header>

          <div className="pdm-comments-section">
            {aciklama && (
              <div className="comment-item">
                <img
                  src={authorProfile?.profilFoto || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'}
                  alt={authorProfile?.kullaniciAdi}
                  className="comment-avatar"
                />
                <div className="comment-body">
                  <p>
                    <strong onClick={() => onUserClick?.(contentData.authorId)}>
                      {authorProfile?.kullaniciAdi}
                    </strong>{' '}
                    {aciklama}
                  </p>
                </div>
              </div>
            )}

            {yorumlar.map((y, i) => (
              <div key={i} className="comment-item">
                <img
                  src={y.photoURL || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'}
                  alt={y.username}
                  className="comment-avatar"
                />
                <div className="comment-body">
                  <p>
                    <strong onClick={() => onUserClick?.(y.userId)}>{y.username}</strong>{' '}
                    {y.text}
                  </p>
                  <span className="comment-time">{formatTimeAgo(y.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="pdm-footer">
            <div className="post-actions">
              {/* Kalp YOK → StarRatingV2 */}
              <div className="pdm-starWrap">
                <StarRatingV2 size={28} onRate={handleRate} readOnly={isOwner} />
                {agg?.avg > 0 && agg?.count > 0 && (
                  <span className="pdm-starMeta" aria-label="Bu içeriğin puanı">
                    {Number(agg.avg).toFixed(1)} ★ · {formatCount(agg.count)} oy
                  </span>
                )}
              </div>

              <button className="action-btn" aria-label="Yorumlar">
                <CommentIcon />
              </button>
              <button className="action-btn" aria-label="Paylaş">
                <ShareIcon />
              </button>

              <button
                className="action-btn save"
                aria-label={isSaved ? 'Kaydedildi' : 'Kaydet'}
                onClick={handleToggleSave}
                disabled={saveBusy}
                aria-busy={saveBusy}
              >
                <SaveIcon isSaved={isSaved} />
              </button>
            </div>

            <p className="post-date">{formatTimeAgo(contentData?.tarih)}</p>

            <form onSubmit={handleYorumGonder} className="comment-form">
              <img
                src={currentUser?.photoURL || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'}
                alt="Profil"
                className="comment-form-avatar"
              />
              <input
                type="text"
                value={yeniYorum}
                onChange={(e) => setYeniYorum(e.target.value)}
                placeholder="Yorum ekle..."
              />
              <button type="submit" disabled={!yeniYorum.trim() || isSubmitting}>
                Paylaş
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PostDetailModal;
