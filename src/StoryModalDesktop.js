// =============================================
// StoryModalDesktop.js — rev.fix + ★ Rating V2 entegrasyonu
// - Var olan davranışlar korunur (pause, oklar, menüler, spinner, 9:16)
// - Üst: SAHİP → [Pause/Play, Close] | DİĞER → [Pause/Play, Dots, Close]
// - Alt: Kalp yok; ★ yıldız (viewer etkileşimli, owner disabled)
// - ★ alanına basılıyken progress durur; bırakınca devam eder
// - body'ye sınıf ekle (animasyon kontrolü/kill-switch)
// =============================================

import React, { useEffect, useRef, useState, useCallback } from "react";
import { auth, db, storage } from "./firebase";
import {
  deleteDoc, doc, addDoc, collection, serverTimestamp, runTransaction,
} from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import "./StoryModalDesktop.css";

/* ★ V2 */
import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { rateContent } from "./reputationClient";

function StoryModalDesktop({ stories, onClose, onShowInsights, onPromote, onAccountInfo }) {
  const [items, setItems] = useState(() => stories || []);
  useEffect(() => { setItems(stories || []); }, [stories]);

  // Hikaye açıkken body'ye sınıf ekle
  useEffect(() => {
    document.body.classList.add("mylasa-stories-open");
    return () => { document.body.classList.remove("mylasa-stories-open"); };
  }, []);

  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false); // varsayılan sesli
  const [menuOpen, setMenuOpen] = useState(false);   // alt “Daha Fazla”
  const [kebabOpen, setKebabOpen] = useState(false); // üst üç nokta (yalnızca başkasında)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [replyText, setReplyText] = useState("");

  const me = auth.currentUser?.uid || null;
  const current = items?.[idx];
  const isVideo = !!current?.mediaType && current.mediaType.startsWith("video");
  const isOwner = !!current && current.authorId === me;

  /* Rating contentId */
  const CONTENT_ID = current?.id ? `story_${current.id}` : `story_${current?.authorId || "x"}_${idx}`;

  // ---- Refs (performans & akış) ----
  const mediaRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const pauseAccumRef = useRef(0);
  const pauseStartRef = useRef(0);
  const viewedOnceRef = useRef(new Set());
  const touchXRef = useRef(null);

  const activeBarRef = useRef(null);

  const pausedRef = useRef(false);
  const menuOpenRef = useRef(false);
  const confirmOpenRef = useRef(false);
  const kebabOpenRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { menuOpenRef.current = menuOpen; }, [menuOpen]);
  useEffect(() => { confirmOpenRef.current = confirmOpen; }, [confirmOpen]);
  useEffect(() => { kebabOpenRef.current = kebabOpen; }, [kebabOpen]);

  // ---- Story değişimi: reset ----
  useEffect(() => {
    if (!current) return;
    setPaused(false);
    setMenuOpen(false);
    setKebabOpen(false);
    setConfirmOpen(false);
    setReplyText("");
    setBuffering(true);
    pauseAccumRef.current = 0;
    pauseStartRef.current = 0;
    startRef.current = performance.now();
    if (activeBarRef.current) activeBarRef.current.style.width = "0%";

    // 750ms sonra tek sefer “görüldü”
    const sid = current.id || `${current.authorId}_${idx}`;
    if (!viewedOnceRef.current.has(sid)) {
      const t = setTimeout(async () => {
        viewedOnceRef.current.add(sid);
        try {
          if (current.id && me && current.authorId !== me) {
            await runTransaction(db, async (tx) => {
              const r = await tx.get(doc(db, "hikayeler", current.id));
              if (!r.exists()) return;
              const data = r.data();
              const arr = Array.isArray(data.izleyenler) ? data.izleyenler : [];
              if (!arr.includes(me)) {
                tx.update(doc(db, "hikayeler", current.id), {
                  izleyenler: [...arr, me],
                  viewersCount: (data.viewersCount || 0) + 1,
                });
              }
            });
          }
        } catch {}
      }, 750);
      return () => clearTimeout(t);
    }
  }, [current, idx, me]);

  // ---- Oynatma & Progress (ref ile) ----
  useEffect(() => {
    if (!current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const node = mediaRef.current;
    const markReady = () => node && node.classList.add("is-ready");

    if (isVideo) {
      const v = node;
      if (!v) return;

      const onLoaded = () => { markReady(); tryPlay(v); };
      const onPlaying = () => { setBuffering(false); markReady(); };
      const onWaiting = () => setBuffering(true);
      const onEnded = () => goNext();

      v.muted = muted;
      v.playsInline = true;
      v.autoplay = true;

      v.addEventListener("loadedmetadata", onLoaded);
      v.addEventListener("playing", onPlaying);
      v.addEventListener("waiting", onWaiting);
      v.addEventListener("stalled", onWaiting);
      v.addEventListener("ended", onEnded);
      v.addEventListener("error", onPlaying);

      const tick = () => {
        const block = pausedRef.current || menuOpenRef.current || confirmOpenRef.current || kebabOpenRef.current;
        if (!block && v && v.duration > 0 && activeBarRef.current) {
          const pct = Math.min(100, (v.currentTime / v.duration) * 100);
          activeBarRef.current.style.width = pct + "%";
        }
        if (v && !v.ended) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      tryPlay(v);

      return () => {
        v.pause?.();
        v.removeEventListener("loadedmetadata", onLoaded);
        v.removeEventListener("playing", onPlaying);
        v.removeEventListener("waiting", onWaiting);
        v.removeEventListener("stalled", onWaiting);
        v.removeEventListener("ended", onEnded);
        v.removeEventListener("error", onPlaying);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    // FOTOĞRAF — 5sn
    const img = node;
    const ready = () => { setBuffering(false); markReady(); };
    if (img && img.tagName === "IMG") {
      img.addEventListener("load", ready);
      img.addEventListener("error", ready);
      if (img.complete) ready();
    }

    const DURATION = 5000;
    startRef.current = performance.now();
    const tick = (now) => {
      const block = pausedRef.current || menuOpenRef.current || confirmOpenRef.current || kebabOpenRef.current;
      if (!block) {
        const elapsed = now - startRef.current - pauseAccumRef.current;
        const pct = Math.min(100, (elapsed / DURATION) * 100);
        if (activeBarRef.current) activeBarRef.current.style.width = pct + "%";
        if (pct >= 100) { goNext(); return; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [idx, isVideo, muted, current]);

  // görünürlük
  useEffect(() => {
    const onVis = () => setPaused(document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // paused/menu değişince videoyu senkronize et
  useEffect(() => {
    const v = mediaRef.current;
    const shouldPause = paused || menuOpen || confirmOpen || kebabOpen;
    if (!v || v.tagName !== "VIDEO") return;
    if (shouldPause) v.pause?.(); else tryPlay(v);
  }, [paused, menuOpen, confirmOpen, kebabOpen, isVideo]);

  // --- helpers
  const tryPlay = (v) => { v.play?.().catch(() => {}); };

  // --- nav
  const goNext = useCallback(() => {
    if (idx < items.length - 1) setIdx(i => i + 1);
    else onClose?.();
  }, [idx, items.length, onClose]);

  const goPrev = useCallback(() => { if (idx > 0) setIdx(i => i - 1); }, [idx]);

  const pauseAll = useCallback(() => {
    if (pausedRef.current) return;
    setPaused(true);
    pauseStartRef.current = performance.now();
    const v = mediaRef.current;
    if (v && v.tagName === "VIDEO") v.pause?.();
  }, []);

  const resumeAll = useCallback(() => {
    if (!pausedRef.current) return;
    setPaused(false);
    pauseAccumRef.current += performance.now() - pauseStartRef.current;
    const v = mediaRef.current;
    if (v && v.tagName === "VIDEO") tryPlay(v);
  }, []);

  // ★ rate handler
  const onRate = useCallback(async (value) => {
    try {
      if (!current?.authorId) return;
      await rateContent({
        contentId: CONTENT_ID,
        authorId: current.authorId,
        value,
        type: "story",
      });
    } catch (e) {
      console.error("Rating gönderilemedi:", e);
    }
  }, [CONTENT_ID, current?.authorId]);

  // swipe (touch destek)
  const onTouchStart = (e) => { touchXRef.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchXRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchXRef.current;
    touchXRef.current = null;
    if (Math.abs(dx) < 60) return;
    if (dx < 0) goNext(); else goPrev();
  };

  // klavye
  useEffect(() => {
    const onKey = (e) => {
      if (menuOpen || confirmOpen || kebabOpen) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === " ") { e.preventDefault(); pausedRef.current ? resumeAll() : pauseAll(); }
      else if (e.key === "m" || e.key === "M") { setMuted(m => !m); }
      else if (e.key === "Escape") { onClose?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, onClose, menuOpen, confirmOpen, kebabOpen, resumeAll, pauseAll]);

  const interact = (cb) => (e) => {
    e.stopPropagation();
    const v = mediaRef.current;
    if (v && v.tagName === "VIDEO") {
      try { if (v.muted) { v.muted = false; setMuted(false); } tryPlay(v); } catch {}
    }
    cb?.();
  };

  const stopBubble = (e) => e.stopPropagation();

  // ★ alanına basılıyken otomatik duraklat/başlat
  const onStarPointerDown = interact(pauseAll);
  const onStarPointerUp = interact(resumeAll);

  // preload next
  useEffect(() => {
    const next = items[idx + 1];
    if (!next?.mediaUrl) return;
    if (next.mediaType?.startsWith("video")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = next.mediaUrl;
    } else {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.src = next.mediaUrl;
    }
  }, [items, idx]);

  // CRUD
  const doDelete = async () => {
    const s = current;
    if (!s) return;
    try {
      if (s.storagePath) await deleteObject(storageRef(storage, s.storagePath)).catch(() => {});
      if (s.id) await deleteDoc(doc(db, "hikayeler", s.id));
      setItems(prev => {
        const next = prev.filter(x => x.id !== s.id);
        if (idx >= next.length) { if (next.length === 0) onClose?.(); else setIdx(next.length - 1); }
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
        storyId: current.id, toUserId: current.authorId, fromUserId: me,
        type: "text", text, createdAt: serverTimestamp(),
      });
      setReplyText("");
    } catch (e) { console.error("Yanıt gönderilemedi:", e); }
  };

  const sendReaction = async (emoji) => {
    if (!current || isOwner || !me) return;
    try {
      await addDoc(collection(db, "story_replies"), {
        storyId: current.id, toUserId: current.authorId, fromUserId: me,
        type: "reaction", emoji, createdAt: serverTimestamp(),
      });
    } catch (e) { console.error("Reaksiyon gönderilemedi:", e); }
  };

  if (!items || items.length === 0) return null;

  const Icon = {
    Play: () => (<svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7z"></path></svg>),
    Pause: () => (<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 5h4v14H6zM14 5h4v14h-4z"></path></svg>),
    Close: () => (<svg viewBox="0 0 24 24" width="22" height="22"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"></path></svg>),
    Dots:  () => (<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>),
    Eye:   () => (<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>),
    NavArrow: () => (<svg viewBox="0 0 24 24" width="24" height="24"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" fill="#FFF"></path></svg>),
    Spinner: () => (<span className="storyDk-spin" aria-hidden="true" />),
  };

  return (
    <div className="storyDk-overlay" onClick={onClose} aria-label="Hikaye kapat">
      {idx > 0 && (
        <button className="storyDk-arrow prev" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label="Önceki">
          <div style={{ transform: "scaleX(-1)" }}><Icon.NavArrow /></div>
        </button>
      )}

      <div
        className={`storyDk-content ${paused ? "is-paused" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* medya */}
        <div className="storyDk-media" onPointerDown={pauseAll} onPointerUp={resumeAll} onPointerLeave={resumeAll}>
          {isVideo ? (
            <video ref={mediaRef} src={current.mediaUrl} muted={muted} playsInline autoPlay />
          ) : (
            <img ref={mediaRef} src={current.mediaUrl} alt="Hikaye" draggable="false" />
          )}
          <div className={`storyDk-buffer ${buffering ? "show" : ""}`}><Icon.Spinner /></div>
        </div>

        {/* header */}
        <div className="storyDk-header">
          <div className="storyDk-progress">
            {items.map((_, i) => (
              <div key={i} className="pbar-bg">
                <div
                  className="pbar-fg"
                  ref={i === idx ? activeBarRef : null}
                  style={{ width: i < idx ? "100%" : "0%" }}
                />
              </div>
            ))}
          </div>

          <div className="storyDk-headrow">
            <div className="user">
              <img src={current.authorProfilePic || "https://placehold.co/32x32/EFEFEF/AAAAAA?text=P"} alt={current.authorUsername} />
              <span className="uname">{current.authorUsername}</span>
            </div>

            <div className="actions">
              {!isOwner && (
                <button className="icon" title="Diğer" onClick={() => setKebabOpen(v => !v)} aria-haspopup="menu" aria-expanded={kebabOpen}>
                  <Icon.Dots />
                </button>
              )}
              <button className="icon" title={paused ? "Oynat" : "Duraklat"} onClick={interact(() => (paused ? resumeAll() : pauseAll()))}>
                {paused ? <Icon.Play /> : <Icon.Pause />}
              </button>
              <button className="icon" title="Kapat" onClick={onClose}><Icon.Close /></button>
            </div>
          </div>
        </div>

        {/* bottom */}
        <div className="storyDk-bottom" onClick={stopBubble}>
          {isOwner ? (
            <div className="owner-actions">
              <div className="seen-by">
                <Icon.Eye /><span>{(current?.viewersCount ?? 0).toLocaleString()} kişi gördü</span>
              </div>

              {/* OWNER: ★ disabled + meta */}
              <div
                className="storyDk-stars"
                onPointerDown={onStarPointerDown}
                onPointerUp={onStarPointerUp}
                onClick={stopBubble}
              >
                <StarRatingV2
                  onRate={onRate}
                  size={26}
                  disabled
                />
                <span className="mr-meta">Puanlar</span>
              </div>

              <div className="owner-buttons">
                <button className="icon-btn">Öne Çıkar</button>
                <button className="icon-btn" onClick={() => setMenuOpen(true)}>Daha Fazla</button>
              </div>
            </div>
          ) : (
            <>
              {/* VIEWER: ★ etkileşim + meta */}
              <div
                className="storyDk-stars"
                aria-label="Hikâyeyi oyla"
                onPointerDown={onStarPointerDown}
                onPointerUp={onStarPointerUp}
                onClick={stopBubble}
              >
                <StarRatingV2
                  onRate={onRate}
                  size={26}
                  disabled={!me}
                />
                <span className="mr-meta">Puanla</span>
              </div>

              <ViewerReply
                replyText={replyText}
                setReplyText={setReplyText}
                pause={pauseAll}
                resume={resumeAll}
                sendTextReply={sendTextReply}
                sendReaction={(em) => sendReaction(em)}
              />
            </>
          )}
        </div>

        {/* görünmez tap-zones */}
        <button className="storyDk-nav prev" onClick={interact(goPrev)} aria-label="Geri" />
        <button className="storyDk-nav next" onClick={interact(goNext)} aria-label="İleri" />
      </div>

      {idx < items.length - 1 && (
        <button className="storyDk-arrow next" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label="Sonraki">
          <Icon.NavArrow />
        </button>
      )}

      {/* üst üç nokta menüsü (başkasında) */}
      <div className={`storyDk-kebablayer ${kebabOpen ? "show" : ""}`} onClick={() => setKebabOpen(false)}>
        <div className="storyDk-kebab" onClick={(e) => e.stopPropagation()}>
          <div className="mtitle">Uygunsuz içeriği şikayet et</div>
          <button className="mitem" onClick={() => onAccountInfo?.(current)}>Bu hesap hakkında</button>
          <button className="mitem" onClick={() => setKebabOpen(false)}>İptal</button>
        </div>
      </div>

      {/* alt menü (sadece buradan sil) */}
      <div className={`storyDk-menulayer ${menuOpen ? "visible" : ""}`} onClick={() => setMenuOpen(false)}>
        <div className="storyDk-menu" onClick={(e) => e.stopPropagation()}>
          <div className="dragbar" />
          <button className="mitem danger" onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}>Sil</button>
          <button className="mitem" onClick={() => onAccountInfo?.(current)}>Bu hesap hakkında</button>
          <button className="mitem" onClick={() => onShowInsights?.(current)}>İstatistikleri gör</button>
          <button className="mitem" onClick={() => onPromote?.(current)}>Hikâyenin tanıtımını yap</button>
          <button className="mitem" onClick={() => setMenuOpen(false)}>İptal</button>
        </div>
      </div>

      {/* sil onayı */}
      <div className={`storyDk-confirmlayer ${confirmOpen ? "show" : ""}`} onClick={() => setConfirmOpen(false)}>
        <div className="storyDk-confirm" onClick={(e) => e.stopPropagation()}>
          <div className="title">Hikayeyi sil?</div>
          <div className="actions">
            <button className="btn" onClick={() => setConfirmOpen(false)}>İptal</button>
            <button className="btn danger" onClick={doDelete}>Sil</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewerReply({ replyText, setReplyText, pause, resume, sendTextReply, sendReaction }) {
  const emojis = ["❤️", "😂", "😮", "😍", "😢", "👏"];
  return (
    <div className="replyrow">
      <div className="inputwrap">
        <input
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Yanıt yaz…"
          onFocus={pause}
          onBlur={resume}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendTextReply(); } }}
        />
        <button className="send" onClick={sendTextReply} aria-label="Yanıt gönder">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 11l18-8-8 18-2-6-6-4z"></path></svg>
        </button>
      </div>
      <div className="emojis">
        {emojis.map((em) => (
          <button key={em} className="emoji" onClick={() => sendReaction(em)} aria-label={`Reaksiyon ${em}`}>{em}</button>
        ))}
      </div>
    </div>
  );
}

export default StoryModalDesktop;
