// Profil grid (resim/video). Esnek şema desteği.
// Post tık: /p/:id (mevcut akış bozulmaz)
// Clip tık: dahili video overlay açılır (masaüstü & mobil)

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

/* --- küçük ikonlar --- */
const StarIconOverlay = () => (
  <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20" fill="white">
    <path d="M12 17.27 18.18 21 16.54 13.97 22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
  </svg>
);
const CommentIconOverlay = () => (
  <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20" fill="white">
    <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);
const ClipIconGrid = () => (
  <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18" fill="white">
    <path d="M4 6a3 3 0 0 1 3-3h7.5L18 6h2a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6Z" opacity=".45"/>
    <path d="M12 10.5v3l3-1.5-3-1.5Z" />
  </svg>
);

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
 */
export default function UserPosts({ userId, content, onlyClips = false }) {
  const [fetched, setFetched] = useState(null);
  const [clipViewer, setClipViewer] = useState(null); // {url, ...}

  // body scroll kilidi (viewer açıkken)
  useEffect(() => {
    if (clipViewer) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
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
    return () => { cancelled = true; };
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
      ts(x.createdAt || x.created_at || x.tarih || x.timestamp || x.olusturmaTarihi || x.time || x.date);
    arr.sort((a, b) => getCreated(b) - getCreated(a));

    if (onlyClips) arr = arr.filter(isClipItem);
    return arr;
  }, [content, fetched, onlyClips]);

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
    return <div className="user-posts-message"><span>Yükleniyor...</span></div>;
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
        {list.map((item) => {
          const url = mediaUrlOf(item);
          if (!url) return null;
          const isClip = isClipItem(item);

          const handleClick = () => {
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
                <video src={url} className="post-grid-image" muted playsInline preload="metadata" />
              ) : (
                <img src={url} alt={item?.aciklama || item?.caption || "gönderi"} className="post-grid-image" loading="lazy" />
              )}

              {isClip && (
                <div className="post-grid-icon-wrapper">
                  <ClipIconGrid />
                </div>
              )}

              <div className="post-grid-overlay">
                <div className="overlay-stat">
                  <StarIconOverlay />
                  <span>{item?.starsCount ?? item?.likes ?? (item?.begenenler?.length || 0)}</span>
                </div>
                <div className="overlay-stat">
                  <CommentIconOverlay />
                  <span>{item?.commentsCount ?? (item?.yorumlar?.length || 0)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Clip viewer overlay */}
      {clipViewer && (
        <div
          className="clip-viewer-backdrop"
          onClick={() => setClipViewer(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="clip-viewer" onClick={(e) => e.stopPropagation()}>
            <button className="clip-close" onClick={() => setClipViewer(null)}>Kapat</button>
            <video src={clipViewer.url} controls autoPlay playsInline />
          </div>
        </div>
      )}
    </>
  );
}
