// src/ProfilePostViewerMobile.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { ensureContentDoc, rateContent as sendRating } from "./reputationClient";
import { toggleSave as fsToggleSave } from "./savesClient";
import { KebabIcon, CommentIcon, ShareIcon, SaveIcon } from "./icons";
import CommentsPanel from "./components/CommentsPanel/CommentsPanel";
import "./ProfilePostViewerMobile.css";

/* ---------- yardımcılar ---------- */
function ts(v) {
  if (!v) return 0;
  if (typeof v === "number") return v < 2e12 ? v * 1000 : v;
  if (v.seconds) return v.seconds * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}
const mediaUrlOf = (it) =>
  it?.mediaUrl || it?.imageUrl || it?.videoUrl || it?.gorselUrl || it?.photoUrl || it?.resimUrl || it?.fileUrl || it?.url || "";
const isVideoUrl = (url) => !!url && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
const displayNameOf = (it, fallback = "") =>
  it?.authorName || it?.userName || it?.username || it?.kullaniciAdi || fallback;
const avatarOf = (it) =>
  it?.authorPhoto || it?.userPhoto || it?.photoURL || it?.avatar || "";

function likeCountOf(it) {
  if (typeof it?.starsCount === "number") return it.starsCount;
  if (typeof it?.likes === "number") return it.likes;
  if (Array.isArray(it?.begenenler)) return it.begenenler.length;
  return 0;
}
function commentCountOf(it) {
  if (typeof it?.commentsCount === "number") return it.commentsCount;
  if (Array.isArray(it?.yorumlar)) return it.yorumlar.length;
  return 0;
}
function typeOf(it) {
  if (it?.type) return it.type;
  const url = mediaUrlOf(it);
  return isVideoUrl(url) ? "clip" : "post";
}
function relTimeTR(input) {
  const d = ts(input);
  if (!d) return "";
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return `${diff}s önce`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}s önce`;
  const g = Math.floor(h / 24);
  return `${g}g önce`;
}

/** deep-link yardımcıları */
const pathFor = (it) => `/${(it?.type === "clip" ? "c" : "p")}/${it?.id ?? ""}`;

/**
 * IG-stili mobil gönderi görüntüleyici (profilden açılan).
 * Dikey swipe ile postlar arasında geçiş; yatay swipe ile önceki/sonraki posta atlama.
 * Deep-link senkronu: URL /p/:id veya /c/:id olarak güncellenir.
 */
export default function ProfilePostViewerMobile({
  items = [],
  startIndex = 0,
  onClose,
  viewerUser,
}) {
  const [savedMap, setSavedMap] = useState({});
  const [expandedMap, setExpandedMap] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);

  // alt sayfalar
  const [shareSheet, setShareSheet] = useState(null);
  const [commentsFor, setCommentsFor] = useState(null);
  const [copied, setCopied] = useState(false);

  const listRef = useRef(null);
  const rafRef = useRef(0);

  // deep-link: önceki URL ve ilk push yapıldı mı?
  const prevUrlRef = useRef("");
  const urlPushedRef = useRef(false);

  // yatay swipe dedektörü
  const ptrRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    locked: null, // 'h' | 'v' | null
    dx: 0,
    dy: 0,
  });

  // tekilleştir + tarihe göre sırala + type
  const list = useMemo(() => {
    const uniq = new Map();
    for (const it of Array.isArray(items) ? items : []) {
      if (it?.id && !uniq.has(it.id)) uniq.set(it.id, it);
    }
    const arr = Array.from(uniq.values()).sort(
      (a, b) =>
        ts(b.tarih || b.createdAt || b.timestamp || b.date) -
        ts(a.tarih || a.createdAt || a.timestamp || a.date)
    );
    return arr.map((x) => (x.type ? x : { ...x, type: typeOf(x) }));
  }, [items]);

  // açılış index’i + ilk hizalama
  useEffect(() => {
    const idx = Math.max(0, Math.min(startIndex, list.length - 1));
    setCurrentIndex(idx);
    const el = listRef.current;
    if (!el || list.length === 0) return;
    requestAnimationFrame(() => {
      const child = el.children[idx];
      if (child) child.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [list, startIndex]);

  // body-scroll kilidi + popstate (back ile kapat)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onPop = () => { cleanupAndClose(); };
    window.addEventListener("popstate", onPop);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("popstate", onPop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DEEP-LINK: İlk pushState (viewer açılırken) — URL'i ilk karta göre ayarla
  useEffect(() => {
    if (urlPushedRef.current) return;
    if (!list.length) return;

    prevUrlRef.current = window.location.pathname + window.location.search + window.location.hash;

    const idx = Math.max(0, Math.min(startIndex, list.length - 1));
    const firstPath = pathFor(list[idx]);

    try {
      window.history.pushState({ ppv: true, from: prevUrlRef.current }, "", firstPath);
      urlPushedRef.current = true;
    } catch {
      // sessiz
    }
  }, [list, startIndex]);

  // DEEP-LINK: Kart değişince URL'i replaceState ile güncelle
  useEffect(() => {
    if (!urlPushedRef.current) return;
    const it = list[currentIndex];
    if (!it) return;
    const newPath = pathFor(it);
    if (window.location.pathname === newPath) return;
    try {
      window.history.replaceState(
        { ppv: true, from: prevUrlRef.current },
        "",
        newPath
      );
    } catch {}
  }, [currentIndex, list]);

  // ESC: önce sheet’leri, sonra viewer’ı kapat
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (commentsFor) { setCommentsFor(null); return; }
      if (shareSheet)  { setShareSheet(null);  return; }
      doClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commentsFor, shareSheet]);

  const doClose = useCallback(() => {
    try {
      if (window.history.state && window.history.state.ppv) {
        window.history.back();            // önceki sayfaya dön
        setTimeout(() => cleanupAndClose(), 250); // olası popstate gecikmesine karşı
      } else {
        cleanupAndClose();
      }
    } catch {
      cleanupAndClose();
    }
  }, []);

  const cleanupAndClose = useCallback(() => {
    if (typeof onClose === "function") onClose();
  }, [onClose]);

  // scroll’dan currentIndex tespiti
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const children = el.children;
        if (!children || !children.length) return;
        let bestIdx = 0;
        let bestDist = Infinity;
        const top = el.scrollTop;
        for (let i = 0; i < children.length; i++) {
          const c = /** @type {HTMLElement} */ (children[i]);
          const dist = Math.abs(c.offsetTop - top);
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
        if (bestIdx !== currentIndex) setCurrentIndex(bestIdx);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [currentIndex]);

  const scrollToIndex = useCallback((idx, behavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(idx, el.children.length - 1));
    const child = el.children[clamped];
    if (child) child.scrollIntoView({ block: "start", behavior });
  }, []);

  // aktif karttaki videoyu oynat, diğerlerini durdur
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const cards = root.querySelectorAll(".ppv-card");
    cards.forEach((card, i) => {
      const vids = card.querySelectorAll("video");
      vids.forEach((v) => {
        if (i === currentIndex) {
          v.muted = true;
          v.play().catch(() => {});
        } else {
          try { v.pause(); } catch {}
        }
      });
    });
  }, [currentIndex, list.length]);

  // ----- Kaydet / Puanla / Açıklama -----
  const toggleSave = useCallback(async (it) => {
    if (!it?.id) return;
    setSavedMap((m) => ({ ...m, [it.id]: !m[it.id] }));
    try {
      const { saved } = await fsToggleSave({
        contentId: it.id,
        type: it.type || "post",
        authorId: it.authorId,
        mediaUrl: mediaUrlOf(it),
        caption: it.aciklama || it.caption || it.mesaj || "",
      });
      setSavedMap((m) => ({ ...m, [it.id]: !!saved }));
    } catch {
      setSavedMap((m) => ({ ...m, [it.id]: !m[it.id] }));
    }
  }, []);

  const rate = useCallback(async (it, value) => {
    if (!it?.id) return;
    try {
      await ensureContentDoc(it.id, it.authorId, it.type || "post");
      await sendRating({
        contentId: it.id,
        authorId: it.authorId,
        value,
        type: it.type || "post",
      });
    } catch {}
  }, []);

  const toggleExpand = useCallback((id) => {
    setExpandedMap((m) => ({ ...m, [id]: !m[id] }));
  }, []);

  const viewerFallbackName =
    viewerUser?.name || viewerUser?.username || viewerUser?.kullaniciAdi || "kullanıcı";
  const viewerFallbackAvatar =
    viewerUser?.avatar || viewerUser?.photoURL || viewerUser?.profilFoto || "/avatars/default.png";

  // ----- Yatay swipe + Aşağı çek kapat -----
  const atCardTop = useCallback(() => {
    const el = listRef.current;
    if (!el) return false;
    const child = el.children[currentIndex];
    if (!child) return false;
    const rel = child.offsetTop - el.scrollTop;
    return Math.abs(rel) < 4;
  }, [currentIndex]);

  const handlePointerDown = (e) => {
    ptrRef.current.active = true;
    ptrRef.current.locked = null;
    ptrRef.current.startX = e.clientX;
    ptrRef.current.startY = e.clientY;
    ptrRef.current.dx = 0;
    ptrRef.current.dy = 0;
  };

  const handlePointerMove = (e) => {
    const p = ptrRef.current;
    if (!p.active) return;
    p.dx = e.clientX - p.startX;
    p.dy = e.clientY - p.startY;

    if (p.locked === null) {
      const ax = Math.abs(p.dx), ay = Math.abs(p.dy);
      if (ax > ay ? ax > 12 : ay > 12) {
        p.locked = ax > ay ? "h" : "v";
      }
    }
    if (p.locked === "h") e.preventDefault();
  };

  const handlePointerEnd = () => {
    const p = ptrRef.current;
    if (!p.active) return;
    const { dx, dy, locked } = p;

    if (locked === "h" && Math.abs(dx) > 60) {
      const dir = dx < 0 ? +1 : -1;
      scrollToIndex(currentIndex + dir, "smooth");
    } else if (locked === "v" && dy > 120 && atCardTop()) {
      doClose();
    }

    p.active = false;
    p.locked = null;
    p.dx = 0;
    p.dy = 0;
  };

  const openShare = (shareUrl) => {
    if (navigator.share) {
      navigator.share({ title: "Gönderi", url: shareUrl })
        .catch(() => setShareSheet({ url: shareUrl }));
    } else {
      setShareSheet({ url: shareUrl });
    }
  };

  const copyShare = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div className="ppv-root" role="dialog" aria-modal="true" aria-labelledby="ppv-title" data-modal-root>
      {/* üst bar */}
      <div className="ppv-header">
        <button className="ppv-back" onClick={doClose} aria-label="Geri">‹</button>
        <div id="ppv-title" className="ppv-title">Gönderiler</div>
        <button className="ppv-kebab" aria-label="Diğer">
          <KebabIcon />
        </button>
      </div>

      {/* aşağı çek kapat ipucu */}
      <div className="ppv-pullhint" aria-hidden="true">Aşağı çek kapat</div>

      {/* içerik feed'i */}
      <div
        className="ppv-list"
        ref={listRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {list.map((it) => {
          const url = mediaUrlOf(it);
          const isVideo = it.type === "clip";

          const name = displayNameOf(it, displayNameOf(list[0], viewerFallbackName));
          const avatar = avatarOf(it) || avatarOf(list[0]) || viewerFallbackAvatar;

          const likeCount = likeCountOf(it);
          const commentCount = commentCountOf(it);
          const cap = it?.aciklama || it?.caption || it?.mesaj || "";
          const expanded = !!expandedMap[it.id];

          const shareUrl = `${window.location.origin}${pathFor(it)}`;

          return (
            <article key={it.id} className="ppv-card" role="article" aria-label="Gönderi">
              {/* profil satırı */}
              <header className="ppv-head">
                <img className="ppv-avatar" src={avatar} alt="" />
                <div className="ppv-head-meta">
                  <div className="ppv-name">{name}</div>
                  {it?.location && <div className="ppv-loc">{it.location}</div>}
                </div>
                <button className="ppv-more" aria-label="Menü"><KebabIcon /></button>
              </header>

              {/* medya */}
              <div className="ppv-media">
                {isVideo ? (
                  <video
                    className="ppv-media-el"
                    src={url}
                    playsInline
                    autoPlay
                    muted
                    loop
                    controls={false}
                    preload="metadata"
                  />
                ) : (
                  <img
                    className="ppv-media-el"
                    src={url}
                    alt={cap || ""}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                  />
                )}
                {/* üst/alt gradient cilası */}
                <div className="ppv-media-gradients" aria-hidden="true" />
              </div>

              {/* aksiyon satırı */}
              <div className="ppv-actions">
                <div className="ppv-actions-left">
                  <StarRatingV2 size={24} onRate={(v) => rate(it, v)} />
                  <button className="ppv-btn" aria-label="Yorum" onClick={() => setCommentsFor(it)}>
                    <CommentIcon />
                  </button>
                  <button
                    className="ppv-btn"
                    aria-label="Paylaş"
                    onClick={() => openShare(shareUrl)}
                  >
                    <ShareIcon />
                  </button>
                </div>
                <button className="ppv-btn" aria-label="Kaydet" onClick={() => toggleSave(it)}>
                  <SaveIcon active={!!savedMap[it.id]} />
                </button>
              </div>

              {/* sayaçlar */}
              <div className="ppv-counts">
                {likeCount > 0 ? (
                  <strong className="ppv-like-strong">{likeCount} oy</strong>
                ) : (
                  <span className="ppv-like-ghost">İlk oyu sen ver</span>
                )}
                {commentCount > 0 && (
                  <button
                    className="ppv-show-comments"
                    type="button"
                    aria-label="Yorumları gör"
                    onClick={() => setCommentsFor(it)}
                  >
                    {commentCount} yorumu gör
                  </button>
                )}
              </div>

              {/* caption */}
              {cap && (
                <div className={"ppv-caption" + (expanded ? " expanded" : " collapsed")}>
                  <span className="ppv-cap-name">{name}</span>{" "}
                  <span className="ppv-cap-text">{cap}</span>
                  {!expanded && cap.trim().length > 120 && (
                    <>
                      {" "}
                      <button className="ppv-moretext" onClick={() => toggleExpand(it.id)}>devamı</button>
                    </>
                  )}
                </div>
              )}

              {/* zaman */}
              <div className="ppv-time">
                {relTimeTR(it.tarih || it.createdAt || it.timestamp || it.date)}
              </div>
            </article>
          );
        })}
      </div>

      {/* --- Paylaşım Sheet (fallback) --- */}
      {shareSheet && (
        <div className="ppv-sheet-backdrop" role="presentation" onClick={() => setShareSheet(null)}>
          <div className="ppv-sheet" role="dialog" aria-modal="true" aria-label="Paylaşım seçenekleri" onClick={(e) => e.stopPropagation()}>
            <div className="ppv-sheet-handle" />
            <div className="ppv-sheet-title">Paylaş</div>
            <button className="ppv-sheet-item" onClick={() => copyShare(shareSheet.url)}>Linki kopyala</button>
            <a className="ppv-sheet-item" href={shareSheet.url} target="_blank" rel="noopener noreferrer">Tarayıcıda aç</a>
            <button className="ppv-sheet-item cancel" onClick={() => setShareSheet(null)}>İptal</button>
            {copied && <div className="ppv-toast" aria-live="polite">Kopyalandı ✓</div>}
          </div>
        </div>
      )}

      {/* --- Yorumlar Paneli (read-only) --- */}
      <CommentsPanel
        open={!!commentsFor}
        contentId={commentsFor?.id}
        initialLocal={commentsFor?.yorumlar}
        onClose={() => setCommentsFor(null)}
      />
    </div>
  );
}
