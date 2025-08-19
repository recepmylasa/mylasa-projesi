// ==================================================
// StoryModalMobile.js — ★ Rating V2 entegrasyonu (scoped class fix)
// - Tüm davranışlar korunur (pause, tap-zones, menü, spinner)
// - Global çakışmaları önlemek için .icon/.user/.actions vb. sınıflar storyMb-* olarak adlandırıldı
// ==================================================

import React, { useEffect, useRef, useState, useCallback } from "react";
import { auth, db, storage } from "./firebase";
import {
  deleteDoc, doc, addDoc, collection, serverTimestamp,
  onSnapshot, runTransaction
} from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import "./StoryModalMobile.css";

/* ★ V2 */
import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { rateContent } from "./reputationClient";

const Icon = {
  Play: () => (<svg aria-label="Oynat" fill="currentColor" height="22" viewBox="0 0 24 24" width="22"><path d="M6 4v16l13-8L6 4z"></path></svg>),
  Pause: () => (<svg aria-label="Duraklat" fill="currentColor" height="22" viewBox="0 0 24 24" width="22"><path d="M6 4h4v16H6zm8 0h4v16h-4z"></path></svg>),
  Close: () => (<svg aria-label="Kapat" fill="currentColor" height="28" viewBox="0 0 24 24" width="28"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"></path></svg>),
  Send: () => (<svg aria-label="Gönder" fill="currentColor" height="24" viewBox="0 0 24 24" width="24"><path d="M3 11l18-8-8 18-2-6-6-4z"></path></svg>),
  Highlight: () => (<svg aria-label="Öne Çıkar" fill="currentColor" height="24" viewBox="0 0 24 24" width="24"><path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zM9.71 13.58l-2.12 2.12h8.82l-2.12-2.12a3 3 0  0 0-4.58 0zM12 7a1.5 1.5 0 1 0 1.5 1.5A1.5 1.5 0 0 0 12 7z"></path></svg>),
  Seen: () => (<svg aria-label="Görüldü" fill="currentColor" height="16" viewBox="0 0 24 24" width="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zm11 5a5 5 0 1 0 0-10 5 5 0  0 0 0 10z"></path></svg>),
  Spinner: () => (<span className="storyMb-spin" aria-hidden="true" />),
};

function StoryModalMobile({ stories, onClose }) {
  const [items, setItems] = useState(() => stories || []);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // Videolar sesli başlasın (autoplay engellenirse ilk etkileşimde açılır)
  const [muted, setMuted] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [replyText, setReplyText] = useState("");

  const [buffering, setBuffering] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);

  const [viewCount, setViewCount] = useState(0);

  useEffect(() => { setItems(stories || []); }, [stories]);

  // Hikaye açıkken body'ye sınıf ekle, kapatınca kaldır
  useEffect(() => {
    document.body.classList.add("mylasa-stories-open");
    return () => { document.body.classList.remove("mylasa-stories-open"); };
  }, []);

  const me = auth.currentUser?.uid || null;
  const current = items?.[idx];
  const isVideo = !!current?.mediaType && current.mediaType.startsWith("video");
  const isOwner = !!current && current.authorId === me;

  /* Rating contentId (tekil) */
  const CONTENT_ID = current?.id ? `story_${current.id}` : `story_${current?.authorId || "x"}_${idx}`;

  const mediaRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const pauseAccumRef = useRef(0);
  const pauseStartRef = useRef(0);
  const touchXRef = useRef(null);
  const activeBarRef = useRef(null);
  const viewedOnceRef = useRef(new Set());

  const pausedRef = useRef(false);
  const menuOpenRef = useRef(false);
  const confirmOpenRef = useRef(false);
  const spinnerTimerRef = useRef(null);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { menuOpenRef.current = menuOpen; }, [menuOpen]);
  useEffect(() => { confirmOpenRef.current = confirmOpen; }, [confirmOpen]);
  useEffect(() => () => clearTimeout(spinnerTimerRef.current), []);

  const setBufferingSmart = useCallback((val) => {
    setBuffering(val);
    clearTimeout(spinnerTimerRef.current);
    if (val) {
      spinnerTimerRef.current = setTimeout(() => setShowSpinner(true), 180);
    } else {
      setShowSpinner(false);
    }
  }, []);

  const normalizeBars = useCallback((activeIndex) => {
    const nodes = document.querySelectorAll('.storyMb-progress .pbar-fg');
    nodes.forEach((el, i) => {
      el.style.transition = 'none';
      el.style.width = i < activeIndex ? '100%' : (i === activeIndex ? '0%' : '0%');
      requestAnimationFrame(() => { el.style.transition = ''; });
    });
  }, []);

  const pause = useCallback(() => {
    if (pausedRef.current) return;
    setPaused(true);
    pauseStartRef.current = performance.now();
    const v = mediaRef.current;
    if (v && v.tagName === "VIDEO") v.pause?.();
  }, []);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    setPaused(false);
    pauseAccumRef.current += performance.now() - pauseStartRef.current;
    const v = mediaRef.current;
    if (v && v.tagName === "VIDEO" && !menuOpenRef.current && !confirmOpenRef.current) {
      v.play?.().catch(() => {});
    }
  }, []);

  // dokunmada: videoyu oynat + sesi aç (fallback)
  const handleInteraction = (cb) => (e) => {
    e?.stopPropagation?.();
    const v = mediaRef.current;
    if (v && v.tagName === "VIDEO") {
      if (v.paused) v.play?.().catch(()=>{});
      if (v.muted) { v.muted = false; setMuted(false); }
    }
    cb?.();
  };

  /* Yıldız/alt bar tıklamalarında üst katmana gitmesin */
  const stopBubble = (e) => { e.stopPropagation(); };

  // ★ alanına dokunurken duraklat, bırakınca devam et
  const onStarPointerDown = handleInteraction(pause);
  const onStarPointerUp   = handleInteraction(resume);

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

  const closeAndReset = useCallback(() => {
    setIdx(0);
    onClose?.();
  }, [onClose]);

  const goNext = useCallback(() => {
    if (idx < items.length - 1) {
      const ni = idx + 1;
      normalizeBars(ni);
      setIdx(ni);
    } else {
      closeAndReset();
    }
  }, [idx, items.length, closeAndReset, normalizeBars]);

  const goPrev = useCallback(() => {
    if (idx > 0) {
      const pi = idx - 1;
      normalizeBars(pi);
      setIdx(pi);
    }
  }, [idx, normalizeBars]);

  // Görüldü sayacı
  useEffect(() => {
    if (!current?.id) { setViewCount(0); return; }
    const unsub = onSnapshot(doc(db, "hikayeler", current.id), (d) => {
      setViewCount(d.data()?.viewersCount || 0);
    });
    return () => unsub();
  }, [current?.id]);

  // Story değişince reset
  useEffect(() => {
    if (!current) return;
    setPaused(false);
    setMenuOpen(false);
    setConfirmOpen(false);
    setDeleteTarget(null);
    setReplyText("");
    setBufferingSmart(true);
    pauseAccumRef.current = 0;
    pauseStartRef.current = 0;
    startRef.current = performance.now();
    if (activeBarRef.current) activeBarRef.current.style.width = "0%";
    normalizeBars(idx);

    if (mediaRef.current) mediaRef.current.style.opacity = '0';

    // görüldü (tek sefer)
    const sid = current.id || `${current.authorId}_${idx}`;
    if (!viewedOnceRef.current.has(sid)) {
      const t = setTimeout(async () => {
        viewedOnceRef.current.add(sid);
        if (current.id && me && current.authorId !== me) {
          try {
            await runTransaction(db, async (tx) => {
              const storyRef = doc(db, "hikayeler", current.id);
              const storyDoc = await tx.get(storyRef);
              if (!storyDoc.exists()) return;
              const data = storyDoc.data();
              const viewers = Array.isArray(data.izleyenler) ? data.izleyenler : [];
              if (!viewers.includes(me)) {
                tx.update(storyRef, {
                  izleyenler: [...viewers, me],
                  viewersCount: (data.viewersCount || 0) + 1,
                });
              }
            });
          } catch {}
        }
      }, 750);
      return () => clearTimeout(t);
    }
  }, [current, idx, me, normalizeBars, setBufferingSmart]);

  // Preload next
  useEffect(() => {
    const next = items[idx + 1];
    if (!next?.mediaUrl) return;
    if (next.mediaType?.startsWith("video")) {
      const v = document.createElement("video");
      v.preload = "auto";
      v.src = next.mediaUrl;
    } else {
      new Image().src = next.mediaUrl;
    }
  }, [items, idx]);

  // Medya + progress
  useEffect(() => {
    if (!current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const v = mediaRef.current;

    if (isVideo) {
      if (!v) return;
      const onCanPlay = () => {
        setBufferingSmart(false);
        if (mediaRef.current) mediaRef.current.style.opacity = '1';
      };
      const onWaiting = () => setBufferingSmart(true);
      const onPlaying = () => {
        setBufferingSmart(false);
        if (mediaRef.current) mediaRef.current.style.opacity = '1';
      };
      const onEnded = () => goNext();
      const onStalled = () => setBufferingSmart(true);
      const onError = () => setBufferingSmart(false);

      v.muted = muted;
      v.playsInline = true;
      v.autoplay = true;

      const tryPlay = () => {
        const p = v.play?.();
        if (p && typeof p.then === "function") {
          p.catch(() => {
            v.muted = true;
            setMuted(true);
            v.play?.().catch(()=>{});
          });
        }
      };
      tryPlay();

      v.addEventListener("canplay", onCanPlay);
      v.addEventListener("waiting", onWaiting);
      v.addEventListener("playing", onPlaying);
      v.addEventListener("ended", onEnded);
      v.addEventListener("stalled", onStalled);
      v.addEventListener("error", onError);

      const tick = () => {
        const blocked = pausedRef.current || menuOpenRef.current || confirmOpenRef.current;
        if (!blocked && activeBarRef.current && v.duration > 0) {
          const pct = Math.min(100, (v.currentTime / v.duration) * 100);
          activeBarRef.current.style.width = pct + "%";
        }
        if (v && !v.ended) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      return () => {
        v.pause?.();
        v.removeEventListener("canplay", onCanPlay);
        v.removeEventListener("waiting", onWaiting);
        v.removeEventListener("playing", onPlaying);
        v.removeEventListener("ended", onEnded);
        v.removeEventListener("stalled", onStalled);
        v.removeEventListener("error", onError);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    // IMAGE
    const img = mediaRef.current;
    const handleDone = () => {
      setBufferingSmart(false);
      if (mediaRef.current) mediaRef.current.style.opacity = '1';
    };
    if (img && img.tagName === "IMG") {
      img.addEventListener("load", handleDone);
      img.addEventListener("error", handleDone);
      if (img.complete) handleDone();
    }

    const DURATION = 5000;
    startRef.current = performance.now();
    const tick = (now) => {
      const blocked = pausedRef.current || menuOpenRef.current || confirmOpenRef.current;
      if (!blocked) {
        const elapsed = now - startRef.current - pauseAccumRef.current;
        const pct = Math.min(100, (elapsed / DURATION) * 100);
        if (activeBarRef.current) activeBarRef.current.style.width = pct + "%";
        if (pct >= 100) { goNext(); return; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (img) {
        img.removeEventListener("load", handleDone);
        img.removeEventListener("error", handleDone);
      }
    };
  }, [idx, isVideo, muted, current, goNext, setBufferingSmart]);

  // görünürlükte pause/resume
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") pause();
      else resume();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pause, resume]);

  // menü/confirm açılınca duraklat
  useEffect(() => {
    if (menuOpen || confirmOpen) pause();
    else resume();
  }, [menuOpen, confirmOpen, pause, resume]);

  // swipe
  const onTouchStart = (e) => { touchXRef.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchXRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchXRef.current;
    touchXRef.current = null;
    if (Math.abs(dx) < 60) return;
    const v = mediaRef.current;
    if (v && v.tagName === "VIDEO" && v.muted) { v.muted = false; setMuted(false); }
    if (dx < 0) goNext(); else goPrev();
  };

  // Sil
  const doDelete = async () => {
    const target = deleteTarget || { id: current?.id, storagePath: current?.storagePath };
    if (!target?.id) return;
    try {
      if (target.storagePath) await deleteObject(storageRef(storage, target.storagePath)).catch(()=>{});
      await deleteDoc(doc(db, "hikayeler", target.id));
      setItems(prev => {
        const next = prev.filter(x => x.id !== target.id);
        if (next.length === 0) {
          closeAndReset();
        } else if (idx >= next.length) {
          setIdx(next.length - 1);
        }
        return next;
      });
    } catch (e) {
      console.error("Hikaye silme hatası:", e);
    } finally {
      setConfirmOpen(false);
      setDeleteTarget(null);
      setPaused(false);
    }
  };

  // Yanıt (metin)
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

  if (!items || items.length === 0) return null;

  return (
    <div className="storyMb-overlay" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="storyMb-content" onClick={handleInteraction(()=>{})}>
        <div
          className="storyMb-media"
          onPointerDown={handleInteraction(pause)}
          onPointerUp={handleInteraction(resume)}
          onPointerLeave={handleInteraction(resume)}
          onPointerCancel={handleInteraction(resume)}
        >
          {isVideo ? (
            <video
              key={current.id || `${current.mediaUrl}-v`}
              ref={mediaRef}
              src={current.mediaUrl}
              playsInline
              autoPlay
              muted={muted}
            />
          ) : (
            <img
              key={current.id || `${current.mediaUrl}-i`}
              ref={mediaRef}
              src={current.mediaUrl}
              alt="Hikaye"
              draggable="false"
            />
          )}
          {showSpinner && (<div className="storyMb-buffer"><Icon.Spinner /></div>)}
        </div>

        <div className="storyMb-header">
          <div className="storyMb-progress">
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

          <div className="storyMb-headrow">
            <div className="storyMb-user">
              <img src={current.authorProfilePic || "https://placehold.co/32x32/EFEFEF/AAAAAA?text=P"} alt={current.authorUsername} />
              <span className="uname">{current.authorUsername}</span>
            </div>

            <div className="storyMb-actions">
              <button className="storyMb-icon" title={paused ? "Oynat" : "Duraklat"} onClick={handleInteraction(() => (paused ? resume() : pause()))}>
                {paused ? <Icon.Play /> : <Icon.Pause />}
              </button>
              <button className="storyMb-icon" title="Kapat" onClick={handleInteraction(closeAndReset)}>
                <Icon.Close />
              </button>
            </div>
          </div>
        </div>

        {/* Alt bölge */}
        <div className="storyMb-bottom" onClick={stopBubble}>
          {isOwner ? (
            <div className="storyMb-owner-actions">
              <div className="storyMb-seen-by">
                <Icon.Seen /><span>{viewCount.toLocaleString()} kişi gördü</span>
              </div>

              {/* OWNER: ★ sadece görüntü (disabled) + meta label */}
              <div
                className="storyMb-stars"
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

              <div className="storyMb-owner-buttons">
                <button className="storyMb-iconbtn" title="Öne Çıkar">
                  <Icon.Highlight /><span>Öne Çıkar</span>
                </button>
                <button
                  className="storyMb-iconbtn"
                  title="Daha Fazla"
                  onClick={handleInteraction(() => { setPaused(true); setMenuOpen(true); })}
                >
                  <span style={{fontSize:18}}>…</span><span>Daha Fazla</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* VIEWER: ★ etkileşimli + meta label */}
              <div
                className="storyMb-stars"
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

              <div className="storyMb-replyrow">
                <div className="storyMb-inputwrap">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`${current?.authorUsername || "Kullanıcı"}'a yanıt ver...`}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendTextReply(); } }}
                    onFocus={pause}
                    onBlur={resume}
                  />
                </div>
                <button className="storyMb-icon" onClick={handleInteraction(sendTextReply)} aria-label="Gönder"><Icon.Send /></button>
              </div>
            </>
          )}
        </div>

        {/* Menü: sadece alttaki “Daha Fazla”dan */}
        <div className={`storyMb-menulayer ${menuOpen ? "visible" : ""}`} onClick={() => { setMenuOpen(false); setPaused(false); }}>
          <div className="storyMb-menu" onClick={(e) => e.stopPropagation()}>
            <div className="dragbar" />
            {isOwner && (
              <button
                className="mitem danger"
                onClick={() => {
                  setDeleteTarget({ id: current?.id, storagePath: current?.storagePath });
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
              >
                Sil
              </button>
            )}
            <button className="mitem" onClick={() => { setMenuOpen(false); setPaused(false); }}>İptal</button>
          </div>
        </div>

        <div className={`storyMb-confirmlayer ${confirmOpen ? "show" : ""}`} onClick={() => setConfirmOpen(false)}>
          <div className="storyMb-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="title">Hikayeyi sil?</div>
            <div className="actions">
              <button className="btn danger" onClick={doDelete}>Sil</button>
              <button className="btn" onClick={() => setConfirmOpen(false)}>İptal</button>
            </div>
          </div>
        </div>

        <div className="storyMb-tap-zones">
          <div className="zone prev" onClick={handleInteraction(goPrev)} />
          <div className="zone next" onClick={handleInteraction(goNext)} />
        </div>
      </div>
    </div>
  );
}

export default StoryModalMobile;
