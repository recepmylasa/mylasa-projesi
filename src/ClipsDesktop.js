import React, { useEffect, useMemo, useState, useCallback } from "react";
import { auth, db } from "./firebase";
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
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref as sRef, deleteObject } from "firebase/storage";
import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { rateContent, onContentAggregate } from "./reputationClient";
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from "./savesClient";
import "./Clips.css";

/* ---- timestamp normalizasyonu ---- */
function ts(val) {
  if (!val) return 0;
  if (typeof val === "number") return val < 2e12 ? val * 1000 : val;
  if (val.seconds) return val.seconds * 1000;
  if (val._seconds) return val._seconds * 1000;
  const t = Date.parse(val);
  return Number.isFinite(t) ? t : 0;
}

/* grid kartındaki küçük play rozet */
const PlayBadge = () => (
  <div className="clip-badge" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" role="img">
      <path d="M8 7v10l9-5-9-5z" fill="#fff" />
    </svg>
  </div>
);

/* ikonlar */
const Icon = {
  comment: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path
        d="M21 4H3a2 2 0 0 0-2 2v14l4-4h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"
        fill="currentColor"
      />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M2 21 23 12 2 3v7l15 2-15 2v7Z" fill="currentColor" />
    </svg>
  ),
  saveOutline: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path
        d="M6 2h12a2 2 0 0 1 2 2v18l-8-4-8 4V4a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  saveSolid: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M6 2h12a2 2 0 0 1 2 2v18l-8-4-8 4V4a2 2 0 0 1 2-2Z" fill="currentColor" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
};

function Avatar({ src, size = 40 }) {
  const [ok, setOk] = useState(Boolean(src));
  useEffect(() => setOk(Boolean(src)), [src]);
  if (ok) {
    return (
      <img
        className="clip-avatar"
        src={src}
        width={size}
        height={size}
        alt=""
        onError={() => setOk(false)}
      />
    );
  }
  return (
    <div
      className="clip-avatar clip-avatar--fallback"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span>👤</span>
    </div>
  );
}

export default function ClipsDesktop({ userId }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [brokenIds, setBrokenIds] = useState(() => new Set());
  const [composerText, setComposerText] = useState("");
  const [contentAgg, setContentAgg] = useState(null); // StarRating agregesi
  const [isSaved, setIsSaved] = useState(false);      // Kaydet durumu

  /* --- veriler (profil sahibinin clip'leri) --- */
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

  /* seçili clip açıksa doküman bazında dinle (yorumlar canlı gelsin) */
  useEffect(() => {
    if (!selected?.id) return;
    const ref = doc(db, "clips", selected.id);
    const unsub = onSnapshot(ref, (d) => {
      if (!d.exists()) return setSelected(null);
      setSelected({ id: d.id, ...d.data() });
    });
    return () => unsub();
  }, [selected?.id]);

  /* StarRating agregesi (content/{id}.agg) canlı izleme */
  useEffect(() => {
    setContentAgg(null);
    if (!selected?.id) return;
    const stop = onContentAggregate(selected.id, (agg) => setContentAgg(agg || null));
    return () => (typeof stop === "function" ? stop() : undefined);
  }, [selected?.id]);

  /* Kaydet durumu (seçili içerik değiştiğinde kontrol et) */
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!selected?.id) return setIsSaved(false);
      const s = await fsIsSaved(selected.id);
      if (!cancel) setIsSaved(s);
    })();
    return () => { cancel = true; };
  }, [selected?.id]);

  /* görünür grid (bozuk/eksik medya filtreli) */
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
    setSheetOpen(false);
    setComposerText("");
    document.body.style.overflow = "hidden";
  }, []);
  const close = useCallback(() => {
    setSelected(null);
    setSheetOpen(false);
    setComposerText("");
    document.body.style.overflow = "";
  }, []);
  const stop = (e) => e.stopPropagation();

  const markBroken = useCallback((id) => {
    setBrokenIds((prev) => new Set(prev).add(id));
  }, []);

  /* ---- üç nokta sheet aksiyonları ---- */
  const clipRef = useCallback(
    () => (selected ? doc(db, "clips", selected.id) : null),
    [selected]
  );

  const canDelete = selected && selected.authorId === userId;

  const handleDelete = useCallback(async () => {
    if (!selected || !canDelete) return;
    if (!window.confirm("Bu clip’i silmek istiyor musun?")) return;
    try {
      await deleteDoc(doc(db, "clips", selected.id));
      try {
        if (selected.storagePath) {
          const st = getStorage();
          await deleteObject(sRef(st, selected.storagePath));
        }
      } catch {}
      setItems((prev) => prev.filter((x) => x.id !== selected.id));
      close();
    } catch (e) {
      console.error(e);
      alert("Silinemedi. Lütfen tekrar dene.");
    }
  }, [selected, canDelete, close]);

  const handleEditCaption = useCallback(async () => {
    if (!selected) return;
    const ref = clipRef();
    if (!ref) return;
    const val = window.prompt("Altyazıyı düzenle:", selected.caption || "");
    if (val == null) return;
    try {
      await updateDoc(ref, { caption: val });
      setSelected((s) => (s ? { ...s, caption: val } : s));
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
      setSheetOpen(false);
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
      setSheetOpen(false);
    } catch (e) {
      console.error(e);
      alert("Güncellenemedi.");
    }
  }, [selected, clipRef]);

  const clipLink = (id) => `${window.location.origin}/c/${id}`;

  const goToPost = useCallback(() => {
    if (!selected) return;
    window.open(clipLink(selected.id), "_blank", "noopener");
    setSheetOpen(false);
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
    setSheetOpen(false);
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
    setSheetOpen(false);
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
    setSheetOpen(false);
  }, [selected]);

  const aboutAccount = useCallback(() => {
    if (!selected) return;
    const target = selected.authorUsername
      ? `/u/${encodeURIComponent(selected.authorUsername)}`
      : `/u/${encodeURIComponent(selected.authorId || "")}`;
    window.open(target, "_blank", "noopener");
    setSheetOpen(false);
  }, [selected]);

  /* ====== Yorum Composer ====== */
  const onComposerInput = useCallback((e) => {
    const ta = e.currentTarget;
    ta.style.height = "auto";
    ta.style.height = Math.min(120, ta.scrollHeight) + "px";
    setComposerText(ta.value);
  }, []);

  const submitComment = useCallback(async () => {
    if (!selected) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      alert("Yorum yapmak için lütfen giriş yap.");
      return;
    }
    if (selected.commentsDisabled) return;

    const text = (composerText || "").trim();
    if (!text) return;

    try {
      const ref = doc(db, "clips", selected.id);
      const nextArray = [ ...(selected.yorumlar || []), {
        userId: uid,
        text,
        createdAt: serverTimestamp(),
      } ];
      await updateDoc(ref, { yorumlar: nextArray });
      setComposerText("");
    } catch (e) {
      console.error(e);
      alert("Yorum eklenemedi. Lütfen tekrar dene.");
    }
  }, [composerText, selected]);

  const onComposerKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitComment();
      }
    },
    [submitComment]
  );

  /* Kaydet toggle */
  const onToggleSave = useCallback(async () => {
    if (!selected?.id) return;
    setIsSaved((s) => !s); // iyimser
    try {
      const { saved } = await fsToggleSave({
        contentId: selected.id,
        type: "clip",
        authorId: selected.authorId,
        mediaUrl: selected.mediaUrl || selected.videoUrl || "",
        caption: selected.caption || "",
      });
      setIsSaved(saved);
    } catch (e) {
      console.error(e);
      setIsSaved((s) => !s); // geri al
      alert("Kaydetme başarısız.");
    }
  }, [selected]);

  /* ---- boş durum ---- */
  if (!grid || grid.length === 0) {
    return (
      <div className="clips-empty">
        <span className="icon">📷</span>
        <div>Henüz Clip Yok</div>
      </div>
    );
  }

  /* ---- render ---- */
  const comments = selected?.yorumlar || [];
  const currentUid = auth.currentUser?.uid;
  const ratingCount = contentAgg?.count ?? Number(selected?.starsCount || 0);

  return (
    <>
      {/* Masaüstü 4’lü Reels ızgarası */}
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

      {/* IG masaüstü modal: solda video, sağda meta/yorum paneli */}
      {selected && (
        <div className="clip-lightbox" onMouseDown={close}>
          <div className="clip-dialog" onMouseDown={stop} role="dialog" aria-modal="true">
            {/* sol: video sahnesi */}
            <div className="clip-stage">
              <div className="clip-frame" aria-label="Video çerçevesi 9:16">
                <video
                  src={selected.mediaUrl || selected.videoUrl}
                  controls
                  autoPlay
                  playsInline
                  muted
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  onContextMenu={(e) => e.preventDefault()}
                />
              </div>
            </div>

            {/* sağ: meta panel (beyaz tema) */}
            <aside className="clip-meta">
              {/* üst başlık: avatar + username + follow + ... + kapat */}
              <div className="clip-meta-head">
                <div className="clip-head-left">
                  <Avatar src={selected?.authorProfilePic} />
                  <div className="clip-identity">
                    <div className="clip-username">
                      {selected?.authorUsername || "kullanıcı"}
                    </div>
                    <div className="clip-follow">Takip Et</div>
                  </div>
                </div>

                <div className="clip-head-icons">
                  <button
                    className="clip-ghost-btn"
                    title="Diğer"
                    aria-label="Diğer"
                    onClick={() => setSheetOpen(true)}
                  >
                    {Icon.more}
                  </button>
                  <button
                    className="clip-ghost-btn"
                    title="Kapat"
                    aria-label="Kapat"
                    onClick={close}
                  >
                    {Icon.close}
                  </button>
                </div>
              </div>

              {/* yorumlar alanı (scroll) */}
              <div className="clip-comments">
                {/* caption (varsa) */}
                {selected?.caption ? (
                  <div className="clip-caption-row">
                    <Avatar src={selected?.authorProfilePic} size={28} />
                    <div className="clip-caption-bubble">
                      <span className="clip-username--inline">
                        {selected?.authorUsername || "kullanıcı"}
                      </span>{" "}
                      {selected?.caption}
                    </div>
                  </div>
                ) : null}

                {/* yorumlar */}
                {comments.length > 0 ? (
                  comments.map((c, i) => (
                    <div key={i} className="clip-caption-row">
                      <Avatar src={null} size={28} />
                      <div className="clip-caption-bubble">
                        <span className="clip-username--inline">
                          {c.userId === currentUid ? "Sen" : "kullanıcı"}
                        </span>{" "}
                        {c.text}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="clip-comment-empty">Henüz yorum yok.</div>
                )}
              </div>

              {/* composer */}
              <div
                className={
                  "clip-composer" +
                  (selected?.commentsDisabled ? " clip-composer--disabled" : "")
                }
              >
                <textarea
                  className="clip-composer-input"
                  placeholder={
                    selected?.commentsDisabled ? "Yorumlar kapalı" : "Yorum ekle…"
                  }
                  value={composerText}
                  onInput={onComposerInput}
                  onKeyDown={onComposerKeyDown}
                  rows={1}
                  disabled={!!selected?.commentsDisabled}
                  aria-label="Yorum ekle"
                />
                <button
                  className="clip-composer-send"
                  title="Gönder"
                  aria-label="Yorumu gönder"
                  onClick={submitComment}
                  disabled={
                    !!selected?.commentsDisabled || !(composerText || "").trim()
                  }
                >
                  {Icon.send}
                </button>
              </div>

              {/* alt aksiyon barı */}
              <div className="clip-actions" role="group" aria-label="Aksiyonlar">
                <div className="clip-actions-left">
                  {/* StarRatingV2 */}
                  <StarRatingV2
                    className="clip-star"
                    onRate={async (value) => {
                      try {
                        await rateContent({
                          contentId: selected.id,
                          authorId: selected.authorId,
                          value,
                          type: "clip",
                        });
                      } catch (e) {
                        console.error(e);
                        alert(e?.message || "Oy verilemedi.");
                      }
                    }}
                  />

                  <button className="clip-action-btn" title="Yorum" aria-label="Yorum yap">
                    {Icon.comment}
                  </button>
                  <button className="clip-action-btn" title="Paylaş" aria-label="Paylaş" onClick={shareClip}>
                    {Icon.send}
                  </button>
                </div>
                <div className="clip-actions-right">
                  <button
                    className={"clip-action-btn" + (isSaved ? " save-active" : "")}
                    title={isSaved ? "Kaydedildi" : "Kaydet"}
                    aria-label={isSaved ? "Kaydedildi" : "Kaydet"}
                    onClick={onToggleSave}
                  >
                    {isSaved ? Icon.saveSolid : Icon.saveOutline}
                  </button>
                </div>
              </div>

              {/* metrikler + tarih */}
              <div className="clip-meta-footer">
                {!selected?.hideLikes && (
                  <div className="clip-stats">
                    <strong className="clip-stats-strong">{ratingCount}</strong> oy
                  </div>
                )}
                <div className="clip-time">
                  {selected?.tarih
                    ? new Date(ts(selected.tarih)).toLocaleString()
                    : ""}
                </div>
              </div>
            </aside>
          </div>

          {/* IG tarzı beyaz sheet menüsü */}
          {sheetOpen && (
            <>
              <div className="sheet-mask" onClick={() => setSheetOpen(false)} />
              <div className="sheet" role="dialog" onMouseDown={stop}>
                <ul className="sheet-list">
                  {canDelete && (
                    <li className="sheet-item sheet-danger" onClick={handleDelete}>
                      Sil
                    </li>
                  )}
                  <li className="sheet-item" onClick={handleEditCaption}>
                    Düzenle
                  </li>
                  <li className="sheet-item" onClick={toggleHideLikes}>
                    {selected?.hideLikes
                      ? "Beğenme sayısını göster"
                      : "Beğenme sayısını başkalarından gizle"}
                  </li>
                  <li className="sheet-item" onClick={toggleCommentsDisabled}>
                    {selected?.commentsDisabled
                      ? "Yorum yapmaya izin ver"
                      : "Yorum yapmayı kapat"}
                  </li>
                  <li className="sheet-item" onClick={goToPost}>
                    Gönderiye git
                  </li>
                  <li className="sheet-item" onClick={shareClip}>
                    Paylaş…
                  </li>
                  <li className="sheet-item" onClick={copyLink}>
                    Bağlantıyı Kopyala
                  </li>
                  <li className="sheet-item" onClick={copyEmbed}>
                    Sitene Göm
                  </li>
                  <li className="sheet-item" onClick={aboutAccount}>
                    Bu hesap hakkında
                  </li>
                  <li
                    className="sheet-item sheet-cancel"
                    onClick={() => setSheetOpen(false)}
                  >
                    İptal
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
