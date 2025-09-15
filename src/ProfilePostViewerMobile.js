// src/ProfilePostViewerMobile.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { auth } from "./firebase";
import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { ensureContentDoc, rateContent as sendRating } from "./reputationClient";
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from "./savesClient";
import "./ProfilePostViewerMobile.css";

/* --- yardımcılar --- */
function ts(v){
  if(!v) return 0;
  if(typeof v==="number") return v<2e12? v*1000:v;
  if(v.seconds) return v.seconds*1000;
  const t = Date.parse(v);
  return Number.isFinite(t)? t : 0;
}

const mediaUrlOf = (it) =>
  it?.mediaUrl || it?.imageUrl || it?.videoUrl || it?.gorselUrl || it?.photoUrl || it?.resimUrl || it?.fileUrl || it?.url || "";

const isVideo = (url) => !!url && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);

const displayNameOf = (it, fallback="") =>
  it?.authorName || it?.userName || it?.username || it?.kullaniciAdi || fallback;

const avatarOf = (it) =>
  it?.authorPhoto || it?.userPhoto || it?.photoURL || it?.avatar || "/avatars/default.png";

/**
 * IG-stili mobil gönderi görüntüleyici (feed görünümü).
 * Props:
 *  - items: Array (ızgaradan gelen liste – aynı kullanıcının postları)
 *  - startIndex?: number (ilk gösterilecek kart)
 *  - onClose: fn()
 */
export default function ProfilePostViewerMobile({ items = [], startIndex = 0, onClose }) {
  const [savedMap, setSavedMap] = useState({});
  const listRef = useRef(null);

  const list = useMemo(() => {
    const unique = new Map();
    for (const it of Array.isArray(items) ? items : []) {
      if (it?.id && !unique.has(it.id)) unique.set(it.id, it);
    }
    // tarihine göre sırala (yeni → eski)
    const arr = Array.from(unique.values()).sort(
      (a,b) => ts(b.tarih || b.createdAt || b.timestamp || b.date) - ts(a.tarih || a.createdAt || a.timestamp || a.date)
    );
    return arr;
  }, [items]);

  // açılışta seçili karta kaydır
  useEffect(() => {
    const el = listRef.current;
    const idx = Math.max(0, Math.min(startIndex, list.length - 1));
    if (!el || list.length === 0) return;
    // biraz beklet ki layout oluşsun
    const t = setTimeout(() => {
      const child = el.children[idx];
      if (child) child.scrollIntoView({ block: "start", behavior: "instant" });
    }, 0);
    return () => clearTimeout(t);
  }, [list, startIndex]);

  const toggleSave = useCallback(async (it) => {
    if (!it?.id) return;
    setSavedMap(m => ({...m, [it.id]: !(m[it.id])}));
    try {
      const { saved } = await fsToggleSave({
        contentId: it.id,
        type: it.type || "post",
        authorId: it.authorId,
        mediaUrl: mediaUrlOf(it),
        caption: it.aciklama || it.caption || it.mesaj || "",
      });
      setSavedMap(m => ({...m, [it.id]: !!saved}));
    } catch {
      setSavedMap(m => ({...m, [it.id]: !(m[it.id])}));
    }
  }, []);

  const rate = useCallback(async (it, value) => {
    if (!it?.id) return;
    try {
      await ensureContentDoc(it.id, it.authorId, it.type || "post");
      await sendRating({ contentId: it.id, authorId: it.authorId, value, type: it.type || "post" });
    } catch {/* sessiz */}
  }, []);

  return (
    <div className="ppv-feed-root" data-modal-root>
      {/* üst bar */}
      <div className="ppv-feed-header">
        <button className="ppv-feed-back" onClick={onClose} aria-label="Geri">‹</button>
        <div className="ppv-feed-title">Gönderiler</div>
        <div className="ppv-feed-menu" aria-hidden="true">⋯</div>
      </div>

      {/* içerik */}
      <div className="ppv-feed-list" ref={listRef}>
        {list.map((it) => {
          const url = mediaUrlOf(it);
          const video = isVideo(url);
          const name = displayNameOf(it, displayNameOf(list[0], "kullanıcı"));
          const avatar = avatarOf(it) || avatarOf(list[0]);

          return (
            <article key={it.id} className="ppv-card" role="article" aria-label="Gönderi">
              {/* profil satırı */}
              <header className="ppv-card-head">
                <img className="ppv-head-avatar" src={avatar} alt="" />
                <div className="ppv-head-meta">
                  <div className="ppv-head-name">{name}</div>
                  {it?.location && <div className="ppv-head-loc">{it.location}</div>}
                </div>
                <button className="ppv-head-more" aria-label="Menü">⋯</button>
              </header>

              {/* medya */}
              <div className="ppv-card-media">
                {video ? (
                  <video
                    className="ppv-media-el"
                    src={url}
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img className="ppv-media-el" src={url} alt={it?.aciklama || it?.caption || ""} />
                )}
              </div>

              {/* aksiyonlar */}
              <div className="ppv-card-actions">
                <div className="ppv-actions-left">
                  <StarRatingV2 size={22} onRate={(v)=>rate(it,v)} />
                  <button className="ppv-btn" aria-label="Yorum">💬</button>
                  <button
                    className="ppv-btn"
                    aria-label="Paylaş"
                    onClick={()=>{
                      const shareUrl = `${window.location.origin}/${video ? "c":"p"}/${it.id}`;
                      if (navigator.share) navigator.share({ title: "Gönderi", url: shareUrl }).catch(()=>{});
                      else navigator.clipboard.writeText(shareUrl).catch(()=>{});
                    }}
                  >↗</button>
                </div>
                <button
                  className={"ppv-btn save" + (savedMap[it.id] ? " active" : "")}
                  aria-label="Kaydet"
                  onClick={()=>toggleSave(it)}
                >🔖</button>
              </div>

              {/* caption + zaman */}
              {(it?.aciklama || it?.caption || it?.mesaj) && (
                <div className="ppv-card-caption">
                  <span className="ppv-cap-name">{name}</span>&nbsp;
                  <span className="ppv-cap-text">{it.aciklama || it.caption || it.mesaj}</span>
                </div>
              )}
              <div className="ppv-card-time">
                {new Date(ts(it.tarih || it.createdAt || it.timestamp || it.date)).toLocaleDateString("tr-TR")}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
