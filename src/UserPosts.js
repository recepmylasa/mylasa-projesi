// src/UserPosts.js
// Profil grid (resim/video). Esnek şema desteği.
// Post tık: /p/:id (mevcut akış bozulmaz)
// Clip tık: dahili video overlay AÇILIR (EĞER onOpen VERİLMEDİYSE).
// onOpen(items, startIndex) verilirse, HER KART için onu çağırır (mobil tam ekran viewer entegrasyonu).

import React, { useMemo, useEffect, useState, useCallback } from "react";
import { db } from "./firebase";
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import "./UserPosts.css";
import { ClipBadge, CommentIcon, StarIcon } from "./icons";

/* --- yardımcılar --- */
const isVideoExt = (url) => !!url && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);

function mediaUrlOf(item) {
  return (
    item?.mediaUrl ||
    item?.videoUrl ||
    item?.imageUrl ||
    item?.gorselUrl ||
    item?.photoUrl ||
    item?.resimUrl ||
    item?.fileUrl ||
    item?.url ||
    item?.thumbUrl ||
    ""
  );
}

function isClipItem(item) {
  const t = (item?.type || item?.format || item?.kind || "").toString().toLowerCase();
  const mt = (item?.mediaType || item?.mime || item?.mimeType || "").toString().toLowerCase();
  const url = mediaUrlOf(item);

  return (
    item?.isClip === true ||
    item?.isVideo === true ||
    t === "clip" || t === "video" || t === "reel" || t === "reels" ||
    mt.startsWith("video/") ||
    isVideoExt(url)
  );
}

function ts(val) {
  if (!val) return 0;
  if (typeof val === "number") return val < 2e12 ? val * 1000 : val;
  if (val.seconds) return val.seconds * 1000;
  if (val._seconds) return val._seconds * 1000;
  const t = Date.parse(val);
  return Number.isFinite(t) ? t : 0;
}

/** Yalnızca CLIPS: önce direkt /clips sorgula; bulunamazsa geniş esnek yolla filtrele. */
async function fetchUserClipsFlexible(userId) {
  const idFields = [
    "authorId","userId","uid","userID","ownerId","kullaniciId","createdBy","olusturanId",
    "user.uid","author.uid","owner.uid","user.id","author.id","accountId"
  ];
  // 1) /clips
  for (const f of idFields) {
    try {
      const qy = query(collection(db, "clips"), where(f, "==", userId), limit(200));
      const snap = await getDocs(qy);
      if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {}
  }
  // 2) /**/clips
  for (const f of idFields) {
    try {
      const qy = query(collectionGroup(db, "clips"), where(f, "==", userId), limit(200));
      const snap = await getDocs(qy);
      if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {}
  }
  // 3) fallback: tüm içerikten videoları ayıkla
  const everything = await fetchUserPostsFlexible(userId);
  return everything.filter(isClipItem);
}

/** Gönderiler (post/clip mix) — çok esnek koleksiyon/ad alanı aralığı */
async function fetchUserPostsFlexible(userId) {
  const colNames = [
    "posts", "gonderiler", "paylasimlar", "postlar",
    "clips", "reels", "videolar"
  ];
  const idFields = [
    "authorId","userId","uid","userID","ownerId","kullaniciId","createdBy","olusturanId","accountId",
    "user.uid","author.uid","owner.uid","user.id","author.id"
  ];

  for (const cn of colNames) {
    for (const f of idFields) {
      try {
        const qy = query(collection(db, cn), where(f, "==", userId), limit(200));
        const snap = await getDocs(qy);
        if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch {}
    }
  }
  for (const cn of colNames) {
    for (const f of idFields) {
      try {
        const qy = query(collectionGroup(db, cn), where(f, "==", userId), limit(200));
        const snap = await getDocs(qy);
        if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch {}
    }
  }
  return [];
}

/**
 * Props:
 *  - userId: string
 *  - content?: array (varsa direkt o kullanılır)
 *  - onlyClips?: boolean → true ise yalnızca video (clip) göster
 *  - onOpen?: function(items, startIndex) → verildiyse, tüm tıklamalar bunu çağırır
 */
export default function UserPosts({ userId, content, onlyClips = false, onOpen }) {
  const [fetched, setFetched] = useState(null);
  const [clipViewer, setClipViewer] = useState(null); // Fallback: onOpen verilmezse

  // body scroll kilidi (fallback viewer açıkken)
  useEffect(() => {
    if (clipViewer) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [clipViewer]);

  useEffect(() => {
    if (!userId || Array.isArray(content)) return;
    let cancelled = false;
    (async () => {
      try {
        const items = onlyClips
          ? await fetchUserClipsFlexible(userId)
          : await fetchUserPostsFlexible(userId);
        if (!cancelled) setFetched(items);
      } catch (e) {
        console.error("UserPosts fetch error:", e);
        if (!cancelled) setFetched([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, content, onlyClips]);

  const list = useMemo(() => {
    const raw = Array.isArray(content) ? content : Array.isArray(fetched) ? fetched : [];
    const map = new Map();
    for (const it of raw) {
      if (!it || !it.id) continue;
      if (!map.has(it.id)) map.set(it.id, it);
    }
    let arr = Array.from(map.values());

    const getCreated = (x) =>
      ts(
        x.createdAt ||
          x.created_at ||
          x.tarih ||
          x.timestamp ||
          x.olusturmaTarihi ||
          x.time ||
          x.date
      );
    arr.sort((a, b) => getCreated(b) - getCreated(a));

    if (onlyClips) arr = arr.filter(isClipItem);
    return arr;
  }, [content, fetched, onlyClips]);

  // Viewer’a tip bilgisi taşıyan aynı sıradaki liste
  const viewList = useMemo(
    () => list.map((it) => (it.type ? it : { ...it, type: isClipItem(it) ? "clip" : "post" })),
    [list]
  );

  const openPost = useCallback((it) => {
    if (!it?.id) return;
    try {
      window.history.pushState({ modal: "post", id: it.id }, "", `/p/${it.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (e) {
      console.error("openPost error:", e);
    }
  }, []);

  const openClip = (it) => {
    const url = mediaUrlOf(it);
    if (!url) return;
    setClipViewer({ url, item: it });
  };

  if (!Array.isArray(list)) {
    return (
      <div className="user-posts-message">
        <span>Yükleniyor...</span>
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <div className="user-posts-message">
        <span className="icon">📷</span>
        <div>{onlyClips ? "Henüz Clip Yok" : "Henüz Paylaşım Yok"}</div>
      </div>
    );
  }

  return (
    <>
      <div className="user-posts-grid" role="list">
        {viewList.map((item, idx) => {
          const url = mediaUrlOf(item);
          if (!url) return null;
          const isClip = item.type === "clip";

          const handleClick = () => {
            if (typeof onOpen === "function") {
              onOpen(viewList, idx); // Mobil tam ekran viewer entegrasyonu (tip bilgisiyle birlikte)
              return;
            }
            // onOpen yoksa eski davranış:
            if (isClip) openClip(item);
            else openPost(item);
          };

          return (
            <button
              key={item.id}
              type="button"
              className="post-grid-item"
              onClick={handleClick}
              aria-label={isClip ? "Clipi aç" : "Gönderiyi aç"}
              role="listitem"
            >
              {isClip ? (
                <video
                  src={url}
                  className="post-grid-image"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={url}
                  alt={item?.aciklama || item?.caption || "gönderi"}
                  className="post-grid-image"
                  loading="lazy"
                />
              )}

              {isClip && (
                <div className="post-grid-icon-wrapper" style={{ color: "#fff" }}>
                  <ClipBadge size={18} />
                </div>
              )}

              <div className="post-grid-overlay" style={{ color: "#fff" }}>
                <div className="overlay-stat">
                  <StarIcon size={18} />
                  <span>
                    {item?.starsCount ??
                      item?.likes ??
                      (item?.begenenler?.length || 0)}
                  </span>
                </div>
                <div className="overlay-stat">
                  <CommentIcon size={18} />
                  <span>
                    {item?.commentsCount ?? (item?.yorumlar?.length || 0)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Fallback clip viewer (onOpen yoksa devrede) */}
      {clipViewer && (
        <div
          className="clip-viewer-backdrop"
          onClick={() => setClipViewer(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="clip-viewer" onClick={(e) => e.stopPropagation()}>
            <button className="clip-close" onClick={() => setClipViewer(null)}>
              Kapat
            </button>
            <video src={clipViewer.url} controls autoPlay playsInline />
          </div>
        </div>
      )}
    </>
  );
}
