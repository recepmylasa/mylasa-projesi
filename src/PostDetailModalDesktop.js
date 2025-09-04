import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { db, auth } from "./firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { ensureContentDoc, rateContent as sendRating } from "./reputationClient";
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from "./savesClient";
import "./PostDetailModalDesktop.css";

/* ===== Icons ===== */
const CommentIcon = () => (
  <svg aria-label="Yorum Yap" height="24" role="img" viewBox="0 0 24 24" width="24">
    <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></path>
  </svg>
);
const ShareIcon = () => (
  <svg aria-label="Gönderiyi Paylaş" height="24" role="img" viewBox="0 0 24 24" width="24">
    <line fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" x1="22" x2="11" y1="2" y2="13"></line>
    <polygon fill="none" points="22 2 15 22 11 13 2 9 22 2" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></polygon>
  </svg>
);
const SaveIcon = ({ isSaved }) => (
  <svg aria-label="Kaydet" height="24" role="img" viewBox="0 0 24 24" width="24">
    <polygon fill={isSaved ? "currentColor" : "none"} points="20 21 12 13.44 4 21 4 3 20 3 20 21" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></polygon>
  </svg>
);
const DotsIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <circle cx="5" cy="12" r="2" fill="currentColor" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <circle cx="19" cy="12" r="2" fill="currentColor" />
  </svg>
);

/* ===== Utils ===== */
// IG tarzı kısa Türkçe: 45Sn, 3D (dakika), 5S (saat), 10G (gün)
const formatTimeAgoShort = (ts) => {
  if (!ts) return "";
  const date = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}Sn`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}D`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}S`;
  const g = Math.floor(h / 24);
  return `${g}G`;
};
const formatCount = (n) => {
  if (typeof n !== "number") return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + "M";
  return (n / 1_000_000_000).toFixed(1) + "B";
};
const makeCommentId = (uid) => `${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/* ===== Comment Row ===== */
function CommentRow({
  contentId,
  contentType,   // "clip" | "post"
  isOwner,       // içerik sahibi misin
  currentUser,   // auth.currentUser
  comment,       // yorum objesi
  onUserClick,   // kullanıcı adına tıklandığında
  openMenuId,    // aktif açık menü id’si (üstten gelir)
  setOpenMenuId, // menü kontrolcüsü (üstten gelir)
}) {
  const [rateOpen, setRateOpen] = useState(false);
  const rowRef = useRef(null);

  const avg =
    (Number(comment?.ratingSum || 0) > 0 && Number(comment?.ratingCount || 0) > 0)
      ? Number(comment.ratingSum) / Number(comment.ratingCount)
      : 0;

  const canDelete =
    currentUser &&
    (comment?.userId === currentUser.uid || isOwner);

  const menuOpen = openMenuId === (comment.commentId || "");

  const closeMenu = useCallback(() => setOpenMenuId(null), [setOpenMenuId]);

  // Dışa tıklayınca menüyü kapat
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (!rowRef.current) return;
      if (!rowRef.current.contains(e.target)) {
        closeMenu();
      }
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen, closeMenu]);

  const handleDelete = async () => {
    closeMenu();
    if (!canDelete) return;
    if (!window.confirm("Bu yorumu silmek istiyor musun?")) return;

    try {
      const coll = contentType === "clip" ? "clips" : "posts";
      const ref = doc(db, coll, contentId);
      // sadece bir kez çekip güncelle
      const snap = await new Promise((resolve) => {
        const unsub = onSnapshot(ref, (s) => { resolve(s); unsub(); });
      });
      const data = snap.data();
      const list = Array.isArray(data?.yorumlar) ? [...data.yorumlar] : [];
      const filtered = list.filter((y) => (y.commentId || "") !== (comment.commentId || ""));
      await updateDoc(ref, { yorumlar: filtered });
    } catch (e) {
      console.error(e);
      alert("Silinemedi. Lütfen tekrar dene.");
    }
  };

  const handleRate = async (value) => {
    if (!currentUser) {
      alert("Puanlamak için giriş yap.");
      return;
    }
    if (!comment?.commentId) return;

    try {
      const coll = contentType === "clip" ? "clips" : "posts";
      const ref = doc(db, coll, contentId);
      const snap = await new Promise((resolve) => {
        const unsub = onSnapshot(ref, (s) => { resolve(s); unsub(); });
      });
      const data = snap.data();
      const arr = Array.isArray(data?.yorumlar) ? [...data.yorumlar] : [];
      const idx = arr.findIndex((y) => (y.commentId || "") === comment.commentId);
      if (idx === -1) return;

      const c = { ...arr[idx] };
      const map = { ...(c.ratingsBy || {}) };
      const prev = typeof map[currentUser.uid] === "number" ? map[currentUser.uid] : null;

      let sum = Number(c.ratingSum || 0);
      let count = Number(c.ratingCount || 0);

      if (prev != null) {
        sum -= Number(prev);
      } else {
        count += 1;
      }
      map[currentUser.uid] = Number(value);
      sum += Number(value);

      arr[idx] = { ...c, ratingsBy: map, ratingSum: sum, ratingCount: count };
      await updateDoc(ref, { yorumlar: arr });
      setRateOpen(false);
    } catch (e) {
      console.error(e);
      alert("Puan verilemedi.");
    }
  };

  // Bu yorum için benim puanım var mı? (küçük yıldızı kırmızı doldurmak için)
  const myScore =
    currentUser && comment?.ratingsBy && typeof comment.ratingsBy[currentUser.uid] === "number"
      ? Number(comment.ratingsBy[currentUser.uid])
      : null;

  return (
    <div ref={rowRef} className={`pdmDk-commentItem${menuOpen ? " menu-open" : ""}`}>
      <img
        src={comment.photoURL || "https://placehold.co/32x32/EFEFEF/AAAAAA?text=P"}
        alt={comment.username || "kullanıcı"}
        className="pdmDk-commentAvatar"
      />
      <div className="pdmDk-commentBody">
        <p>
          <strong onClick={() => onUserClick?.(comment.userId)}>{comment.username || "kullanıcı"}</strong>{" "}
          {comment.text}
        </p>
        <div className="pdmDk-commentMeta">
          <span className="pdmDk-commentTime">{formatTimeAgoShort(comment.timestamp)}</span>
          {comment?.ratingCount > 0 && (
            <span className="pdmDk-commentRating">
              {avg.toFixed(1)} ★ · {comment.ratingCount}
            </span>
          )}
        </div>
      </div>

      <div className="pdmDk-commentActions">
        {/* Mini yıldız: masaüstünde tek tıkla panel açar */}
        <div className="pdmDk-cmStar" title="Yorumu puanla" aria-label="Yorumu puanla">
          <StarRatingV2
            size={18}
            onRate={handleRate}
            className={myScore ? "sr2--rated" : ""}
          />
        </div>

        <div className="pdmDk-cmMoreWrap">
          <button
            className="pdmDk-cmMore"
            aria-label="Daha fazla"
            title="Daha fazla"
            onClick={() =>
              setOpenMenuId((prev) =>
                prev === (comment.commentId || "") ? null : (comment.commentId || "")
              )
            }
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <div className="pdmDk-cmMenu" role="menu">
              {canDelete && (
                <button className="danger" onClick={handleDelete} role="menuitem">
                  Sil
                </button>
              )}
              <button onClick={closeMenu} role="menuitem">İptal</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== Main ===== */
export default function PostDetailModalDesktop({ post, onClose, onUserClick, aktifKullaniciId }) {
  const [contentData, setContentData] = useState(post);
  const [authorProfile, setAuthorProfile] = useState(null);
  const [yeniYorum, setYeniYorum] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [agg, setAgg] = useState(null);
  const [shareToast, setShareToast] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null); // sadece BİR menü açık
  const inputRef = useRef(null);

  const currentUser = auth.currentUser;

  // Herhangi bir yere tıklanınca global menüyü kapat (ör. boş alan)
  useEffect(() => {
    if (!openMenuId) return;
    const onDown = () => setOpenMenuId(null);
    window.addEventListener("blur", onDown);
    return () => window.removeEventListener("blur", onDown);
  }, [openMenuId]);

  useEffect(() => {
    if (!post || !post.id || !post.type) return;
    const collectionName = post.type === "clip" ? "clips" : "posts";
    const ref = doc(db, collectionName, post.id);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setContentData({ id: snap.id, type: post.type, ...snap.data() });
    });
    return () => unsub();
  }, [post]);

  useEffect(() => {
    if (!contentData?.authorId) return;
    const ref = doc(db, "users", contentData.authorId);
    const unsub = onSnapshot(ref, (snap) => snap.exists() && setAuthorProfile(snap.data()));
    return () => unsub();
  }, [contentData?.authorId]);

  useEffect(() => {
    if (!contentData?.id) return;
    const ref = doc(db, "content", contentData.id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      setAgg(d?.agg || null);
    });
    return () => unsub();
  }, [contentData?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await fsIsSaved(contentData?.id);
      if (!cancelled) setIsSaved(saved);
    })();
    return () => { cancelled = true; };
  }, [contentData?.id]);

  const handleYorumGonder = async (e) => {
    e.preventDefault();
    if (!yeniYorum.trim() || !currentUser || !contentData) return;
    setIsSubmitting(true);
    try {
      const coll = contentData.type === "clip" ? "clips" : "posts";
      const ref = doc(db, coll, contentData.id);
      const yorum = {
        commentId: makeCommentId(currentUser.uid),
        text: yeniYorum,
        username: currentUser.displayName || "kullanıcı",
        userId: currentUser.uid,
        photoURL: currentUser.photoURL || "",
        timestamp: new Date().toISOString(),
        ratingsBy: {},
        ratingSum: 0,
        ratingCount: 0,
      };
      const current = Array.isArray(contentData.yorumlar) ? [...contentData.yorumlar] : [];
      current.push(yorum);
      await updateDoc(ref, { yorumlar: current });
      setYeniYorum("");
      inputRef.current?.focus();
    } catch (err) {
      console.error("Yorum eklenirken hata:", err);
      alert("Yorum eklenemedi. Lütfen tekrar dene.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRate = async (value) => {
    if (!contentData?.id || !contentData?.authorId) return;
    const type = contentData.type === "clip" ? "clip" : "post";
    await ensureContentDoc(contentData.id, contentData.authorId, type);
    await sendRating({ contentId: contentData.id, authorId: contentData.authorId, value, type });
  };

  const handleToggleSave = async () => {
    setIsSaved((s) => !s);
    try {
      const { saved } = await fsToggleSave({
        contentId: contentData.id,
        type: contentData.type,
        authorId: contentData.authorId,
        mediaUrl: contentData.mediaUrl,
        caption: contentData.aciklama || contentData.mesaj || "",
      });
      setIsSaved(saved);
    } catch (e) {
      setIsSaved((s) => !s);
      console.error("Kaydet sırasında hata:", e);
    }
  };

  const handleShare = async () => {
    try {
      const permalink = `${window.location.origin}/p/${contentData.id}`;
      if (navigator.share) {
        await navigator.share({ title: "Gönderi", url: permalink });
      } else {
        await navigator.clipboard.writeText(permalink);
        setShareToast("Link kopyalandı");
        setTimeout(() => setShareToast(""), 1600);
      }
    } catch (e) {
      console.error("Paylaşım başarısız:", e);
    }
  };

  const aciklama = contentData?.aciklama || contentData?.mesaj;
  const yorumlar = contentData?.yorumlar || [];
  const sortedYorumlar = useMemo(
    () => [...yorumlar].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [yorumlar]
  );
  const isOwner = contentData?.authorId === aktifKullaniciId;

  return (
    <div className="pdmDk-root" onClick={() => openMenuId && setOpenMenuId(null)}>
      <div className="pdmDk-card" onClick={(e) => e.stopPropagation()}>
        <div className="pdmDk-media">
          {contentData?.type === "clip" ? (
            <video src={contentData?.mediaUrl} className="pdmDk-video" autoPlay controls playsInline />
          ) : (
            <img src={contentData?.mediaUrl} alt="Gönderi" />
          )}
        </div>

        <div className="pdmDk-info">
          <header className="pdmDk-infoHeader">
            <img
              src={authorProfile?.profilFoto || "https://placehold.co/32x32/EFEFEF/AAAAAA?text=P"}
              alt={authorProfile?.kullaniciAdi}
              className="pdmDk-infoAvatar"
              onClick={() => onUserClick?.(contentData.authorId)}
            />
            <span className="pdmDk-infoUsername" onClick={() => onUserClick?.(contentData.authorId)}>
              {authorProfile?.kullaniciAdi}
            </span>
          </header>

          <div className="pdmDk-comments">
            {aciklama && (
              <div className="pdmDk-commentItem">
                <img
                  src={authorProfile?.profilFoto || "https://placehold.co/32x32/EFEFEF/AAAAAA?text=P"}
                  alt={authorProfile?.kullaniciAdi}
                  className="pdmDk-commentAvatar"
                />
                <div className="pdmDk-commentBody">
                  <p>
                    <strong onClick={() => onUserClick?.(contentData.authorId)}>{authorProfile?.kullaniciAdi}</strong>{" "}
                    {aciklama}
                  </p>
                </div>
              </div>
            )}

            {sortedYorumlar.map((y) => (
              <CommentRow
                key={y.commentId || `${y.userId}_${y.timestamp}`}
                contentId={contentData.id}
                contentType={contentData.type}
                isOwner={isOwner}
                currentUser={currentUser}
                comment={y}
                onUserClick={onUserClick}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
              />
            ))}
          </div>

          <div className="pdmDk-footer">
            <div className="pdmDk-actions">
              <div className="pdmDk-starWrap">
                <StarRatingV2 size={28} onRate={handleRate} disabled={isOwner} />
                {agg?.avg > 0 && agg?.count > 0 && (
                  <span className="pdmDk-starMeta" aria-label="Bu içeriğin puanı">
                    {Number(agg.avg).toFixed(1)} ★ · {formatCount(agg.count)} oy
                  </span>
                )}
              </div>

              <button
                className="pdmDk-actionBtn"
                aria-label="Yorumlar"
                onClick={() => inputRef.current?.focus()}
                title="Yorum yaz"
              >
                <CommentIcon />
              </button>

              <button className="pdmDk-actionBtn" aria-label="Paylaş" onClick={handleShare}>
                <ShareIcon />
              </button>

              <button
                className="pdmDk-actionBtn save"
                aria-label={isSaved ? "Kaydedildi" : "Kaydet"}
                onClick={handleToggleSave}
              >
                <SaveIcon isSaved={isSaved} />
              </button>
            </div>

            {shareToast && <div className="pdmDk-shareToast" role="status">{shareToast}</div>}

            {contentData?.yorumlarKapali && (
              <div className="pdmDk-lockedBanner">Yorumlar kapalı</div>
            )}

            <p className="pdmDk-date">{formatTimeAgoShort(contentData?.tarih)}</p>

            {!contentData?.yorumlarKapali && (
              <form onSubmit={handleYorumGonder} className="pdmDk-commentForm">
                <img
                  src={auth.currentUser?.photoURL || "https://placehold.co/32x32/EFEFEF/AAAAAA?text=P"}
                  alt="Profil"
                  className="pdmDk-commentFormAvatar"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={yeniYorum}
                  onChange={(e) => setYeniYorum(e.target.value)}
                  placeholder="Yorum ekle..."
                />
                <button type="submit" disabled={!yeniYorum.trim() || isSubmitting}>
                  Paylaş
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
