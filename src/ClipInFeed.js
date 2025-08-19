import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';

// ⚠️ Post.css artık import EDİLMİYOR (çakışmayı kesiyoruz)
// import './Post.css';
import './ClipInFeed.css'; // yeni, namespaced stiller

import { AiOutlineHeart, AiFillHeart } from 'react-icons/ai';
import { BsChat, BsBookmark, BsBookmarkFill, BsThreeDots } from 'react-icons/bs';
import { FiSend } from 'react-icons/fi';
import { VscMute, VscUnmute } from 'react-icons/vsc';

function ClipInFeed({ clip, aktifKullaniciId, onUserClick, handleLike, onViewClip }) {
  const [authorProfile, setAuthorProfile] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const videoRef = useRef(null);

  // Otomatik play/pause — görünürlük %50 ve üzeri
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!clip?.authorId) return;
    const userRef = doc(db, 'users', clip.authorId);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) setAuthorProfile(snap.data());
    });
    return () => unsub();
  }, [clip?.authorId]);

  const toggleMute = (e) => {
    e.stopPropagation();
    setIsMuted((m) => !m);
  };

  if (!authorProfile) {
    return (
      <article className="clipDk-card clipDk-skeleton">
        <div className="clipDk-skel-media" />
      </article>
    );
  }

  const isLiked = clip?.begenenler?.includes(aktifKullaniciId);
  const begCount = clip?.begenenler?.length || 0;
  const username = authorProfile?.kullaniciAdi || '...';
  const avatarUrl =
    authorProfile?.profilFoto || 'https://placehold.co/32x32/EFEFEF/AAAAAA?text=?';

  return (
    <article className="clipDk-card">
      <header className="clipDk-header">
        <img
          src={avatarUrl}
          alt={username}
          className="clipDk-avatar"
          onClick={() => onUserClick?.(clip.authorId)}
          draggable="false"
        />
        <span
          className="clipDk-username"
          onClick={() => onUserClick?.(clip.authorId)}
          title={username}
        >
          {username}
        </span>
        <button className="clipDk-optionsBtn" aria-label="Seçenekler">
          <BsThreeDots />
        </button>
      </header>

      <div className="clipDk-media" onClick={() => onViewClip?.(clip)}>
        <video
          ref={videoRef}
          src={clip.mediaUrl}
          loop
          muted={isMuted}
          playsInline
          className="clipDk-video"
        />
        <button className="clipDk-vol" onClick={toggleMute} aria-label={isMuted ? 'Sesi aç' : 'Sesi kapat'}>
          {isMuted ? <VscMute /> : <VscUnmute />}
        </button>
      </div>

      <div className="clipDk-content">
        <div className="clipDk-actions">
          <button onClick={() => handleLike?.(clip.id, clip, 'clip')} className="clipDk-actionBtn" aria-label="Beğen">
            {isLiked ? <AiFillHeart className="clipDk-icon liked" /> : <AiOutlineHeart className="clipDk-icon" />}
          </button>
          <button onClick={() => onViewClip?.(clip)} className="clipDk-actionBtn" aria-label="Yorumlar">
            <BsChat className="clipDk-icon" />
          </button>
          <button className="clipDk-actionBtn" aria-label="Paylaş">
            <FiSend className="clipDk-icon" />
          </button>
          <button onClick={() => setIsSaved((v) => !v)} className="clipDk-actionBtn clipDk-save" aria-label={isSaved ? 'Kaydedildi' : 'Kaydet'}>
            {isSaved ? <BsBookmarkFill className="clipDk-icon" /> : <BsBookmark className="clipDk-icon" />}
          </button>
        </div>

        {begCount > 0 && <div className="clipDk-likes">{begCount.toLocaleString('tr-TR')} beğeni</div>}

        {clip?.aciklama && (
          <p className="clipDk-caption">
            <strong onClick={() => onUserClick?.(clip.authorId)}>{username}</strong>
            <span> {clip.aciklama}</span>
          </p>
        )}
      </div>
    </article>
  );
}

export default ClipInFeed;
