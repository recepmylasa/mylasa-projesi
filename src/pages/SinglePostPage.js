import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import {
  doc,
  onSnapshot,
  getDoc,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import StarRatingV2 from '../components/StarRatingV2/StarRatingV2';
import { ensureContentDoc, rateContent as sendRating } from '../reputationClient';
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from '../savesClient';
import './SinglePostPage.css';

/* ------------ Utils ------------ */
const formatTimeAgo = (ts) => {
  if (!ts) return '';
  const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
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

/* ------------ Page ------------ */
export default function SinglePostPage() {
  const { id } = useParams();
  const [type, setType] = useState('post'); // 'post' | 'clip' (URL'den veya content/ doc'tan belirlenir)
  const [data, setData] = useState(null);   // post/clip dokümanı
  const [author, setAuthor] = useState(null);
  const [agg, setAgg] = useState(null);     // { avg, count }
  const [isSaved, setIsSaved] = useState(false);
  const [yeniYorum, setYeniYorum] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentUser = auth.currentUser;

  // 1) Türü bul (query yoksa content/{id} -> type, yoksa posts dene yoksa clips)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // URL query’den tip gelmişse kullan
      const url = new URL(window.location.href);
      const qType = url.searchParams.get('type');
      if (qType === 'clip' || qType === 'post') {
        setType(qType);
        return;
      }

      // content/{id} varsa type al
      const contentRef = doc(db, 'content', id);
      const contentSnap = await getDoc(contentRef);
      if (contentSnap.exists()) {
        const t = contentSnap.data()?.type;
        if ((t === 'post' || t === 'clip') && !cancelled) {
          setType(t);
          return;
        }
      }

      // fallback: posts -> clips
      const postRef = doc(db, 'posts', id);
      const postSnap = await getDoc(postRef);
      if (postSnap.exists() && !cancelled) {
        setType('post');
        return;
      }
      const clipRef = doc(db, 'clips', id);
      const clipSnap = await getDoc(clipRef);
      if (clipSnap.exists() && !cancelled) {
        setType('clip');
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  // 2) İçeriği canlı dinle
  useEffect(() => {
    if (!id || !type) return;
    const coll = type === 'clip' ? 'clips' : 'posts';
    const ref = doc(db, coll, id);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setData({ id: snap.id, type, ...snap.data() });
      else setData(null);
    });
    return () => unsub();
  }, [id, type]);

  // 3) Yazar profili
  useEffect(() => {
    if (!data?.authorId) return;
    const uref = doc(db, 'users', data.authorId);
    const unsub = onSnapshot(uref, (s) => s.exists() && setAuthor(s.data()));
    return () => unsub();
  }, [data?.authorId]);

  // 4) Reputation agg
  useEffect(() => {
    if (!id) return;
    const ref = doc(db, 'content', id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      setAgg(d?.agg || null);
    });
    return () => unsub();
  }, [id]);

  // 5) Saved durumu
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await fsIsSaved(id);
      if (!cancelled) setIsSaved(saved);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const username = author?.kullaniciAdi || 'bilinmeyen';
  const avatar = author?.profilFoto || 'https://placehold.co/40x40/EFEFEF/AAAAAA?text=P';

  const isOwner = useMemo(() => {
    if (!data?.authorId || !currentUser) return false;
    return data.authorId === currentUser.uid;
  }, [data?.authorId, currentUser]);

  // Yorum gönder
  const handleYorumGonder = async (e) => {
    e.preventDefault();
    if (!yeniYorum.trim() || !currentUser || !data) return;
    setIsSubmitting(true);
    try {
      const coll = data.type === 'clip' ? 'clips' : 'posts';
      const ref = doc(db, coll, data.id);
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
    if (!data?.id || !data?.authorId) return;
    const t = data.type === 'clip' ? 'clip' : 'post';
    await ensureContentDoc(data.id, data.authorId, t);
    await sendRating({ contentId: data.id, authorId: data.authorId, value, type: t });
  };

  // Kaydet toggle
  const handleToggleSave = async () => {
    setIsSaved((s) => !s);
    try {
      const { saved } = await fsToggleSave({
        contentId: id,
        type,
        authorId: data?.authorId,
        mediaUrl: data?.mediaUrl,
        caption: data?.aciklama || data?.mesaj || '',
      });
      setIsSaved(saved);
    } catch (e) {
      setIsSaved((s) => !s);
      console.error('Kaydet sırasında hata:', e);
    }
  };

  // Paylaş
  const handleShare = async () => {
    const url = buildPermalink(id, type || 'post');
    const payload = {
      title: 'Gönderi',
      text: data?.mesaj ? String(data.mesaj).slice(0, 120) : '',
      url,
    };
    if (navigator.share) {
      try { await navigator.share(payload); return; } catch { /* cancel */ }
    }
    await copyToClipboard(url);
  };

  if (!data) {
    return (
      <div className="sp-wrap">
        <div className="sp-inner">
          <p className="sp-empty">Gönderi bulunamadı.</p>
        </div>
      </div>
    );
  }

  const yorumlar = data?.yorumlar
    ? [...data.yorumlar].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    : [];

  return (
    <div className="sp-wrap">
      <div className="sp-inner">
        <header className="sp-header">
          <button className="sp-back" onClick={() => window.history.back()} aria-label="Geri">←</button>
          <div className="sp-user" onClick={() => {/* profil route’in varsa burada yönlendir */}}>
            <img src={avatar} alt={username} className="sp-avatar" />
            <span className="sp-username">{username}</span>
          </div>
          <div className="sp-actions">
            <button className="sp-btn" onClick={handleShare} title="Paylaş">Paylaş</button>
            <button className="sp-btn" onClick={() => copyToClipboard(buildPermalink(id, type))} title="Bağlantıyı kopyala">Link</button>
            <button className={`sp-btn ${isSaved ? 'saved' : ''}`} onClick={handleToggleSave} title={isSaved ? 'Kaydedildi' : 'Kaydet'}>
              {isSaved ? 'Kaydedildi' : 'Kaydet'}
            </button>
          </div>
        </header>

        <main className="sp-body">
          <div className="sp-media">
            {type === 'clip' ? (
              <video src={data?.mediaUrl} controls playsInline />
            ) : (
              <img src={data?.mediaUrl} alt="Gönderi" />
            )}
          </div>

          <aside className="sp-side">
            <div className="sp-agg">
              <StarRatingV2 size={28} onRate={handleRate} readOnly={isOwner} />
              {agg?.avg > 0 && agg?.count > 0 && (
                <span className="sp-aggMeta">{Number(agg.avg).toFixed(1)} ★ · {formatCount(agg.count)} oy</span>
              )}
            </div>

            {(data?.aciklama || data?.mesaj) && (
              <div className="sp-caption">
                <strong>{username}</strong> {data?.aciklama || data?.mesaj}
              </div>
            )}

            <div className="sp-comments">
              {yorumlar.map((y, i) => (
                <div key={i} className="sp-comment">
                  <img src={y.photoURL || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=P'} alt={y.username} />
                  <div className="sp-commentBody">
                    <p><strong>{y.username}</strong> {y.text}</p>
                    <span className="sp-time">{formatTimeAgo(y.timestamp)}</span>
                  </div>
                </div>
              ))}
              {yorumlar.length === 0 && (
                <div className="sp-empty">Henüz yorum yok.</div>
              )}
            </div>

            <div className="sp-footer">
              <div className="sp-date">{formatTimeAgo(data?.tarih)}</div>
              <form className="sp-form" onSubmit={handleYorumGonder}>
                <input
                  type="text"
                  placeholder="Yorum ekle…"
                  value={yeniYorum}
                  onChange={(e) => setYeniYorum(e.target.value)}
                />
                <button type="submit" disabled={!yeniYorum.trim() || isSubmitting}>Paylaş</button>
              </form>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
