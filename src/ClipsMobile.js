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

function ts(val) {
  if (!val) return 0;
  if (typeof val === "number") return val < 2e12 ? val * 1000 : val;
  if (val.seconds) return val.seconds * 1000;
  if (val._seconds) return val._seconds * 1000;
  const t = Date.parse(val);
  return Number.isFinite(t) ? t : 0;
}

const PlayBadge = () => (
  <div className="clip-badge" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" role="img">
      <path d="M8 7v10l9-5-9-5z" fill="#fff" />
    </svg>
  </div>
);

export default function ClipsMobile({ userId }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [brokenIds, setBrokenIds] = useState(() => new Set());

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
  }, []);
  const close = useCallback(() => {
    setSelected(null);
    setMenuOpen(false);
  }, []);

  const markBroken = useCallback((id) => {
    setBrokenIds((prev) => new Set(prev).add(id));
  }, []);

  // Menu helpers
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
    const html = `<iframe src="${url}" width="360" height="640" style="border:0;overflow:hidden" allowfullscreen loading="lazy"></iframe>`;
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
    const target =
      selected.authorUsername
        ? `/u/${encodeURIComponent(selected.authorUsername)}`
        : `/u/${encodeURIComponent(selected.authorId || "")}`;
    try {
      window.open(target, "_blank", "noopener");
    } catch {}
    setMenuOpen(false);
  }, [selected]);

  // ---- Render ----
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

      {selected && (
        <div className="clip-lightbox" onMouseDown={close}>
          <div
            className="clip-lightbox-topbar"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="clip-icon-btn"
              title="Diğer"
              onClick={() => setMenuOpen((s) => !s)}
            >
              ⋯
            </button>
            <button
              className="clip-icon-btn"
              aria-label="Kapat"
              onClick={close}
              title="Kapat"
            >
              ✕
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

          <div
            className="clip-lightbox-body"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <video
              src={selected.mediaUrl || selected.videoUrl}
              controls
              autoPlay
              playsInline
              muted
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              style={{ maxWidth: "96vw", maxHeight: "70vh", background: "#000" }}
              onContextMenu={(e) => e.preventDefault()}
            />
            {selected.caption ? (
              <div className="clip-caption" style={{ color: "#fff", marginTop: 10 }}>
                {selected.caption}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
