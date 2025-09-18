// UserPosts.js
// Profil grid (resim/video). Esnek şema + sonsuz kaydırma + skeleton.
// Post tık: /p/:id (mevcut akış bozulmaz)
// Clip tık: dahili video overlay AÇILIR (EĞER onOpen VERİLMEDİYSE).
// onOpen(items, startIndex) verilirse, HER KART için onu çağırır (mobil tam ekran viewer entegrasyonu).

import React, { useMemo, useEffect, useState, useCallback, useRef } from "react";
import { db } from "./firebase";
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  orderBy,
  startAfter,
  limit,
  documentId,
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

function thumbUrlOf(item) {
  return (
    item?.thumbUrl ||
    item?.thumbnail ||
    item?.coverUrl ||
    item?.poster ||
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

/* Sayı biçimleme: 1200 -> "1,2 B" (TR yerel) */
const nfCompact =
  (typeof Intl !== "undefined" &&
    Intl.NumberFormat &&
    new Intl.NumberFormat("tr", { notation: "compact", maximumFractionDigits: 1 })) || null;

function formatCount(n) {
  const num = Number(n || 0);
  if (!isFinite(num)) return "0";
  if (nfCompact) return nfCompact.format(num);
  // Fallback (çok eski tarayıcılar için)
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + " Mr";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + " Mn";
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + " B";
  return String(num);
}

/** Dinamik strateji: koleksiyon adı + id alanı + order alanı belirle.
 *  Amaç: İlk başarılı yol bulunur; sonraki sayfalarda aynı yoldan devam edilir.
 */
async function choosePathStrategy({ userId, onlyClips, pageSize = 12 }) {
  const clipCols = ["clips", "reels", "videolar"];
  const postCols = ["posts", "gonderiler", "paylasimlar", "postlar"];
  const colNames = onlyClips ? [...clipCols, ...postCols] : [...postCols, ...clipCols];

  const idFields = [
    "authorId", "userId", "uid", "userID", "ownerId", "kullaniciId", "createdBy", "olusturanId", "accountId",
    "user.uid", "author.uid", "owner.uid", "user.id", "author.id"
  ];

  const orderFields = ["createdAt", "created_at", "tarih", "timestamp", "olusturmaTarihi", "time", "date"];

  // 1) Önce belirgin koleksiyonlarda, önce collection sonra collectionGroup dene
  const kinds = ["collection", "collectionGroup"];

  for (const cn of colNames) {
    for (const kind of kinds) {
      for (const idf of idFields) {
        // 1.a — order'lı dene (en çok tercih edilen)
        for (const ofield of orderFields) {
          try {
            const base = kind === "collection" ? collection(db, cn) : collectionGroup(db, cn);
            const qy = query(
              base,
              where(idf, "==", userId),
              orderBy(ofield, "desc"),
              limit(pageSize)
            );
            const snap = await getDocs(qy);
            // Başarılı sorgu -> bu stratejiyi seç
            return {
              kind, cn, idField: idf,
              orderByField: ofield,
              orderByDocumentId: false,
              firstDocs: snap.docs
            };
          } catch (e) {
            // index gerekli olabilir vs. — bir alt varyanta geç
          }
        }
        // 1.b — fallback: documentId() ile sırala (en geniş uyumluluk)
        try {
          const base = kind === "collection" ? collection(db, cn) : collectionGroup(db, cn);
          const qy = query(
            base,
            where(idf, "==", userId),
            orderBy(documentId()),
            limit(pageSize)
          );
          const snap = await getDocs(qy);
          return {
            kind, cn, idField: idf,
            orderByField: null,
            orderByDocumentId: true,
            firstDocs: snap.docs
          };
        } catch (e) {
          // diğer idField'a geç
        }
      }
    }
  }

  // Hiçbir rota bulunamadıysa boş strateji döndür (UI "Henüz Yok" gösterecek)
  return null;
}

/** Verilen stratejiyle tek sayfa getiren yardımcı */
async function fetchPageWithStrategy({ strategy, userId, pageSize = 12, cursor = null }) {
  if (!strategy) return { docs: [], lastDoc: null };
  const { kind, cn, idField, orderByField, orderByDocumentId } = strategy;
  const base = kind === "collection" ? collection(db, cn) : collectionGroup(db, cn);

  const parts = [where(idField, "==", userId)];
  if (orderByField) parts.push(orderBy(orderByField, "desc"));
  if (orderByDocumentId) parts.push(orderBy(documentId()));
  parts.push(limit(pageSize));
  if (cursor) parts.push(startAfter(cursor));

  const qy = query(base, ...parts);
  const snap = await getDocs(qy);
  const docs = snap.docs;
  const lastDoc = docs.length > 0 ? docs[docs.length - 1] : cursor;
  return { docs, lastDoc };
}

/**
 * Props:
 *  - userId: string
 *  - content?: array (varsa direkt o kullanılır; sayfalama devre dışı)
 *  - onlyClips?: boolean → true ise yalnızca video (clip) göster
 *  - onOpen?: function(items, startIndex) → verildiyse, tüm tıklamalar bunu çağırır
 *  - pageSize?: number → varsayılan 12
 */
export default function UserPosts({ userId, content, onlyClips = false, onOpen, pageSize = 12 }) {
  const [strategy, setStrategy] = useState(null);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [isEnd, setIsEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [clipViewer, setClipViewer] = useState(null); // Fallback: onOpen verilmezse
  const sentinelRef = useRef(null);

  // content verilirse data direkt ondan gelir (sayfalama yok)
  const useExternalContent = Array.isArray(content);

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

  // Başlangıç yükü: strateji seç + ilk sayfa
  useEffect(() => {
    if (!userId || useExternalContent) return;

    let alive = true;
    setStrategy(null);
    setItems([]);
    setCursor(null);
    setIsEnd(false);
    setInitialLoading(true);

    (async () => {
      try {
        const strat = await choosePathStrategy({ userId, onlyClips, pageSize });
        if (!alive) return;
        if (!strat) {
          setStrategy(null);
          setItems([]);
          setIsEnd(true);
          setInitialLoading(false);
          return;
        }
        setStrategy(strat);

        const docs = strat.firstDocs || [];
        const mapped = docs.map((d) => ({ id: d.id, ...d.data() }));
        setItems((prev) => mergeUnique(prev, mapped));
        setCursor(docs.length > 0 ? docs[docs.length - 1] : null);
        setIsEnd(docs.length < pageSize);
      } catch (e) {
        console.error("UserPosts init error:", e);
        setItems([]);
        setIsEnd(true);
      } finally {
        if (alive) setInitialLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId, onlyClips, pageSize, useExternalContent]);

  // Sonsuz kaydırma: sentinel görünürse sayfa çek
  useEffect(() => {
    if (useExternalContent) return;              // dış içerikte sayfalama yok
    if (!strategy || isEnd) return;
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      async (entries) => {
        const ent = entries[0];
        if (!ent?.isIntersecting) return;
        if (loading) return;
        setLoading(true);
        try {
          const { docs, lastDoc } = await fetchPageWithStrategy({
            strategy,
            userId,
            pageSize,
            cursor,
          });
          const mapped = docs.map((d) => ({ id: d.id, ...d.data() }));
          setItems((prev) => mergeUnique(prev, mapped));
          setCursor(docs.length > 0 ? lastDoc : cursor);
          setIsEnd(docs.length < pageSize);
        } catch (e) {
          console.error("UserPosts page fetch error:", e);
          // hata durumunda döngüyü kitlememek için küçük bir gecikme ile kapat
          setIsEnd(true);
        } finally {
          setLoading(false);
        }
      },
      { rootMargin: "800px 0px 1600px 0px", threshold: 0.01 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [strategy, isEnd, loading, cursor, userId, pageSize, useExternalContent]);

  // İçerik kaynağı: dışarıdan içerik varsa onu kullan; yoksa state'teki birikmiş öğeler
  const listRaw = useMemo(() => {
    if (useExternalContent) return content || [];
    return items;
  }, [useExternalContent, content, items]);

  // Çoğaltmaları önle, tarih sıralaması (mümkünse), onlyClips filtresi
  const list = useMemo(() => {
    const map = new Map();
    for (const it of listRaw) {
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
  }, [listRaw, onlyClips]);

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

  // İLK YÜKLEME skeleton
  if (!useExternalContent && initialLoading) {
    return (
      <div
        className={`user-posts-grid ${onlyClips ? "clips-mode" : "posts-mode"}`}
        role="list"
        aria-busy="true"
        aria-live="polite"
      >
        {Array.from({ length: pageSize }).map((_, i) => (
          <div key={i} className="post-grid-item skeleton-card" aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (!Array.isArray(list) || list.length === 0) {
    return (
      <div className="user-posts-message">
        <span className="icon">📷</span>
        <div>{onlyClips ? "Henüz Clip Yok" : "Henüz Paylaşım Yok"}</div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`user-posts-grid ${onlyClips ? "clips-mode" : "posts-mode"}`}
        role="list"
      >
        {viewList.map((item, idx) => {
          const url = mediaUrlOf(item);
          if (!url) return null;
          const isClip = item.type === "clip";
          const poster = thumbUrlOf(item);

          const likes =
            item?.starsCount ??
            item?.likes ??
            (item?.begenenler?.length || 0);
          const comments =
            item?.commentsCount ??
            (item?.yorumlar?.length || 0);

          const ariaType = isClip ? "Klip" : "Gönderi";
          const label = `${ariaType} aç — ${formatCount(likes)} beğeni, ${formatCount(comments)} yorum`;

          const handleClick = () => {
            if (typeof onOpen === "function") {
              onOpen(viewList, idx); // Mobil tam ekran viewer entegrasyonu
              return;
            }
            if (isClip) openClip(item);
            else openPost(item);
          };

          return (
            <button
              key={item.id}
              type="button"
              className="post-grid-item"
              onClick={handleClick}
              aria-label={label}
              title={`${formatCount(likes)} beğeni • ${formatCount(comments)} yorum`}
              role="listitem"
            >
              {isClip ? (
                <video
                  src={url}
                  poster={poster || undefined}
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
                  decoding="async"
                  sizes="(max-width: 768px) 33vw, 33vw"
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
                  <span>{formatCount(likes)}</span>
                </div>
                <div className="overlay-stat">
                  <CommentIcon size={18} />
                  <span>{formatCount(comments)}</span>
                </div>
              </div>
            </button>
          );
        })}

        {/* Sonsuz kaydırma sentinel + yükleme skeletonları (append) */}
        {!useExternalContent && !isEnd && (
          <>
            {Array.from({ length: Math.min(6, pageSize) }).map((_, i) => (
              <div key={`skel-${i}`} className="post-grid-item skeleton-card" aria-hidden="true" />
            ))}
            <div ref={sentinelRef} className="infinite-sentinel" aria-hidden="true" />
          </>
        )}
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

/** Diziye benzersiz ekleme */
function mergeUnique(prev, add) {
  const map = new Map(prev.map((x) => [x.id, x]));
  for (const it of add) {
    if (!it || !it.id) continue;
    map.set(it.id, it);
  }
  return Array.from(map.values());
}
