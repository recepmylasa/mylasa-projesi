import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import './YorumModal.css';

// Tarihi "X zaman önce" formatına çeviren fonksiyon
const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '';
  const d = typeof timestamp === 'string' ? new Date(timestamp) :
            timestamp?.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  const secondsPast = (Date.now() - d.getTime()) / 1000;

  if (secondsPast < 60) return `${Math.round(secondsPast)}s`;
  if (secondsPast < 3600) return `${Math.floor(secondsPast / 60)}d`;
  if (secondsPast <= 86400) return `${Math.floor(secondsPast / 3600)}s`;
  return `${Math.floor(secondsPast / 86400)}g`;
};

function YorumModal({ post, onClose, onUserClick }) {
  const [yorumlar, setYorumlar] = useState([]);
  const [yeniYorum, setYeniYorum] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentUser = auth.currentUser;

  // Gönderinin yorumlarını anlık dinle
  useEffect(() => {
    const postRef = doc(db, "posts", post.id);
    const unsubscribe = onSnapshot(postRef, (docSnap) => {
      if (docSnap.exists()) {
        const postData = docSnap.data();
        // UI'da yeni en üstte dursun diye ters çeviriyoruz
        setYorumlar(postData.yorumlar ? [...postData.yorumlar].reverse() : []);
      }
    });
    return () => unsubscribe();
  }, [post.id]);

  const handleYorumGonder = async (e) => {
    e.preventDefault();
    if (yeniYorum.trim() === '' || !currentUser || isSubmitting) return;

    setIsSubmitting(true);
    const postRef = doc(db, "posts", post.id);

    const yorumObjesi = {
      text: yeniYorum,
      username: currentUser.displayName || 'kullanıcı',
      userId: currentUser.uid,
      timestamp: new Date().toISOString()
    };

    try {
      // Güvenlik kurallarına uyum: tüm liste +1 eleman
      const current = Array.isArray(yorumlar) ? [...yorumlar].reverse() : []; // orijinal sıraya geri dön
      current.push(yorumObjesi);
      await updateDoc(postRef, { yorumlar: current });
      setYeniYorum('');
    } catch (error) {
      console.error("Yorum eklenirken hata:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-global" onClick={onClose}>
      <div className="yorum-modal-content" onClick={e => e.stopPropagation()}>
        <header className="yorum-modal-header">
          <h3>Yorumlar</h3>
        </header>
        <div className="yorum-listesi">
          {yorumlar.length > 0 ? (
            yorumlar.map((yorum, index) => (
              <div key={index} className="yorum-item">
                <strong onClick={() => onUserClick(yorum.userId)}>{yorum.username}</strong>
                <span>{yorum.text}</span>
                <span className="yorum-tarih">{formatTimeAgo(yorum.timestamp)}</span>
              </div>
            ))
          ) : (
            <p className="yorum-yok-mesaji">Henüz yorum yapılmamış.</p>
          )}
        </div>
        <form onSubmit={handleYorumGonder} className="yorum-ekleme-formu">
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
  );
}

export default YorumModal;
