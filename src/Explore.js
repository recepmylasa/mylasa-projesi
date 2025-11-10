import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { db } from "./firebase";
import {
  collection,
  query,
  getDocs,
  where,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
import PostDetailModal from "./PostDetailModal";
import ProfilePostViewerMobile from "./ProfilePostViewerMobile";
import { ClipBadge, CommentIcon, StarIcon } from "./icons";
import "./Explore.css";

/* --- Yakınımda servisleri + kart --- */
import { initNearby, fetchNearbyPage } from "./services/nearby";
import NearbyPromptMobile from "./components/NearbyPromptMobile";
import RouteCardMobile from "./components/RouteCardMobile";

/* ——— Yardımcılar ——— */
const isVideoExt = (url) => !!url && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
const mediaUrlOf = (it) =>
  it?.mediaUrl ||
  it?.videoUrl ||
  it?.imageUrl ||
  it?.gorselUrl ||
  it?.photoUrl ||
  it?.resimUrl ||
  it?.fileUrl ||
  it?.url ||
  it?.thumbUrl ||
  "";
const thumbUrlOf = (it) =>
  it?.thumbUrl || it?.thumbnail || it?.coverUrl || it?.poster || "";
const isClipItem = (it) => {
  const t = (it?.type || it?.format || it?.kind || "").toString().toLowerCase();
  const mt = (it?.mediaType || it?.mime || it?.mimeType || "").toString().toLowerCase();
  const url = mediaUrlOf(it);
  return (
    it?.isClip === true ||
    it?.isVideo === true ||
    t === "clip" ||
    t === "video" ||
    t === "reel" ||
    t === "reels" ||
    mt.startsWith("video/") ||
    isVideoExt(url)
  );
};
const likeCountOf = (it) =>
  typeof it?.starsCount === "number"
    ? it.starsCount
    : typeof it?.likes === "number"
    ? it.likes
    : Array.isArray(it?.begenenler)
    ? it.begenenler.length
    : 0;
const commentCountOf = (it) =>
  typeof it?.commentsCount === "number"
    ? it.commentsCount
    : Array.isArray(it?.yorumlar)
    ? it.yorumlar.length
    : 0;

/* --- Konum alma (tek sefer) --- */
const askLocationOnce = () =>
  new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Konum desteği yok"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

function Explore({ aktifKullaniciId, onUserClick }) {
  /* Arama */
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  /* Grid (gönderiler) */
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [isEnd, setIsEnd] = useState(false);

  /* Detay & Viewer */
  const [selectedPost, setSelectedPost] = useState(null);
  const [viewer, setViewer] = useState(null);

  const sentinelRef = useRef(null);

  /* === YAKINIMDA MODU (Yalnız MOBİL) === */
  const isMobile = typeof window !== "undefined"
    ? window.matchMedia("(max-width: 768px)").matches
    : true;

  const [nearOn, setNearOn] = useState(false);
  const [nearCenter, setNearCenter] = useState(null);
  const [radiusKm, setRadiusKm] = useState(20);
  const [nearItems, setNearItems] = useState([]);
  const [nearLoading, setNearLoading] = useState(false);
  const [nearError, setNearError] = useState("");

  const loadNearby = useCallback(
    async (centerArg = null, radiusArg = null) => {
      setNearLoading(true);
      setNearError("");
      try {
        await initNearby(aktifKullaniciId || null);
        const c = centerArg || (await askLocationOnce());
        setNearCenter(c);
        const r = Number.isFinite(radiusArg) ? radiusArg : radiusKm;
        const { items } = await fetchNearbyPage({ center: c, radiusKm: r, take: 20 });
        setNearItems(items);
      } catch (e) {
        setNearError(
          e?.message?.includes("permission") || e?.code === 1
            ? "Konum izni reddedildi."
            : "Konum alınamadı."
        );
        setNearItems([]);
      } finally {
        setNearLoading(false);
      }
    },
    [aktifKullaniciId, radiusKm]
  );

  const toggleNear = async () => {
    if (!isMobile) return; // masaüstünü etkileme
    const next = !nearOn;
    setNearOn(next);
    if (next) await loadNearby();
  };

  /* URL ile açma: ?near=1&lat=..&lng=..&r=20 */
  useEffect(() => {
    if (!isMobile) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("near") === "1") {
      const lat = parseFloat(sp.get("lat"));
      const lng = parseFloat(sp.get("lng"));
      const r = parseFloat(sp.get("r"));
      if (Number.isFinite(r)) setRadiusKm(Math.max(5, Math.min(50, r)));
      setNearOn(true);
      const c =
        Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      loadNearby(c, Number.isFinite(r) ? r : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Yarıçap değişince yenile */
  useEffect(() => {
    if (nearOn && nearCenter) loadNearby(nearCenter, radiusKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusKm]);

  /* ——— Arama (debounce) ——— */
  useEffect(() => {
    let alive = true;

    const run = async () => {
      const term = searchTerm.trim();
      if (!term) {
        if (!alive) return;
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);

      try {
        const usersRef = collection(db, "users");
        const firstWord = term.split(" ")[0];
        const lw = firstWord.toLowerCase();
        const cap =
          firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();

        const map = new Map();

        // kullanıcı adı (kullaniciAdi / username)
        const q1 = query(
          usersRef,
          where("kullaniciAdi", ">=", lw),
          where("kullaniciAdi", "<=", lw + "\uf8ff"),
          limit(10)
        );
        const s1 = await getDocs(q1);
        s1.docs.forEach((d) => {
          const data = d.data();
          map.set(data.uid || d.id, { id: d.id, ...data });
        });

        const q1b = query(
          usersRef,
          where("username", ">=", lw),
          where("username", "<=", lw + "\uf8ff"),
          limit(10)
        );
        const s1b = await getDocs(q1b);
        s1b.docs.forEach((d) => {
          const data = d.data();
          map.set(data.uid || d.id, { id: d.id, ...data });
        });

        // ad soyad (adSoyad / displayName)
        const q2 = query(
          usersRef,
          where("adSoyad", ">=", cap),
          where("adSoyad", "<=", cap + "\uf8ff"),
          limit(10)
        );
        const s2 = await getDocs(q2);
        s2.docs.forEach((d) => {
          const data = d.data();
          map.set(data.uid || d.id, { id: d.id, ...data });
        });

        const q2b = query(
          usersRef,
          where("displayName", ">=", cap),
          where("displayName", "<=", cap + "\uf8ff"),
          limit(10)
        );
        const s2b = await getDocs(q2b);
        s2b.docs.forEach((d) => {
          const data = d.data();
          map.set(data.uid || d.id, { id: d.id, ...data });
        });

        if (!alive) return;
        setSearchResults(Array.from(map.values()));
      } catch (e) {
        if (!alive) return;
        console.error("Arama hatası:", e);
        setSearchResults([]);
      } finally {
        if (alive) setIsSearching(false);
      }
    };

    const t = setTimeout(run, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [searchTerm]);

  /* ——— Keşfet gönderileri: ilk sayfa ——— */
  const pageSize = 24;
  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    setIsEnd(false);
    setCursor(null);
    try {
      const postsRef = collection(db, "posts");
      const qy = query(postsRef, orderBy("tarih", "desc"), limit(pageSize));
      const snap = await getDocs(qy);
      const docs = snap.docs;
      const mapped = docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts(mapped);
      setCursor(docs.length > 0 ? docs[docs.length - 1] : null);
      setIsEnd(docs.length < pageSize);
    } catch (e) {
      console.error("Explore ilk sayfa hatası:", e);
      setPosts([]);
      setIsEnd(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  /* ——— Sonsuz kaydırma: sonraki sayfalar ——— */
  const fetchNext = useCallback(async () => {
    if (paging || isEnd || !cursor) return;
    setPaging(true);
    try {
      const postsRef = collection(db, "posts");
      const qy = query(
        postsRef,
        orderBy("tarih", "desc"),
        startAfter(cursor),
        limit(pageSize)
      );
      const snap = await getDocs(qy);
      const docs = snap.docs;
      const add = docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts((prev) => mergeUnique(prev, add));
      setCursor(docs.length > 0 ? docs[docs.length - 1] : cursor);
      setIsEnd(docs.length < pageSize);
    } catch (e) {
      console.error("Explore sayfalama hatası:", e);
      setIsEnd(true);
    } finally {
      setPaging(false);
    }
  }, [paging, isEnd, cursor]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const ent = entries[0];
        if (ent?.isIntersecting) fetchNext();
      },
      { rootMargin: "800px 0px 1200px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNext]);

  /* ——— Grid listesi + mozaik ——— */
  const gridList = useMemo(() => posts, [posts]);
  const isBig = (idx) => idx % 7 === 0; // 0,7,14,...

  /* ——— Kart aç ——— */
  const openCard = (idx) => {
    const isMb = window.matchMedia("(max-width: 768px)").matches;
    if (isMb) {
      const withTypes = gridList.map((p) =>
        p.type ? p : { ...p, type: isClipItem(p) ? "clip" : "post" }
      );
      setViewer({ items: withTypes, index: idx });
    } else {
      setSelectedPost(gridList[idx]);
    }
  };

  const closeViewer = () => setViewer(null);

  return (
    <>
      <div className="explore-container">
        {/* Arama */}
        <div className="search-bar-wrapper">
          <div className="search-bar-container">
            <input
              type="text"
              placeholder="Ara…"
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Kullanıcı ara"
            />
          </div>
        </div>

        {/* --- Yakınımda Chip (yalnız mobil) --- */}
        {isMobile && (
          <div className="chipbar">
            <button
              type="button"
              className={`chip${nearOn ? " active" : ""}`}
              onClick={toggleNear}
              aria-pressed={nearOn}
            >
              Yakınımda
            </button>
          </div>
        )}

        {/* Yakınımda modu aktifse rota listesi */}
        {isMobile && nearOn ? (
          <>
            {nearCenter && (
              <div className="near-controls">
                <label htmlFor="near-radius">
                  Yarıçap: <b>{radiusKm} km</b>
                </label>
                <input
                  id="near-radius"
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                />
              </div>
            )}

            {nearError && (
              <div className="search-message">{nearError} (Şehir filtresini kullanabilirsiniz.)</div>
            )}

            {!nearError && !nearCenter && (
              <NearbyPromptMobile
                onAllow={() => loadNearby()}
                onCancel={() => setNearOn(false)}
              />
            )}

            {!nearError && nearLoading && (
              <div className="near-list" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="near-skel" />
                ))}
              </div>
            )}

            {!nearError && !nearLoading && nearItems.length > 0 && (
              <div className="near-list">
                {nearItems.map((route) => (
                  <RouteCardMobile
                    key={route.id}
                    route={route}
                    onClick={() => {
                      // Not: Projenin mevcut yönlendirme yapısına göre burada açılacak.
                      // window.location.href = `/routes/${route.id}`;
                    }}
                  />
                ))}
              </div>
            )}

            {!nearError && !nearLoading && nearItems.length === 0 && nearCenter && (
              <div className="search-message">Bu yarıçapta bitmiş rota bulunamadı.</div>
            )}
          </>
        ) : (
          /* --- Normal Explore (gönderi grid) --- */
          <>
            {searchTerm.trim() ? (
              <div className="search-results-container" role="list">
                {isSearching ? (
                  <p className="search-message">Aranıyor…</p>
                ) : searchResults.length > 0 ? (
                  searchResults.map((user) => {
                    const uid = user.uid || user.id;
                    const avatar =
                      user.profilFoto || user.photoURL || "/avatars/default.png";
                    const uname = user.kullaniciAdi || user.username || "kullanıcı";
                    const fname = user.adSoyad || user.displayName || "";
                    return (
                      <button
                        key={uid}
                        className="search-result-item"
                        onClick={() => onUserClick(uid)}
                        role="listitem"
                        aria-label={`${uname} profiline git`}
                        type="button"
                      >
                        <img src={avatar} alt="" />
                        <div className="search-result-info">
                          <span className="username">{uname}</span>
                          <span className="fullname">{fname}</span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="search-message">Sonuç bulunamadı.</p>
                )}
              </div>
            ) : loading ? (
              <div className="explore-grid" aria-busy="true" aria-live="polite">
                {Array.from({ length: pageSize }).map((_, i) => (
                  <div key={i} className="explore-grid-item skeleton" aria-hidden="true" />
                ))}
              </div>
            ) : gridList.length > 0 ? (
              <div className="explore-grid" role="list">
                {gridList.map((post, idx) => {
                  const url = mediaUrlOf(post);
                  if (!url) return null;
                  const clip = isClipItem(post);
                  const poster = thumbUrlOf(post);
                  const big = isBig(idx);

                  return (
                    <button
                      key={post.id}
                      type="button"
                      className={`explore-grid-item${big ? " big" : ""}`}
                      onClick={() => openCard(idx)}
                      role="listitem"
                      aria-label={clip ? "Klipi aç" : "Gönderiyi aç"}
                    >
                      {clip ? (
                        <video
                          className="explore-grid-media"
                          src={url}
                          poster={poster || undefined}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={url}
                          alt={post?.aciklama || post?.caption || "gönderi"}
                          className="explore-grid-media"
                          loading="lazy"
                          decoding="async"
                        />
                      )}

                      {clip && (
                        <div className="explore-clip-badge" style={{ color: "#fff" }}>
                          <ClipBadge size={16} />
                        </div>
                      )}

                      <div className="explore-grid-overlay" style={{ color: "#fff" }}>
                        <div className="explore-overlay-stat">
                          <StarIcon size={18} />
                          <span>{likeCountOf(post)}</span>
                        </div>
                        <div className="explore-overlay-stat">
                          <CommentIcon size={18} />
                          <span>{commentCountOf(post)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Sonsuz kaydırma sentinel + skeleton append */}
                {!isEnd && (
                  <>
                    {Array.from({ length: Math.min(6, pageSize) }).map((_, i) => (
                      <div key={`skel-${i}`} className="explore-grid-item skeleton" aria-hidden="true" />
                    ))}
                    <div ref={sentinelRef} className="explore-sentinel" aria-hidden="true" />
                  </>
                )}
              </div>
            ) : (
              <p className="search-message">Keşfedecek yeni bir şey yok.</p>
            )}
          </>
        )}
      </div>

      {/* Desktop modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          aktifKullaniciId={aktifKullaniciId}
        />
      )}

      {/* Mobil tam ekran viewer */}
      {viewer && (
        <ProfilePostViewerMobile
          items={viewer.items}
          startIndex={viewer.index}
          onClose={closeViewer}
        />
      )}
    </>
  );
}

export default Explore;

/* ——— yardımcı ——— */
function mergeUnique(prev, add) {
  const map = new Map(prev.map((x) => [x.id, x]));
  for (const it of add) {
    if (!it || !it.id) continue;
    map.set(it.id, it);
  }
  return Array.from(map.values());
}
