import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { db, auth } from './firebase';
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import './PermalinkPage.css';

import StarRatingV2 from './components/StarRatingV2/StarRatingV2';
import { ensureContentDoc, rateContent as sendRating } from './reputationClient';
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from './savesClient';
import { showToast } from './ToastBoot';

/* ----------------- ICONS ----------------- */
const DotsIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <circle cx="5" cy="12" r="2" fill="currentColor" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <circle cx="19" cy="12" r="2" fill="currentColor" />
  </svg>
);

/* ----------------- UTIL ----------------- */
// IG tarzı kısa Türkçe: 45Sn, 3D (dakika), 5S (saat), 10G (gün)
const formatTimeAgoShort = (ts) => {
  if (!ts) return '';
  const date = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}Sn`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}D`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}S`;
  const g = Math.floor(h / 24);
  return `${g}G`;
};
const formatCount = (n) => {
  if (typeof n !== 'number') return '';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + 'K';
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + 'M';
  return (n / 1_000_000_000).toFixed(1) + 'B';
};
const getPathInfo = () => {
  const seg = window.location.pathname.split('/').filter(Boolean);
  if (seg.length !== 2) return null;
  const type = seg[0] === 'c' ? 'clip' : seg[0] === 'p' ? 'post' : null;
  const id = seg[1];
  if (!type || !id) return null;
  return { type, id };
};
const getPermalink = ({ type, id }) => {
  const base = window.location.origin;
  const seg = type === 'clip' ? 'c' : 'p';
  return `${base}/${seg}/${id}`;
};
const makeCommentId = (uid) => `${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/* ----------------- COMMENT ROW ----------------- */
function CommentRow({
  contentId,
  contentType,
  isOwner,
  currentUser,
  comment,
  openMenuId,
  setOpenMenuId,
}) {
  const [rateOpen, setRateOpen] = useState(false);
  const rowRef = useRef(null);

  const avg =
    (Number(comment?.ratingSum || 0) > 0 && Number(comment?.ratingCount || 0) > 0)
      ? Number(comment.ratingSum) / Number(comment.ratingCount)
      : 0;

  const canDelete = currentUser && (comment?.userId === currentUser.uid || isOwner);
  const menuOpen = openMenuId === (comment.commentId || '');
  const closeMenu = useCallback(() => setOpenMenuId(null), [setOpenMenuId]);

  // dışa tıklayınca menüyü kapat
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (!rowRef.current) return;
      if (!rowRef.current.contains(e.target)) closeMenu();
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen, closeMenu]);

  const handleDelete = async () => {
    closeMenu();
    if (!canDelete) return;
    if (!window.confirm('Bu yorumu silmek istiyor musun?')) return;
    try {
      const coll = contentType === 'clip' ? 'clips' : 'posts';
      const ref = doc(db, coll, contentId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const list = Array.isArray(data?.yorumlar) ? [...data.yorumlar] : [];
      const filtered = list.filter((y) => (y.commentId || '') !== (comment.commentId || ''));
      await updateDoc(ref, { yorumlar: filtered });
    } catch (e) {
      console.error(e);
      showToast('Silinemedi. Lütfen tekrar dene.', { variant: 'error' });
    }
  };

  const handleRate = async (value) => {
    if (!currentUser) { showToast('Puanlamak için giriş yap.', { variant: 'error' }); return; }
    if (!comment?.commentId) return;
    try {
      const coll = contentType === 'clip' ? 'clips' : 'posts';
      const ref = doc(db, coll, contentId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const arr = Array.isArray(data?.yorumlar) ? [...data.yorumlar] : [];
      const idx = arr.findIndex((y) => (y.commentId || '') === comment.commentId);
      if (idx === -1) return;

      const c = { ...arr[idx] };
      const map = { ...(c.ratingsBy || {}) };
      const prev = typeof map[currentUser.uid] === 'number' ? map[currentUser.uid] : null;

      let sum = Number(c.ratingSum || 0);
      let count = Number(c.ratingCount || 0);

      if (prev != null) { sum -= Number(prev); } else { count += 1; }
      map[currentUser.uid] = Number(value);
      sum += Number(value);

      arr[idx] = { ...c, ratingsBy: map, ratingSum: sum, ratingCount: count };
      await updateDoc(ref, { yorumlar: arr });
      setRateOpen(false);
    } catch (e) {
      console.error(e);
      showToast('Puan verilemedi.', { variant: 'error' });
    }
  };

  const myScore =
    currentUser && comment?.ratingsBy && typeof comment.ratingsBy[currentUser.uid] === 'number'
      ? Number(comment.ratingsBy[currentUser.uid])
      : null;

  return (
    <div ref={rowRef} className={`pdm-commentItem${menuOpen ? ' menu-open' : ''}`}>
      <img
        src={comment.photoURL || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'}
        alt={comment.username || 'kullanıcı'}
        className="pdm-commentAvatar"
        onError={(e) => { e.currentTarget.src = 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'; }}
      />
      <div className="pdm-commentBody">
        <p><strong>{comment.username || 'kullanıcı'}</strong> {comment.text}</p>
        <div className="pdm-commentMeta">
          <span className="pdm-commentTime">{formatTimeAgoShort(comment.timestamp)}</span>
          {comment?.ratingCount > 0 && (
            <span className="pdm-commentRating">{avg.toFixed(1)} ★ · {comment.ratingCount}</span>
          )}
        </div>
      </div>

      <div className="pdm-commentActions">
        {/* mini ⭐: masaüstünde tek tıkla panel açılır (StarRatingV2) */}
        <div className="pdm-cmStar" title="Yorumu puanla" aria-label="Yorumu puanla">
          <StarRatingV2 size={18} onRate={handleRate} className={myScore ? 'sr2--rated' : ''} />
        </div>

        <div className="pdm-cmMoreWrap">
          <button
            className="pdm-cmMore"
            aria-label="Daha fazla"
            title="Daha fazla"
            onClick={() =>
              setOpenMenuId(prev =>
                prev === (comment.commentId || '') ? null : (comment.commentId || '')
              )
            }
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <div className="pdm-cmMenu" role="menu">
              {canDelete && (
                <button className="danger" role="menuitem" onClick={handleDelete}>Sil</button>
              )}
              <button role="menuitem" onClick={closeMenu}>İptal</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------- PAGE ----------------- */
export default function PermalinkPage() {
  const info = getPathInfo();
  const [contentData, setContentData] = useState(null);
  const [authorProfile, setAuthorProfile] = useState(null);
  const [agg, setAgg] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [yeniYorum, setYeniYorum] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!info) return;
    const coll = info.type === 'clip' ? 'clips' : 'posts';
    const ref = doc(db, coll, info.id);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setContentData({ id: snap.id, type: info.type, ...snap.data() });
      else setContentData(null);
    });
    return () => unsub();
  }, [info?.id, info?.type]);

  useEffect(() => {
    if (!contentData?.authorId) return;
    const ref = doc(db, 'users', contentData.authorId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setAuthorProfile(snap.data());
    });
    return () => unsub();
  }, [contentData?.authorId]);

  useEffect(() => {
    if (!contentData?.id) return;
    const ref = doc(db, 'content', contentData.id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      setAgg(d?.agg || null);
    });
    return () => unsub();
  }, [contentData?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!contentData?.id) return;
      const saved = await fsIsSaved(contentData.id);
      if (!cancelled) setIsSaved(saved);
    })();
    return () => { cancelled = true; };
  }, [contentData?.id]);

  const handleRate = async (value) => {
    if (!contentData?.id || !contentData?.authorId) return;
    await ensureContentDoc(contentData.id, contentData.authorId, contentData.type);
    await sendRating({ contentId: contentData.id, authorId: contentData.authorId, value, type: contentData.type });
  };

  const handleToggleSave = async () => {
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
      showToast(saved ? 'Kaydedildi' : 'Kaydedilenlerden kaldırıldı');
    } catch (e) {
      setIsSaved((s) => !s);
      showToast('Kaydetme başarısız', { variant: 'error' });
      console.error('Kaydet sırasında hata:', e);
    }
  };

  const handleCopyLink = async () => {
    if (!info) return;
    const url = getPermalink(info);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      showToast('Bağlantı kopyalandı', { variant: 'success' });
    } catch (e) {
      showToast('Kopyalanamadı', { variant: 'error' });
      console.error('Bağlantı kopyalanamadı:', e);
    }
  };

  const handleShare = async () => {
    if (!info) return;
    const url = getPermalink(info);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Gönderi', text: contentData?.mesaj || '', url });
      } else {
        await handleCopyLink();
      }
    } catch (e) {}
  };

  const handleYorumGonder = async (e) => {
    e.preventDefault();
    if (!yeniYorum.trim() || !currentUser || !contentData) return;
    setIsSubmitting(true);
    try {
      const coll = contentData.type === 'clip' ? 'clips' : 'posts';
      const ref = doc(db, coll, contentData.id);
      const yorum = {
        commentId: makeCommentId(currentUser.uid),
        text: yeniYorum,
        username: currentUser.displayName || 'kullanıcı',
        userId: currentUser.uid,
        photoURL: currentUser.photoURL || '',
        timestamp: new Date().toISOString(),
        ratingsBy: {},
        ratingSum: 0,
        ratingCount: 0,
      };
      const snap = await getDoc(ref);
      const current = snap.exists() && Array.isArray(snap.data()?.yorumlar) ? [...snap.data().yorumlar] : [];
      current.push(yorum);
      await updateDoc(ref, { yorumlar: current });
      setYeniYorum('');
      showToast('Yorum gönderildi', { variant: 'success' });
    } catch (err) {
      showToast('Yorum gönderilemedi', { variant: 'error' });
      console.error('Yorum eklenirken hata:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!info) {
    return (
      <div className="pdm-overlay">
        <div className="pdm-content pdm-col">
          <div className="pdm-empty">Geçersiz bağlantı.</div>
        </div>
      </div>
    );
  }

  if (contentData === null) {
    return (
      <div className="pdm-overlay">
        <div className="pdm-content pdm-col">
          <div className="pdm-empty">İçerik bulunamadı.</div>
        </div>
      </div>
    );
  }

  const aciklama = contentData?.aciklama || contentData?.mesaj;
  const yorumlar = contentData?.yorumlar
    ? [...contentData.yorumlar].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    : [];
  const isOwner = contentData?.authorId === auth.currentUser?.uid;

  return (
    <div className="pdm-overlay" onClick={() => openMenuId && setOpenMenuId(null)}>
      <div className="pdm-content" onClick={(e) => e.stopPropagation()}>
        {/* Sol: medya alanı */}
        <div className="pdm-media">
          <div className="pdm-frame" aria-label="Medya çerçevesi 9:16">
            {contentData.type === 'clip' ? (
              <video
                src={contentData?.mediaUrl}
                className="pdm-mediaEl"
                autoPlay
                controls
                playsInline
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : (
              <img
                src={contentData?.mediaUrl}
                alt="Gönderi"
                className="pdm-mediaEl"
                draggable={false}
              />
            )}
          </div>
        </div>

        {/* Sağ: bilgi paneli */}
        <div className="pdm-info">
          <header className="pdm-infoHeader">
            <div className="pdm-author">
              <img
                src={authorProfile?.profilFoto || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'}
                alt={authorProfile?.kullaniciAdi || 'profil'}
                className="pdm-infoAvatar"
                onError={(e) => { e.currentTarget.src = 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'; }}
              />
              <span className="pdm-infoUsername">{authorProfile?.kullaniciAdi || 'kullanıcı'}</span>
            </div>
            <div className="pdm-infoActions">
              <button className="pdm-actionBtn" onClick={() => window.history.back()} title="Geri">⟵</button>
              <button className="pdm-actionBtn" onClick={handleShare} title="Paylaş">↗</button>
            </div>
          </header>

          <div className="pdm-comments">
            {aciklama && (
              <div className="pdm-commentItem">
                <img
                  src={authorProfile?.profilFoto || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'}
                  alt={authorProfile?.kullaniciAdi || 'profil'}
                  className="pdm-commentAvatar"
                  onError={(e) => { e.currentTarget.src = 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'; }}
                />
                <div className="pdm-commentBody">
                  <p><strong>{authorProfile?.kullaniciAdi || 'kullanıcı'}</strong> {aciklama}</p>
                </div>
              </div>
            )}

            {yorumlar.map((y, i) => (
              <CommentRow
                key={y.commentId || `${y.userId}_${y.timestamp || i}`}
                contentId={contentData.id}
                contentType={contentData.type}
                isOwner={isOwner}
                currentUser={currentUser}
                comment={y}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
              />
            ))}
          </div>

          <div className="pdm-footer">
            <div className="pdm-actions">
              <div className="pdm-starWrap">
                <StarRatingV2 size={28} disabled={isOwner} onRate={handleRate} />
                {agg?.avg > 0 && agg?.count > 0 && (
                  <span className="pdm-starMeta" aria-label="Bu içeriğin puanı">
                    {Number(agg.avg).toFixed(1)} ★ · {formatCount(agg.count)} oy
                  </span>
                )}
              </div>

              <button className="pdm-actionBtn" onClick={handleShare} title="Paylaş">↗</button>
              <button
                className="pdm-actionBtn save"
                aria-label={isSaved ? 'Kaydedildi' : 'Kaydet'}
                onClick={handleToggleSave}
              >
                {isSaved ? 'Kaydedildi' : 'Kaydet'}
              </button>
            </div>

            <p className="pdm-date">{formatTimeAgoShort(contentData?.tarih)}</p>

            <form onSubmit={handleYorumGonder} className="pdm-commentForm">
              <img
                src={auth.currentUser?.photoURL || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'}
                alt="Profil"
                className="pdm-commentFormAvatar"
                onError={(e) => { e.currentTarget.src = 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'; }}
              />
              <input
                type="text"
                value={yeniYorum}
                onChange={(e) => setYeniYorum(e.target.value)}
                placeholder="Yorum ekle..."
                aria-label="Yorum ekle"
              />
              <button type="submit" disabled={!yeniYorum.trim() || isSubmitting}>Paylaş</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
