// src/StoryModalDesktop.js
// Masaüstü (web) için Instagram benzeri Hikaye Modalı
// Altın kural: Mevcut mantığı bozma. UI/UX Instagram'a yaklaştır.
// Bu dosya, senin gönderdiğin src/StoryModal.js mantığını temel alır
// ve yalnızca masaüstü görünümü için modernleştirilmiş bir arayüz sunar.

import React, { useEffect, useRef, useState, useCallback } from "react";
import { auth, db, storage } from "./firebase"; // konuma göre güncelle (aynı klasördeyse böyle kalsın)
import { deleteDoc, doc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import "./StoryModalDesktop.css"; // Masaüstü için ayrı CSS (bir sonraki adımda vereceğim)

function StoryModalDesktop({ stories, onClose }) {
  // === State ve referanslar ===
  const [items, setItems] = useState(() => stories || []);
  useEffect(() => { setItems(stories || []); }, [stories]);

  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const me = auth.currentUser?.uid;
  const current = items?.[idx];
  const isVideo = !!current?.mediaType && current.mediaType.startsWith("video");
  const isOwner = !!current && current.authorId === me;

  const [lastViewers, setLastViewers] = useState([]);
  const [replyText, setReplyText] = useState("");
  const quickEmojis = ["❤️", "😂", "😮", "😍", "😢", "👏"]; // kaydırılabilir şerit için

  const mediaRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const pauseAccumRef = useRef(0);
  const pauseStartRef = useRef(0);

  const pausedRef = useRef(false);
  const menuOpenRef = useRef(false);
  const confirmOpenRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { menuOpenRef.current = menuOpen; }, [menuOpen]);
  useEffect(() => { confirmOpenRef.current = confirmOpen; }, [confirmOpen]);

  const touchXRef = useRef(null);

  // === Yardımcılar ===
  const timeAgo = (ts) => {
    try {
      let date = ts;
      if (!date) return "";
      if (typeof ts?.toDate === "function") date = ts.toDate();
      if (typeof ts === "number") date = new Date(ts);
      const diff = (Date.now() - new Date(date).getTime()) / 1000; // sn
      if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`;
      if (diff < 3600) return `${Math.floor(diff/60)}d`;
      if (diff < 86400) return `${Math.floor(diff/3600)}s`;
      const d = Math.floor(diff/86400);
      return `${d}g`;
    } catch { return ""; }
  };

  const markAuthorWatched = useCallback((authorId) => {
    try {
      const raw = localStorage.getItem("watchedStories");
      const arr = raw ? JSON.parse(raw) : [];
      if (authorId && !arr.includes(authorId)) {
        localStorage.setItem("watchedStories", JSON.stringify([...arr, authorId]));
        window.dispatchEvent(new Event("mylasa-watched-updated"));
      }
    } catch {}
  }, []);

  useEffect(() => { if (items?.length) setIdx(0); }, [items]);

  // === Hikaye değiştiğinde yüklenmesi gerekenler ===
  useEffect(() => {
    if (!current) return;
    setProgress(0);
    setPaused(false);
    setMenuOpen(false);
    setConfirmOpen(false);
    pauseAccumRef.current = 0;
    pauseStartRef.current = 0;
    setReplyText("");
    markAuthorWatched(current.authorId);

    (async () => {
      if (!(isOwner && current.id)) { setLastViewers([]); return; }
      try {
        const sdoc = await getDoc(doc(db, "hikayeler", current.id));
        if (sdoc.exists() && Array.isArray(sdoc.data().izleyenler)) {
          const ids = sdoc.data().izleyenler.slice(-3).reverse();
          const results = await Promise.all(ids.map(async (uid) => {
            try {
              const uDoc = await getDoc(doc(db, "users", uid));
              return uDoc.exists() ? (uDoc.data().profilFoto || null) : null;
            } catch { return null; }
          }));
          setLastViewers(results.filter(Boolean));
        } else {
          setLastViewers([]);
        }
      } catch (e) {
        console.error("Son izleyiciler alınamadı:", e);
        setLastViewers([]);
      }
    })();
  }, [current, isOwner, markAuthorWatched]);

  // === Zamanlayıcı / video ===
  useEffect(() => {
    if (!current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (isVideo) {
      const v = mediaRef.current;
      if (!v) return;

      const onMeta = () => { if (!pausedRef.current) v.play().catch(()=>{}); };
      const onTime = () => {
        if (v.duration) setProgress(Math.min(100, (v.currentTime / v.duration) * 100));
      };
      const onEnded = () => goNext();

      v.muted = muted;
      v.playsInline = true;
      v.autoplay = true;

      v.addEventListener("loadedmetadata", onMeta);
      v.addEventListener("timeupdate", onTime);
      v.addEventListener("ended", onEnded);
      v.play().catch(()=>{});

      return () => {
        v.pause();
        v.removeEventListener("loadedmetadata", onMeta);
        v.removeEventListener("timeupdate", onTime);
        v.removeEventListener("ended", onEnded);
      };
    }

    const DURATION = 5000;
    startRef.current = performance.now();

    const tick = (now) => {
      const isPaused = pausedRef.current || menuOpenRef.current || confirmOpenRef.current;
      if (!isPaused) {
        const elapsed = now - startRef.current - pauseAccumRef.current;
        const pct = (elapsed / DURATION) * 100;
        if (pct >= 100) {
          setProgress(100);
          goNext();
          return;
        }
        setProgress(pct);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [idx, isVideo, muted]);

  // Sekme görünürlüğü
  useEffect(() => {
    const onVis = () => setPaused(document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // === Navigation ===
  const goNext = useCallback(() => {
    if (idx < items.length - 1) setIdx(i => i + 1);
    else onClose?.();
  }, [idx, items, onClose]);

  const goPrev = useCallback(() => { if (idx > 0) setIdx(i => i - 1); }, [idx]);

  const pause = useCallback(() => {
    if (pausedRef.current) return;
    setPaused(true);
    pauseStartRef.current = performance.now();
    const v = mediaRef.current;
    if (v && v.tagName === "VIDEO") v.pause();
  }, []);
  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    setPaused(false);
    const delta = performance.now() - pauseStartRef.current;
    pauseAccumRef.current += delta;
    const v = mediaRef.current;
    if (v && v.tagName === "VIDEO") v.play().catch(()=>{});
  }, []);
  const togglePause = useCallback(() => (pausedRef.current ? resume() : pause()), [pause, resume]);

  const onTouchStart = (e) => { touchXRef.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchXRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchXRef.current;
    touchXRef.current = null;
    if (Math.abs(dx) < 60) return; // desktop için eşiği biraz artırdık
    if (dx < 0) goNext(); else goPrev();
  };

  // === CRUD & Replies ===
  const doDelete = async () => {
    const currentItem = current;
    if (!currentItem) return;
    try {
      let sref = null;
      if (currentItem.storagePath) {
        sref = storageRef(storage, currentItem.storagePath);
      } else if (currentItem.mediaUrl) {
        sref = storageRef(storage, currentItem.mediaUrl);
      }
      if (sref) await deleteObject(sref).catch(()=>{});

      if (currentItem.id) await deleteDoc(doc(db, "hikayeler", currentItem.id));

      setItems(prev => {
        const next = prev.filter(s => s.id !== currentItem.id);
        if (idx >= next.length) {
          if (next.length === 0) onClose?.();
          else setIdx(next.length - 1);
        }
        return next;
      });
    } catch (e) {
      console.error("Hikaye silme hatası:", e);
      alert("Hikaye silinirken bir hata oluştu.");
    } finally {
      setConfirmOpen(false);
      setMenuOpen(false);
    }
  };

  const sendTextReply = async () => {
    const text = replyText.trim();
    if (!text || !current || isOwner || !me) return;
    try {
      await addDoc(collection(db, "story_replies"), {
        storyId: current.id,
        toUserId: current.authorId,
        fromUserId: me,
        type: "text",
        text,
        createdAt: serverTimestamp(),
      });
      setReplyText("");
    } catch (e) {
      console.error("Yanıt gönderilemedi:", e);
    }
  };

  const sendReaction = async (emoji) => {
    if (!current || isOwner || !me) return;
    try {
      await addDoc(collection(db, "story_replies"), {
        storyId: current.id,
        toUserId: current.authorId,
        fromUserId: me,
        type: "reaction",
        emoji,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Reaksiyon gönderilemedi:", e);
    }
  };

  if (!items || items.length === 0) return null;

  // === SVG ikonları ===
  const Icon = {
    Play: () => (<svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7z"></path></svg>),
    Pause: () => (<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 5h4v14H6zM14 5h4v14h-4z"></path></svg>),
    VolumeOn: () => (<svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 10v4h4l5 5V5L7 10H3z"></path><path d="M14 3.23v17.54c4.01-1.16 7-4.93 7-9.02s-2.99-7.86-7-8.52z"></path></svg>),
    VolumeOff: () => (<svg viewBox="0 0 24 24" width="20" height="20"><path d="M16.5 12a4.5 4.5 0 0 1-1.2 3.1l1.4 1.4A6.5 6.5 0 0 0 18.5 12c0-1.7-.7-3.3-1.8-4.5l-1.4 1.4c.8.8 1.2 1.9 1.2 3.1z"></path><path d="M3 10v4h4l5 5V5L7 10H3z"></path><path d="m19 5-14 14"></path></svg>),
    Dots: () => (<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>),
    Close: () => (<svg viewBox="0 0 24 24" width="22" height="22"><path d="M18 6 6 18M6 6l12 12"></path></svg>),
    Send: () => (<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 11l18-8-8 18-2-6-6-4z"></path></svg>)
  };

  // === Render ===
  return (
    <div className="storyDk-overlay" onClick={onClose}>
      <div
        className={`storyDk-content ${paused ? "is-paused" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Media */}
        <div
          className="storyDk-media"
          onPointerDown={pause}
          onPointerUp={resume}
          onPointerLeave={resume}
        >
          {isVideo ? (
            <video ref={mediaRef} src={current.mediaUrl} muted={muted} playsInline autoPlay />
          ) : (
            <img ref={mediaRef} src={current.mediaUrl} alt="Hikaye" draggable="false" />
          )}
        </div>

        {/* Header */}
        <div className="storyDk-header">
          <div className="storyDk-progress">
            {items.map((_, i) => (
              <div key={i} className="pbar-bg">
                <div
                  className="pbar-fg"
                  style={{ width: `${i < idx ? 100 : i === idx ? progress : 0}%` }}
                />
              </div>
            ))}
          </div>

          <div className="storyDk-headrow">
            <div className="user">
              <img src={current.authorProfilePic || "https://placehold.co/32x32/EFEFEF/AAAAAA?text=P"} alt={current.authorUsername} />
              <span className="uname">{current.authorUsername}</span>
              {!!current.createdAt && (
                <span className="time">{timeAgo(current.createdAt)} önce</span>
              )}
            </div>

            <div className="actions">
              {/* Ses */}
              {isVideo && (
                <button className="icon" title={muted ? "Sesi Aç" : "Sesi Kapat"} onClick={(e)=>{e.stopPropagation(); setMuted(m=>!m);}}>
                  {muted ? <Icon.VolumeOff/> : <Icon.VolumeOn/>}
                </button>
              )}
              {/* Duraklat/Oynat */}
              <button className="icon" title={paused ? "Oynat" : "Duraklat"} onClick={(e)=>{e.stopPropagation(); togglePause();}}>
                {paused ? <Icon.Play/> : <Icon.Pause/>}
              </button>
              {/* Üç nokta */}
              <button className="icon" title="Diğer" onClick={(e)=>{e.stopPropagation(); setMenuOpen(v=>!v);}}>
                <Icon.Dots/>
              </button>
              {/* Kapat */}
              <button className="icon" title="Kapat" onClick={onClose}>
                <Icon.Close/>
              </button>
            </div>
          </div>
        </div>

        {/* Üç nokta menüsü (merkez modal gibi) */}
        {menuOpen && (
          <div className="storyDk-menulayer" onClick={()=>setMenuOpen(false)}>
            <div className="storyDk-menu" onClick={(e)=>e.stopPropagation()}>
              {isOwner ? (
                <>
                  <button className="mitem" onClick={()=>{ /* paylaş akışı: sonra */ }}>{"Paylaş…"}</button>
                  <button className="mitem" onClick={()=>{ /* istatistik akışı: sonra */ }}>{"İstatistikleri gör"}</button>
                  <button className="mitem danger" onClick={()=>setConfirmOpen(true)}>{"Sil"}</button>
                  <button className="mitem" onClick={()=>setMenuOpen(false)}>{"İptal"}</button>
                </>
              ) : (
                <>
                  <div className="mtitle">Uygunsuz İçeriği Şikayet Et</div>
                  <button className="mitem" onClick={()=>{ /* rapor akışı: sonra */ }}>{"Bu hesap hakkında"}</button>
                  <button className="mitem" onClick={()=>setMenuOpen(false)}>{"İptal"}</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Sil onayı */}
        {confirmOpen && (
          <div className="storyDk-confirmlayer" onClick={()=>setConfirmOpen(false)}>
            <div className="storyDk-confirm" onClick={(e)=>e.stopPropagation()}>
              <div className="title">Hikayeyi sil?</div>
              <div className="actions">
                <button className="btn" onClick={()=>setConfirmOpen(false)}>İptal</button>
                <button className="btn danger" onClick={doDelete}>Sil</button>
              </div>
            </div>
          </div>
        )}

        {/* Alt bar */}
        <div className="storyDk-bottom">
          {isOwner ? (
            <div className="seenrow">
              <div className="avatars">
                {[0,1,2].map((i) => (
                  <span
                    key={i}
                    className={`av av${i+1}`}
                    style={{ backgroundImage: `url(${lastViewers[i] || "https://placehold.co/24x24/EFEFEF/AAAAAA?text=P"})` }}
                  />
                ))}
              </div>
              <span className="seentext">{(current.viewersCount ?? 0).toLocaleString()} kişi gördü</span>
            </div>
          ) : (
            <div className="replyrow">
              <div className="inputwrap">
                <input
                  value={replyText}
                  onChange={(e)=>setReplyText(e.target.value)}
                  placeholder={`${current.authorUsername}’e yanıt ver…`}
                  onKeyDown={(e)=>{ if(e.key === 'Enter'){ e.preventDefault(); sendTextReply(); } }}
                />
                <button className="send" onClick={sendTextReply}><Icon.Send/></button>
              </div>

              <div className="emojis">
                {quickEmojis.map((em) => (
                  <button key={em} className="emoji" onClick={()=>sendReaction(em)}>{em}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tıklama alanları */}
        <button className="storyDk-nav prev" onClick={goPrev} aria-label="Geri" />
        <button className="storyDk-nav next" onClick={goNext} aria-label="İleri" />
      </div>
    </div>
  );
}

export default StoryModalDesktop;
