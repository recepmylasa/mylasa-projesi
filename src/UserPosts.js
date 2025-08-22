import React, { useMemo, useCallback, useEffect, useState } from "react";
import "./UserPosts.css";
import { db } from "./firebase";
import {
  collection, collectionGroup, query, where, getDocs, limit, orderBy
} from "firebase/firestore";

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

const isVideoUrl = (url) => !!url && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
const uniq = (arr, by = (x)=>x) => {
  const m = new Map();
  for (const it of arr) { const k = by(it); if (!m.has(k)) m.set(k, it); }
  return [...m.values()];
};
const getCreatedAt = (docData) => {
  const cand = [
    docData?.createdAt,
    docData?.timestamp,
    docData?.time,
    docData?.olusturmaZamani,
    docData?.created_at,
  ];
  for (const v of cand) {
    if (!v) continue;
    if (typeof v === "number") return v;
    if (v?.seconds) return v.seconds * 1000 + (v.nanoseconds ? Math.floor(v.nanoseconds/1e6) : 0);
    const d = new Date(v);
    if (!Number.isNaN(+d)) return +d;
  }
  return 0;
};
const pickMediaUrl = (d) => {
  if (d?.mediaUrl) return d.mediaUrl;
  if (d?.imageUrl) return d.imageUrl;
  if (Array.isArray(d?.images) && d.images[0]) return d.images[0];
  if (Array.isArray(d?.media) && d.media[0]?.url) return d.media[0].url;
  return "";
};

/**
 * Props:
 *  - userId?: string  -> gelirse Firestore’dan bu kullanıcının gönderileri çekilir
 *  - content?: array  -> gelirse direkt bu liste kullanılır
 *  - onPostClick?: fn -> kart tıklanınca çağrılır
 */
export default function UserPosts({ userId, content, onPostClick }) {
  const [fetched, setFetched] = useState(null);   // null=yükleniyor, []=boş

  // Dışarıdan doğrudan içerik verildiyse onu kullan
  const listFromContent = useMemo(() => {
    if (!Array.isArray(content)) return null;
    return uniq(content.filter(Boolean), (x)=>x.id);
  }, [content]);

  // Firestore’dan yükle (userId varsa ve content verilmemişse)
  useEffect(() => {
    if (!userId || listFromContent) return;
    let cancelled = false;

    (async () => {
      const results = [];

      const collNames = ["posts", "gonderiler", "paylasimlar"];
      const ownerFields = ["userId", "uid", "authorId", "ownerId", "olusturanId", "kullaniciId"];

      // 1) Tepe koleksiyonları tara
      for (const name of collNames) {
        try {
          const col = collection(db, name);
          for (const field of ownerFields) {
            try {
              let q;
              try {
                q = query(col, where(field, "==", userId), orderBy("createdAt", "desc"), limit(40));
              } catch {
                q = query(col, where(field, "==", userId), limit(40));
              }
              const snap = await getDocs(q);
              snap.forEach(d => results.push({ id: d.id, ...d.data() }));
              if (results.length) break;
            } catch {}
          }
        } catch {}
        if (results.length) break;
      }

      // 2) Hâlâ boşsa: alt koleksiyonlar (collectionGroup) tara
      if (results.length === 0) {
        for (const name of collNames) {
          try {
            const cg = collectionGroup(db, name);
            for (const field of ownerFields) {
              try {
                let q;
                try {
                  q = query(cg, where(field, "==", userId), orderBy("createdAt", "desc"), limit(40));
                } catch {
                  q = query(cg, where(field, "==", userId), limit(40));
                }
                const snap = await getDocs(q);
                snap.forEach(d => results.push({ id: d.id, ...d.data() }));
                if (results.length) break;
              } catch {}
            }
          } catch {}
          if (results.length) break;
        }
      }

      // Sırala ve benzersizleştir
      let items = uniq(results, (x)=>x.id).sort((a,b)=>getCreatedAt(b)-getCreatedAt(a));

      if (!cancelled) setFetched(items);
    })();

    return () => { cancelled = true; };
  }, [userId, listFromContent]);

  const list = listFromContent ?? fetched;

  const handleOpen = useCallback((it) => {
    if (!it?.id) return;
    const url = pickMediaUrl(it);
    const type = it.type || (isVideoUrl(url) ? "clip" : "post");
    onPostClick?.({ id: it.id, type });
  }, [onPostClick]);

  // Yükleniyor / boş durumları
  if (list === null) {
    return <div className="user-posts-message"><span>Yükleniyor...</span></div>;
  }
  if (!Array.isArray(list) || list.length === 0) {
    return (
      <div className="user-posts-message">
        <span className="icon">📷</span>
        <div>Henüz Paylaşım Yok</div>
      </div>
    );
  }

  return (
    <div className="userposts-grid" role="list">
      {list.map((item) => {
        const url = pickMediaUrl(item);
        if (!url) return null;
        const isClip = item.type === "clip" || isVideoUrl(url);

        return (
          <button
            key={item.id}
            type="button"
            className="userpost-tile"
            onClick={() => handleOpen(item)}
            aria-label="Gönderiyi aç"
            role="listitem"
          >
            {isClip ? (
              <video src={url} muted playsInline preload="metadata" />
            ) : (
              <img src={url} alt={item.aciklama || "gönderi"} loading="lazy" />
            )}

            {/* Reels rozeti */}
            {isClip && (
              <div className="userpost-overlay" style={{justifyContent: "flex-start", alignItems: "flex-start", padding: 8, opacity: 1, background: "transparent"}}>
                <ClipIconGrid />
              </div>
            )}

            {/* Hover overlay: beğeni/yorum sayıları */}
            <div className="userpost-overlay">
              <div style={{display: "flex", gap: 18, alignItems: "center"}}>
                <span style={{display:"inline-flex", gap:6, alignItems:"center"}}>
                  <StarIconOverlay />
                  <span>{item.starsCount ?? (Array.isArray(item.begenenler) ? item.begenenler.length : 0)}</span>
                </span>
                <span style={{display:"inline-flex", gap:6, alignItems:"center"}}>
                  <CommentIconOverlay />
                  <span>{Array.isArray(item.yorumlar) ? item.yorumlar.length : 0}</span>
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
