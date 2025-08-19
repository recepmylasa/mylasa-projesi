import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from './firebase';
import { collection, query, orderBy, onSnapshot, doc, onSnapshot as onDocSnapshot } from 'firebase/firestore';
import './ClipsMobile.css';

// İkonlar (kalp kaldırıldı)
import { BsChat, BsThreeDots } from 'react-icons/bs';
import { FiSend } from 'react-icons/fi';
import { IoArrowBackOutline } from 'react-icons/io5';
import { VscMute, VscUnmute } from 'react-icons/vsc';

// YENİ: Tek-yıldız tetikleyici + uzun bas/kaydır seçici
import StarRatingV2 from './reputation/StarRatingV2';

const OptionsMenu = ({ isOwner, onClose }) => {
  const handleAction = (action) => {
    alert(`${action} özelliği yakında eklenecek.`);
    onClose();
  };

  return (
    <div className="options-menu-overlay-mobile" onClick={onClose}>
      <div className="options-menu-mobile" onClick={e => e.stopPropagation()}>
        {isOwner ? (
          <>
            <button onClick={() => handleAction('Sil')}>Sil</button>
            <button onClick={() => handleAction('Kaydet')}>Kaydet</button>
          </>
        ) : (
          <>
            <button onClick={() => handleAction('Şikayet Et')} style={{color: 'red'}}>Şikayet Et</button>
            <button onClick={() => handleAction('Kaydet')}>Kaydet</button>
          </>
        )}
        <button onClick={onClose}>İptal</button>
      </div>
    </div>
  );
};

function Clip({ clipData, isVisible, onNavChange }) {
  const [author, setAuthor] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef(null);
  const currentUser = auth.currentUser;

  // Yazar bilgisi
  useEffect(() => {
    if (!clipData.authorId) return;
    const userDocRef = doc(db, 'users', clipData.authorId);
    const unsub = onDocSnapshot(userDocRef, (snap) => {
      if (snap.exists()) setAuthor(snap.data());
    });
    return () => unsub();
  }, [clipData.authorId]);

  // Görünürlük: görünür olan oynar, olmayan durur
  useEffect(() => {
    if (isVisible) {
      videoRef.current?.play().catch(() => {});
    } else {
      videoRef.current?.pause();
      if (videoRef.current) videoRef.current.currentTime = 0;
    }
  }, [isVisible]);

  // Video alanına dokunma = ses aç/kapa (basit kontrol)
  const toggleMute = (e) => {
    e?.stopPropagation?.();
    setIsMuted(prev => !prev);
  };

  const handleCommentClick = (e) => { e.stopPropagation(); alert('Yorum yapma özelliği yakında eklenecek.'); };
  const handleFollowClick = (e) => { e.stopPropagation(); alert('Takip etme özelliği yakında eklenecek.'); };
  const handleMoreOptionsClick = (e) => { e.stopPropagation(); setIsMenuOpen(true); };

  return (
    <>
      <div className="clip-video-container-mobile" onClick={toggleMute}>
        <video
          ref={videoRef}
          className="clip-video-mobile"
          src={clipData.mediaUrl}
          loop
          playsInline
          muted={isMuted}
        />

        {/* Üst bar */}
        <div className="clip-header-mobile">
          <button
            onClick={(e) => { e.stopPropagation(); onNavChange('home'); }}
            className="clip-back-btn-mobile"
          >
            <IoArrowBackOutline className="clip-icon back-icon" />
          </button>
          <h1>Clips</h1>
        </div>

        {/* Ses göstergesi */}
        <div className="clip-volume-indicator">
          <button className="volume-btn-clips" onClick={toggleMute}>
            {isMuted ? <VscMute /> : <VscUnmute />}
          </button>
        </div>

        {/* UI overlay */}
        <div className="clip-ui-overlay-mobile">
          <div className="clip-info-mobile">
            <div className="clip-author-info-mobile">
              <img
                src={author?.profilFoto || 'https://placehold.co/40x40/e0e0e0/e0e0e0?text=?'}
                alt={author?.kullaniciAdi}
                className="clip-author-avatar-mobile"
              />
              <span className="clip-author-username-mobile">{author?.kullaniciAdi || '...'}</span>
              {currentUser?.uid !== clipData.authorId && (
                <button onClick={handleFollowClick} className="clip-follow-btn-mobile">Takip Et</button>
              )}
            </div>
            <p className="clip-description-mobile">{clipData.aciklama}</p>
          </div>

          {/* Sağ dikey aksiyonlar */}
          <div className="clip-actions-mobile">
            {/* YENİ: Tek yıldız tetikleyici (uzun bas/kaydır ile 1–5 seçer) */}
            <div
              className="clip-action-btn-mobile"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <StarRatingV2
                contentId={clipData.id}
                contentType="clip"
                authorId={clipData.authorId}
                size={28}               // kalp ile aynı boy
                compact                 // yığın içinde minimal mod
                align="center"          // ikon ortalı
              />
            </div>

            <button onClick={handleCommentClick} className="clip-action-btn-mobile">
              <BsChat className="clip-icon" />
              <span>{clipData.yorumlar?.length || 0}</span>
            </button>

            <button className="clip-action-btn-mobile">
              <FiSend className="clip-icon" />
            </button>

            <button onClick={handleMoreOptionsClick} className="clip-action-btn-mobile">
              <BsThreeDots className="clip-icon" />
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <OptionsMenu
          isOwner={currentUser?.uid === clipData.authorId}
          onClose={() => setIsMenuOpen(false)}
        />
      )}
    </>
  );
}

function ClipsMobile({ onNavChange }) {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visibleClipId, setVisibleClipId] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, 'clips'), orderBy('tarih', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedClips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClips(fetchedClips);
      if (fetchedClips.length > 0 && !visibleClipId) {
        setVisibleClipId(fetchedClips[0].id);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [visibleClipId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setVisibleClipId(entry.target.dataset.clipId);
          }
        });
      },
      { root: containerRef.current, threshold: 0.7 }
    );
    const clipElements = containerRef.current?.children;
    if (clipElements) {
      Array.from(clipElements).forEach((el, index) => {
        if (clips[index]) {
          el.dataset.clipId = clips[index].id;
          observer.observe(el);
        }
      });
    }
    return () => {
      if (clipElements) {
        Array.from(clipElements).forEach(el => observer.unobserve(el));
      }
    };
  }, [clips, loading]);

  if (loading) {
    return <div className="clips-loading-mobile">Yükleniyor...</div>;
  }

  return (
    <div className="clips-page-wrapper-mobile">
      <div ref={containerRef} className="clips-container-mobile">
        {clips.map(clip => (
          <Clip
            key={clip.id}
            clipData={clip}
            isVisible={clip.id === visibleClipId}
            onNavChange={onNavChange}
          />
        ))}
      </div>
    </div>
  );
}

export default ClipsMobile;
