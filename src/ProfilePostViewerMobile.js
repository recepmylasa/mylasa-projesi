// src/ProfilePostViewerMobile.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { ensureContentDoc, rateContent as sendRating } from "./reputationClient";
import { toggleSave as fsToggleSave } from "./savesClient";
import { KebabIcon, CommentIcon, ShareIcon, SaveIcon } from "./icons";
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

/* küçük yardımcılar */
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

/**
 * IG-stili mobil gönderi görüntüleyici (profilden açılan, yukarı kaydırmalı).
 * Props:
 *  - items: Array (ızgaradan gelen aynı kullanıcı içerikleri, post + clip karışık)
 *  - startIndex?: number (başlangıç kartı)
 *  - viewerUser?: { name, avatar }  → profildeki kullanıcı (fallback)
 *  - onClose: fn()
 */
export default function ProfilePostViewerMobile({
  items = [],
  startIndex = 0,
  onClose,
  viewerUser,
}) {
  const [savedMap, setSavedMap] = useState({});
  const [expandedMap, setExpandedMap] = useState({});
  const listRef = useRef(null);

  // tekilleştir + tarihe göre sırala (yeni -> eski)
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

  // açılışta ilgili karta kaydır
  useEffect(() => {
    const el = listRef.current;
    const idx = Math.max(0, Math.min(startIndex, list.length - 1));
    if (!el || list.length === 0) return;
    const t = setTimeout(() => {
      const child = el.children[idx];
      if (child) child.scrollIntoView({ block: "start", behavior: "instant" });
    }, 0);
    return () => clearTimeout(t);
  }, [list, startIndex]);

  const toggleSave = useCallback(async (it) => {
    if (!it?.id) return;
    setSavedMap((m) => ({ ...m, [it.id]: !m[it.id] })); // iyimser
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
      setSavedMap((m) => ({ ...m, [it.id]: !m[it.id] })); // geri al
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

  return (
    <div className="ppv-root" data-modal-root>
      {/* üst bar */}
      <div className="ppv-header">
        <button className="ppv-back" onClick={onClose} aria-label="Geri">‹</button>
        <div className="ppv-title">Gönderiler</div>
        <button className="ppv-kebab" aria-label="Diğer">
          <KebabIcon />
        </button>
      </div>

      {/* içerik feed'i */}
      <div className="ppv-list" ref={listRef}>
        {list.map((it) => {
          const url = mediaUrlOf(it);
          const isVideo = it.type === "clip";

          const name = displayNameOf(it, displayNameOf(list[0], viewerFallbackName));
          const avatar = avatarOf(it) || avatarOf(list[0]) || viewerFallbackAvatar;

          const likeCount = likeCountOf(it);
          const commentCount = commentCountOf(it);
          const cap = it?.aciklama || it?.caption || it?.mesaj || "";
          const expanded = !!expandedMap[it.id];

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
                  <img className="ppv-media-el" src={url} alt={cap || ""} draggable={false} />
                )}
              </div>

              {/* aksiyon satırı */}
              <div className="ppv-actions">
                <div className="ppv-actions-left">
                  <StarRatingV2 size={24} onRate={(v) => rate(it, v)} />
                  <button className="ppv-btn" aria-label="Yorum">
                    <CommentIcon />
                  </button>
                  <button
                    className="ppv-btn"
                    aria-label="Paylaş"
                    onClick={() => {
                      const shareUrl = `${window.location.origin}/${isVideo ? "c" : "p"}/${it.id}`;
                      if (navigator.share) {
                        navigator.share({ title: "Gönderi", url: shareUrl }).catch(() => {});
                      } else {
                        navigator.clipboard.writeText(shareUrl).catch(() => {});
                      }
                    }}
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
                  <button className="ppv-show-comments" type="button" aria-label="Yorumları gör">
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
    </div>
  );
}
