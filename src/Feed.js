import { useEffect, useState } from 'react';
import { db } from './firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from 'firebase/firestore';

// Masaüstü ve Mobil kartlar (Kural 6)
import Post from './Post';
import PostMobile from './PostMobile';

import ClipInFeed from './ClipInFeed';
import OneriSlider from './OneriSlider';
import './Feed.css';

/* -----------------------------------------------------------
   EKRAN AYIRICI (JS tarafında — CSS @media değil)
   App.js ile aynı eşik: <= 768px → mobil
----------------------------------------------------------- */
function useIsMobile(maxWidth = 768) {
  const getMatch = () =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches
      : false;

  const [isMobile, setIsMobile] = useState(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const handler = (e) => setIsMobile(e.matches);

    // ilk değer
    setIsMobile(mq.matches);

    // tarayıcı uyumluluğu
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, [maxWidth]);

  return isMobile;
}

// YENİ: onViewClip prop'u eklendi
function Feed({ onUserClick, onCommentClick, aktifKullaniciId, onViewClip }) {
  const [feedItems, setFeedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [takipEdilenler, setTakipEdilenler] = useState([]);
  const [aktifKullaniciInfo, setAktifKullaniciInfo] = useState(null);

  const isMobile = useIsMobile(768);

  useEffect(() => {
    if (!aktifKullaniciId) return;
    const userDocRef = doc(db, 'users', aktifKullaniciId);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data();
        setAktifKullaniciInfo(userData);
        setTakipEdilenler([aktifKullaniciId, ...(userData.takipEdilenler || [])]);
      }
    });
    return () => unsubscribe();
  }, [aktifKullaniciId]);

  useEffect(() => {
    if (takipEdilenler.length === 0) {
      setLoading(false);
      setFeedItems([]);
      return;
    }

    setLoading(true);

    // Not: Firestore 'in' operatörü için ID sayısını sınırlı tutmaya devam ediyoruz.
    // Burada mevcut davranışı koruyarak 30 ile sınırlıyoruz.
    const queryIds = takipEdilenler.slice(0, 30);

    const postsQuery = query(
      collection(db, 'posts'),
      where('authorId', 'in', queryIds),
      orderBy('tarih', 'desc'),
      limit(20)
    );
    const clipsQuery = query(
      collection(db, 'clips'),
      where('authorId', 'in', queryIds),
      orderBy('tarih', 'desc'),
      limit(10)
    );

    // 🔧 DÜZELTME: Nested onSnapshot yerine iki bağımsız dinleyici + tekleştirilmiş birleştirme.
    let latestPosts = [];
    let latestClips = [];

    const combineAndSet = () => {
      const combined = [...latestPosts, ...latestClips];

      // Tarih objesi olmayanları filtrele ve sırala
      const sorted = combined
        .filter((item) => item.tarih && typeof item.tarih.seconds === 'number')
        .sort((a, b) => b.tarih.seconds - a.tarih.seconds);

      setFeedItems(sorted);
      setLoading(false);
    };

    const unsubscribePosts = onSnapshot(postsQuery, (postsSnapshot) => {
      latestPosts = postsSnapshot.docs.map((d) => ({
        ...d.data(),
        id: d.id,
        type: 'post'
      }));
      combineAndSet();
    });

    const unsubscribeClips = onSnapshot(clipsQuery, (clipsSnapshot) => {
      latestClips = clipsSnapshot.docs.map((d) => ({
        ...d.data(),
        id: d.id,
        type: 'clip'
      }));
      combineAndSet();
    });

    return () => {
      unsubscribePosts();
      unsubscribeClips();
    };
  }, [takipEdilenler]);

  const handleLike = async (itemId, item, type) => {
    if (!aktifKullaniciId || !aktifKullaniciInfo) return;

    const collectionName = type === 'post' ? 'posts' : 'clips';
    const itemRef = doc(db, collectionName, itemId);
    const begenildiMi = item.begenenler?.includes(aktifKullaniciId);

    try {
      await updateDoc(itemRef, {
        begenenler: begenildiMi ? arrayRemove(aktifKullaniciId) : arrayUnion(aktifKullaniciId)
      });

      if (!begenildiMi && item.authorId !== aktifKullaniciId) {
        await addDoc(collection(db, 'notifications'), {
          to: item.authorId,
          from: aktifKullaniciId,
          fromUsername: aktifKullaniciInfo.kullaniciAdi,
          fromAvatar: aktifKullaniciInfo.profilFoto || '',
          text: type === 'post' ? 'gönderini beğendi.' : 'klibini beğendi.',
          postId: itemId,
          createdAt: serverTimestamp(),
          read: false
        });
      }
    } catch (error) {
      console.error('Beğenme işlemi sırasında hata oluştu:', error);
    }
  };

  if (loading)
    return (
      <p style={{ textAlign: 'center', marginTop: 60, fontWeight: 'bold', color: '#8e8e8e' }}>
        Akış Yükleniyor...
      </p>
    );

  return (
    <div className="feed-container">
      <OneriSlider />

      {feedItems.length === 0 && !loading && (
        <div style={{ textAlign: 'center', color: '#888', marginTop: 32, padding: '0 20px' }}>
          <h2>Akışın Boş Görünüyor</h2>
          <p>Takip ettiğin kişilerin gönderileri burada görünecek.</p>
        </div>
      )}

      <div>
        {feedItems.map((item) => {
          if (item.type === 'post') {
            const Card = isMobile ? PostMobile : Post;
            return (
              <Card
                key={`post-${item.id}`}
                post={item}
                aktifKullaniciId={aktifKullaniciId}
                onUserClick={onUserClick}
                handleLike={() => handleLike(item.id, item, 'post')}
                onCommentClick={onCommentClick}
              />
            );
          }
          if (item.type === 'clip') {
            return (
              <ClipInFeed
                key={`clip-${item.id}`}
                clip={item}
                aktifKullaniciId={aktifKullaniciId}
                onUserClick={onUserClick}
                handleLike={() => handleLike(item.id, item, 'clip')}
                onViewClip={onViewClip} // YENİ: Fonksiyonu iletiyoruz
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export default Feed;
