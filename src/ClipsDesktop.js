import React, { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "./firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  deleteDoc,
  updateDoc,
  doc,
} from "firebase/firestore";
import { getStorage, ref as sRef, deleteObject } from "firebase/storage";
import "./Clips.css";

/* ---------- helpers ---------- */
function ts(val) {
  if (!val) return 0;
  if (typeof val === "number") return val < 2e12 ? val * 1000 : val;
  if (val.seconds) return val.seconds * 1000;
  if (val._seconds) return val._seconds * 1000;
  const t = Date.parse(val);
  return Number.isFinite(t) ? t : 0;
}

/* small icons */
const PlayBadge = () => (
  <div className="clip-badge" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" role="img">
      <path d="M8 7v10l9-5-9-5z" fill="#fff" />
    </svg>
  </div>
);

const IconStar = ({ filled }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 17.27l6.18 3.73-1.64-7.03L21 9.24l-7.19-.62L12 2 10.19 8.62 3 9.24l4.46 4.73L5.82 21z"
      fill={filled ? "#ffd35a" : "none"}
      stroke="#ffd35a"
      strokeWidth="1.4"
    />
  </svg>
);
const IconComment = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M21 6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h8l4 3v-3h0a3 3 0 0 0 3-3V6z"
      fill="none"
      stroke="#fff"
      strokeWidth="1.4"
    />
  </svg>
);
const IconShare = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 16V4m0 0l-4 4m4-4l4 4"
      fill="none"
      stroke="#fff"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const IconSave = ({ saved }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"
      fill={saved ? "#fff" : "none"}
      stroke="#fff"
      strokeWidth="1.4"
    />
  </svg>
);

/* ---------- component ---------- */
export default function ClipsDesktop({ userId }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [brokenIds, setBrokenIds] = useState(() => new Set());

  // local UI states for right panel actions (persist etmeden)
  const [starred, setStarred] = useState(false);
  const [saved, setSaved] = useState(false);

  /* data */
  useEffect(() => {
    if (!userId) return;
    const qy = query(
      collection(db, "clips"),
      where("authorId", "==", userId),
      orderBy("tarih", "desc"),
      limit(60)
    );
    const unsub = onSnapshot(qy, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      arr.sort((a, b) => ts(b.tarih) - ts(a.tarih));
      setItems(arr);
    });
    return () => unsub();
  }, [userId]);

  /* grid (bozukları süz) */
  const grid = useMemo(() => {
    return (items ?? []).filter((it) => {
      const hasMedia = !!(it.mediaUrl || it.videoUrl);
      return hasMedia && !brokenIds.has(it.id);
    });
  }, [items, brokenIds]);

  const thumbOf = (it) =>
    it.posterUrl || it.thumbUrl || it.previewUrl || it.coverUrl || "";

  const open = useCallback((clip) => {
    setSelected(clip);
    setMenuOpen(false);
    setStarred(!!clip?.currentUserStar); // varsa kullan
    setSaved(!!clip?.currentUserSaved);
  }, []);
  const close = useCallback(() => {
    setSelected(null);
    setMenuOpen(false);
  }, []);

  const markBroken = useCallback((id) => {
    setBrokenIds((prev) => new Set(prev).add(id));
  }, []);

  /* ---- üç nokta menüsü aksiyonları ---- */
  const clipRef = useCallback(
    () => (selected ? doc(db, "clips", selected.id) : null),
    [selected]
  );
  const canDelete = selected && selected.authorId === userId;

  const handleDelete = useCallback(async () => {
    if (!selected || !canDelete) return;
    const ok = window.confirm("Bu clip’i silmek istiyor musun?");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "clips", selected.id));
      try {
        if (selected.storagePath) {
          const st = getStorage();
          await deleteObject(sRef(st, selected.storagePath));
        }
      } catch (_) {}
      setItems((prev) => prev.filter((x) => x.id !== selected.id));
      close();
    } catch (e) {
      console.error("Silinemedi:", e);
      alert("Silinemedi. Lütfen tekrar dene.");
    }
  }, [selected, close, canDelete]);

  const handleEditCaption = useCallback(async () => {
    if (!selected) return;
    const ref = clipRef();
    if (!ref) return;
    const current = selected.caption || "";
    const val = window.prompt("Altyazıyı düzenle:", current);
    if (val == null) return;
    try {
      await updateDoc(ref, { caption: val });
      setSelected((s) => (s ? { ...s, caption: val } : s));
      setItems((prev) =>
        prev.map((x) => (x.id === selected.id ? { ...x, caption: val } : x))
      );
      setMenuOpen(false);
    } catch (e) {
      console.error(e);
      alert("Güncellenemedi.");
    }
  }, [selected, clipRef]);

  const toggleHideLikes = useCallback(async () => {
    if (!selected) return;
    const ref = clipRef();
    if (!ref) return;
    const next = !selected.hideLikes;
    try {
      await updateDoc(ref, { hideLikes: next });
      setSelected((s) => (s ? { ...s, hideLikes: next } : s));
      setItems((prev) =>
        prev.map((x) => (x.id === selected.id ? { ...x, hideLikes: next } : x))
      );
      setMenuOpen(false);
    } catch (e) {
      console.error(e);
      alert("Güncellenemedi.");
    }
  }, [selected, clipRef]);

  const toggleCommentsDisabled = useCallback(async () => {
    if (!selected) return;
    const ref = clipRef();
    if (!ref) return;
    const next = !selected.commentsDisabled;
    try {
      await updateDoc(ref, { commentsDisabled: next });
      setSelected((s) => (s ? { ...s, commentsDisabled: next } : s));
      setItems((prev) =>
        prev.map((x) =>
          x.id === selected.id ? { ...x, commentsDisabled: next } : x
        )
      );
      setMenuOpen(false);
    } catch (e) {
      console.error(e);
      alert("Güncellenemedi.");
    }
  }, [selected, clipRef]);

  const clipLink = (id) => `${window.location.origin}/c/${id}`;

  const goToPost = useCallback(() => {
    if (!selected) return;
    const url = clipLink(selected.id);
    try {
      window.open(url, "_blank", "noopener");
    } catch {
      navigator.clipboard?.writeText(url);
      alert("Bağlantı panoya kopyalandı.");
    }
    setMenuOpen(false);
  }, [selected]);

  const shareClip = useCallback(async () => {
    if (!selected) return;
    const url = clipLink(selected.id);
    const title = "Clip";
    const text = selected.caption || "Clip";
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Bağlantı kopyalandı.");
      }
    } catch {}
    setMenuOpen(false);
  }, [selected]);

  const copyLink = useCallback(async () => {
    if (!selected) return;
    const url = clipLink(selected.id);
    try {
      await navigator.clipboard.writeText(url);
      alert("Bağlantı panoya kopyalandı.");
    } catch {
      alert(url);
    }
    setMenuOpen(false);
  }, [selected]);

  const copyEmbed = useCallback(async () => {
    if (!selected) return;
    const url = clipLink(selected.id);
    const html = `<iframe src="${url}" width="400" height="711" style="border:0;overflow:hidden" allowfullscreen loading="lazy"></iframe>`;
    try {
      await navigator.clipboard.writeText(html);
      alert("Gömme kodu kopyalandı.");
    } catch {
      alert(html);
    }
    setMenuOpen(false);
  }, [selected]);

  const aboutAccount = useCallback(() => {
    if (!selected) return;
    const target = selected.authorUsername
      ? `/u/${encodeURIComponent(selected.authorUsername)}`
      : `/u/${encodeURIComponent(selected.authorId || "")}`;
    try {
      window.open(target, "_blank", "noopener");
    } catch {}
    setMenuOpen(false);
  }, [selected]);

  /* ---------- render ---------- */
  if (!grid || grid.length === 0) {
    return (
      <div className="clips-empty">
        <span className="icon">📷</span>
        <div>Henüz Clip Yok</div>
      </div>
    );
  }

  return (
    <>
      {/* grid */}
      <div className="clips-grid" role="list">
        {grid.map((it) => {
          const media = it.mediaUrl || it.videoUrl || "";
          const poster = thumbOf(it);
          return (
            <button
              key={it.id}
              type="button"
              className="clip-tile"
              role="listitem"
              onClick={() => open(it)}
              aria-label="Clipi aç"
            >
              {/\.(jpe?g|png|webp|avif)$/i.test(poster) ? (
                <img
                  className="clip-media"
                  src={poster}
                  alt={it.caption || "clip"}
                  loading="lazy"
                  onError={() => markBroken(it.id)}
                />
              ) : (
                <video
                  className="clip-media"
                  src={media}
                  poster={poster || undefined}
                  muted
                  playsInline
                  preload="metadata"
                  onError={() => markBroken(it.id)}
                />
              )}
              <div className="clip-hover" />
              <PlayBadge />
            </button>
          );
        })}
      </div>

      {/* modal */}
      {selected && (
        <div className="clip-lightbox" onMouseDown={close}>
          {/* üst bar: sadece kapat */}
          <div
            className="clip-lightbox-topbar"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="clip-icon-btn"
              aria-label="Kapat"
              onClick={close}
              title="Kapat"
            >
              ✕
            </button>
          </div>

          {/* iki sütun düzen */}
          <div
            className="clip-lightbox-body"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* sol (video) */}
            <div className="clip-left">
              <video
                src={selected.mediaUrl || selected.videoUrl}
                controls
                autoPlay
                playsInline
                muted
                /* IG gibi: indir yok, hız yok, PiP kapalı */
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>

            {/* sağ (bilgi/aksiyon paneli) */}
            <aside className="clip-side">
              <header className="clip-side-header">
                <div className="clip-side-user">
                  <img
                    className="clip-avatar"
                    src={
                      selected.authorAvatar ||
                      selected.authorPhotoUrl ||
                      "/assets/avatar.png"
                    }
                    alt=""
                    onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                  />
                  <a
                    href={
                      selected.authorUsername
                        ? `/u/${encodeURIComponent(selected.authorUsername)}`
                        : `/u/${encodeURIComponent(selected.authorId || "")}`
                    }
                    className="clip-username"
                  >
                    {selected.authorUsername || "kullanıcı"}
                  </a>
                </div>

                {/* üç nokta menüsü IG sırasıyla */}
                <div className="clip-side-actions-right">
                  <button
                    className="clip-dot-btn"
                    title="Diğer"
                    onClick={() => setMenuOpen((s) => !s)}
                  >
                    ⋯
                  </button>
                  {menuOpen && (
                    <div
                      className="clip-menu"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {canDelete && <button onClick={handleDelete}>Sil</button>}
                      <button onClick={handleEditCaption}>Düzenle</button>
                      <button onClick={toggleHideLikes}>
                        {selected?.hideLikes
                          ? "Beğenme sayısını göster"
                          : "Beğenme sayısını başkalarından gizle"}
                      </button>
                      <button onClick={toggleCommentsDisabled}>
                        {selected?.commentsDisabled
                          ? "Yorum yapmaya izin ver"
                          : "Yorum yapmayı kapat"}
                      </button>
                      <button onClick={goToPost}>Gönderiye git</button>
                      <button onClick={shareClip}>Paylaş…</button>
                      <button onClick={copyLink}>Bağlantıyı Kopyala</button>
                      <button onClick={copyEmbed}>Sitene Göm</button>
                      <button onClick={aboutAccount}>Bu hesap hakkında</button>
                      <button onClick={() => setMenuOpen(false)}>İptal</button>
                    </div>
                  )}
                </div>
              </header>

              {/* caption */}
              {selected.caption ? (
                <div className="clip-side-caption">{selected.caption}</div>
              ) : null}

              {/* alt aksiyon barı: yıldız / yorum / paylaş / kaydet */}
              <div className="clip-side-cta">
                <button
                  className="clip-cta-btn"
                  onClick={() => setStarred((s) => !s)}
                  title="Yıldız ver"
                >
                  <IconStar filled={starred} />
                </button>
                <button
                  className="clip-cta-btn"
                  onClick={() => {
                    // yorum odaklanması burada kurgulanabilir
                  }}
                  title="Yorum"
                  disabled={!!selected.commentsDisabled}
                >
                  <IconComment />
                </button>
                <button
                  className="clip-cta-btn"
                  onClick={shareClip}
                  title="Paylaş"
                >
                  <IconShare />
                </button>
                <button
                  className="clip-cta-btn"
                  onClick={() => setSaved((s) => !s)}
                  title="Kaydet"
                >
                  <IconSave saved={saved} />
                </button>
              </div>

              {/* sayımlar / durum */}
              <div className="clip-side-meta">
                {!selected?.hideLikes && (
                  <span className="clip-like-count">
                    {selected.viewCountPretty || selected.likeCountPretty || ""}
                  </span>
                )}
                {selected.commentsDisabled && (
                  <span className="clip-muted"> · Yorumlar kapalı</span>
                )}
              </div>

              {/* yorumlar (varsa) */}
              <div className="clip-comments">
                {Array.isArray(selected.yorumlar) && selected.yorumlar.length ? (
                  selected.yorumlar.map((y) => (
                    <div key={y.id || y.ts} className="clip-comment-row">
                      <span className="clip-comment-user">
                        {y.username || "kullanıcı"}:
                      </span>{" "}
                      <span className="clip-comment-text">{y.text}</span>
                    </div>
                  ))
                ) : (
                  <div className="clip-muted small">Henüz yorum yok.</div>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
