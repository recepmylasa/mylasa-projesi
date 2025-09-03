// src/Clips.js — TEK DOSYA (StarRatingV2 + yorum puanlama dahil)
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getStorage, ref as sRef, deleteObject } from "firebase/storage";
import { rateContent, onContentAggregate } from "./reputationClient";
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from "./savesClient";
import "./Clips.css";

/* -------------------------------------------------------------------------- */
/* StarRatingV2 (INLINE) – tek ikon, basınca 5'li panel, tekrar basınca iptal */
/* -------------------------------------------------------------------------- */
function StarRatingV2({
  size = 18,
  disabled = false,
  active = false,
  initialValue = null,
  onRate,
  className = "",
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelXY, setPanelXY] = useState({ x: 0, y: 0 });
  const [hoverVal, setHoverVal] = useState(null);
  const [myVal, setMyVal] = useState(initialValue);
  const [popVal, setPopVal] = useState(null);

  useEffect(() => setMyVal(initialValue), [initialValue]);

  useEffect(() => {
    if (!panelOpen) return;
    const close = () => setPanelOpen(false);
    const onEsc = (e) => { if (e.key === "Escape") setPanelOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onEsc);
    };
  }, [panelOpen]);

  const openPanelAt = (clientX, clientY) => {
    const margin = 14;
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    const x = Math.max(margin, Math.min(clientX, w - margin));
    const y = Math.max(margin + 40, Math.min(clientY, h - margin));
    setPanelXY({ x, y });
    setHoverVal(null);
    setPanelOpen(true);
  };

  const onSmallStarMouseDown = (e) => {
    if (disabled) return;
    e.stopPropagation();
    // toggle: panel kapalıyken ve önceden oy varsa -> iptal
    if (!panelOpen && (myVal || active)) {
      setMyVal(null);
      setPopVal(null);
      onRate && onRate(null);
      return;
    }
    openPanelAt(e.clientX, e.clientY);
  };

  const choose = (val) => {
    setPanelOpen(false);
    setMyVal(val);
    setPopVal(val);
    onRate && onRate(val);
    setTimeout(() => setPopVal(null), 720);
  };

  const SmallStar = ({ filled }) => (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      style={{ display:"block", transition:"transform .12s ease" }}
    >
      <path
        d="M12 3.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 18.9 6.1 21.7l1.13-6.58L2.45 10.4l6.6-.96L12 3.5z"
        fill={filled ? "#FF4D4F" : "none"}
        stroke="#111" strokeWidth="1.4"
      />
    </svg>
  );

  const PanelStar = ({ hot }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 18.9 6.1 21.7l1.13-6.58L2.45 10.4l6.6-.96L12 3.5z"
        fill={hot ? "#FF4D4F" : "none"}
        stroke="#111" strokeWidth="1.4"
      />
    </svg>
  );

  return (
    <>
      <div
        className={"sr2-root " + className + (disabled ? " sr2-disabled" : "")}
        onMouseDown={onSmallStarMouseDown}
        title={disabled ? "" : (myVal || active ? "Oyu iptal et" : "Yıldız ver")}
        style={{
          position:"relative", display:"inline-flex", alignItems:"center",
          justifyContent:"center", cursor: disabled ? "default" : "pointer",
          userSelect:"none"
        }}
      >
        <SmallStar filled={Boolean(myVal || active)} />
      </div>

      {panelOpen && !disabled && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position:"fixed",
            left: panelXY.x,
            top: panelXY.y,
            transform:"translate(-50%, calc(-100% - 10px))",
            background:"rgba(255,255,255,0.98)",
            border:"1px solid #111",
            borderRadius:12,
            padding:"6px 8px",
            display:"flex",
            gap:6,
            zIndex:5010,
            boxShadow:"0 10px 24px rgba(0,0,0,.35)",
            animation:"sr2fade .14s ease-out",
          }}
        >
          {[1,2,3,4,5].map(v => (
            <button
              key={v}
              onMouseEnter={() => setHoverVal(v)}
              onMouseLeave={() => setHoverVal(null)}
              onFocus={() => setHoverVal(v)}
              onClick={() => choose(v)}
              aria-label={`${v} yıldız`}
              style={{ appearance:"none", border:0, background:"transparent", padding:2, cursor:"pointer" }}
            >
              <PanelStar hot={(hoverVal ?? myVal) >= v} />
            </button>
          ))}
        </div>
      )}

      {popVal != null && (
        <div style={{
          position:"fixed", inset:0, pointerEvents:"none", zIndex:5500,
          display:"flex", alignItems:"center", justifyContent:"center"
        }}>
          <div style={{
            width:180, height:180, opacity:0, transform:"scale(.72)",
            filter:"drop-shadow(0 14px 40px rgba(0,0,0,.35))",
            animation:"sr2pop .70s ease forwards",
            position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center"
          }}>
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width:"100%", height:"100%" }}>
              <path
                d="M12 3.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 18.9 6.1 21.7l1.13-6.58L2.45 10.4l6.6-.96L12 3.5z"
                fill="#FF6B6E" stroke="#111" strokeWidth="1.4"
              />
            </svg>
            <div style={{
              position:"absolute", fontWeight:800, fontSize:64, color:"#1a1a1a",
              textShadow:"0 1px 0 rgba(255,255,255,0.65)", lineHeight:1, transform:"translateY(4px)"
            }}>{popVal}</div>
          </div>
        </div>
      )}

      {/* küçük animasyon keyframes (inline) */}
      <style>{`
        @keyframes sr2fade {
          from { opacity: 0; transform: translate(-50%, calc(-100% - 4px)) scale(.98); }
          to { opacity: 1; transform: translate(-50%, calc(-100% - 10px)) scale(1); }
        }
        @keyframes sr2pop {
          0% { opacity: 0; transform: scale(.72); }
          16% { opacity: 1; transform: scale(1.06); }
          42% { opacity: 1; transform: scale(1.0); }
          78% { opacity: .98; transform: scale(.96); }
          100% { opacity: 0; transform: scale(.92); }
        }
      `}</style>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* YORUM PUANLAMA İSTEMCİSİ (INLINE)                                          */
/* -------------------------------------------------------------------------- */
function commentKeyFor(contentId, comment) {
  let ms = 0;
  try { ms = Date.parse(comment?.timestamp || 0) || 0; } catch {}
  const uid = comment?.userId || "x";
  return `${contentId}__${ms}__${uid}`;
}
function ratingDocId(commentKey, raterUid) { return `${commentKey}__${raterUid}`; }

async function rateComment({ contentId, comment, value }) {
  const user = auth.currentUser;
  if (!user) throw new Error("Giriş gerekli");
  const commentKey = commentKeyFor(contentId, comment);
  const aggRef = doc(db, "comment_agg", commentKey);
  const voteRef = doc(db, "comment_ratings", ratingDocId(commentKey, user.uid));

  await runTransaction(db, async (tx) => {
    const prevSnap = await tx.get(voteRef);
    const aggSnap = await tx.get(aggRef);
    const prevVal = prevSnap.exists() ? Number(prevSnap.data().value || 0) : null;
    let count = 0, sum = 0;
    if (aggSnap.exists()) {
      const d = aggSnap.data();
      count = Number(d.count || 0);
      sum = Number(d.sum || 0);
    }
    if (value == null) {
      if (prevVal != null) { count = Math.max(0, count - 1); sum = sum - prevVal; tx.delete(voteRef); }
    } else {
      const v = Math.max(1, Math.min(5, Number(value)));
      if (prevVal == null) { count += 1; sum += v; }
      else { sum += v - prevVal; }
      tx.set(voteRef, {
        commentKey, contentId, raterUid: user.uid, value: v, updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    const avg = count > 0 ? sum / count : 0;
    tx.set(aggRef, { count, sum, avg }, { merge: true });
  });
  return true;
}

async function getMyCommentRating(commentKey) {
  const user = auth.currentUser;
  if (!user) return null;
  const ref = doc(db, "comment_ratings", ratingDocId(commentKey, user.uid));
  const s = await getDoc(ref);
  return s.exists() ? Number(s.data().value || 0) : null;
}
async function onCommentAggregate(commentKey, cb) {
  const ref = doc(db, "comment_agg", commentKey);
  return onSnapshot(ref, (snap) => {
    const d = snap.exists() ? snap.data() : null;
    cb(d ? { count: d.count || 0, avg: d.avg || 0 } : { count: 0, avg: 0 });
  });
}

/* -------------------------------------------------------------------------- */
/* Yardımcılar                                                                */
/* -------------------------------------------------------------------------- */
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
const Icon = {
  comment: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M21 4H3a2 2 0 0 0-2 2v14l4-4h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" fill="currentColor" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M2 21 23 12 2 3v7l15 2-15 2v7Z" fill="currentColor" />
    </svg>
  ),
  saveOutline: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M6 2h12a2 2 0 0 1 2 2v18l-8-4-8 4V4a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
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

/* -------------------------------------------------------------------------- */
/* CommentItem – tek satır yorum + yıldız                                     */
/* -------------------------------------------------------------------------- */
function CommentItem({ comment, contentId, currentUid, sheetOpen }) {
  const [agg, setAgg] = useState({ count: 0, avg: 0 });
  const [mine, setMine] = useState(null);
  const key = useMemo(
    () => commentKeyFor(contentId, comment),
    [contentId, comment?.timestamp, comment?.userId]
  );

  useEffect(() => {
    let off;
    onCommentAggregate(key, (a) => setAgg(a)).then((u) => (off = u));
    getMyCommentRating(key).then((v) => setMine(v));
    return () => { if (typeof off === "function") off(); };
  }, [key]);

  const give = async (val) => {
    try {
      await rateComment({ contentId, comment, value: val });
      setMine(val);
    } catch (e) {
      console.error(e);
      alert(e?.message || "Oy verilemedi.");
    }
  };

  const name = comment.username || (comment.userId === currentUid ? (auth.currentUser?.displayName || "Sen") : "kullanıcı");

  return (
    <div className="clip-caption-row">
      <Avatar src={comment.photoURL || null} size={28} />
      <div className="clip-caption-bubble" style={{ position:"relative", width:"100%" }}>
        <span className="clip-username--inline">{name}</span>{" "}
        {comment.text}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6, justifyContent:"space-between" }}>
          <span style={{ fontSize:12, color:"#8e8e8e" }}>
            {agg.count > 0 ? `${Number(agg.avg||0).toFixed(1)} ★ · ${agg.count}` : ""}
          </span>
          <StarRatingV2
            size={18}
            disabled={!!sheetOpen}
            active={!!mine}
            initialValue={mine}
            onRate={give}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ClipsDesktop                                                                */
/* -------------------------------------------------------------------------- */
export default function ClipsDesktop({ userId }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [brokenIds, setBrokenIds] = useState(() => new Set());
  const [composerText, setComposerText] = useState("");
  const [contentAgg, setContentAgg] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [authorProfile, setAuthorProfile] = useState(null);

  const composerRef = useRef(null);

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

  useEffect(() => {
    if (!selected?.id) return;
    const ref = doc(db, "clips", selected.id);
    const unsub = onSnapshot(ref, (d) => {
      if (!d.exists()) return setSelected(null);
      setSelected({ id: d.id, ...d.data() });
    });
    return () => unsub();
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.authorId) { setAuthorProfile(null); return; }
    const uref = doc(db, "users", selected.authorId);
    const unsub = onSnapshot(uref, (s) => setAuthorProfile(s.exists() ? s.data() : null));
    return () => unsub();
  }, [selected?.authorId]);

  useEffect(() => {
    setContentAgg(null);
    if (!selected?.id) return;
    const stop = onContentAggregate(selected.id, (agg) => setContentAgg(agg || null));
    return () => (typeof stop === "function" ? stop() : undefined);
  }, [selected?.id]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!selected?.id) return setIsSaved(false);
      const s = await fsIsSaved(selected.id);
      if (!cancel) setIsSaved(s);
    })();
    return () => { cancel = true; };
  }, [selected?.id]);

  const thumbOf = (it) =>
    it.posterUrl || it.thumbUrl || it.previewUrl || it.coverUrl || "";

  const open = useCallback((clip) => {
    const idx = grid.findIndex((g) => g.id === clip.id);
    setSelected(clip);
    setSelectedIndex(idx);
    setSheetOpen(false);
    setComposerText("");
    document.body.style.overflow = "hidden";
  }, [grid]);

  const close = useCallback(() => {
    setSelected(null);
    setSelectedIndex(-1);
    setSheetOpen(false);
    setComposerText("");
    document.body.style.overflow = "";
  }, []);

  const stop = (e) => e.stopPropagation();

  const markBroken = useCallback((id) => {
    setBrokenIds((prev) => new Set(prev).add(id));
  }, []);

  const goPrev = useCallback(() => {
    if (selectedIndex < 0) return;
    const prev = (selectedIndex - 1 + grid.length) % grid.length;
    const it = grid[prev];
    if (it) {
      setSelected(it);
      setSelectedIndex(prev);
      setSheetOpen(false);
      setComposerText("");
    }
  }, [selectedIndex, grid]);

  const goNext = useCallback(() => {
    if (selectedIndex < 0) return;
    const next = (selectedIndex + 1) % grid.length;
    const it = grid[next];
    if (it) {
      setSelected(it);
      setSelectedIndex(next);
      setSheetOpen(false);
      setComposerText("");
    }
  }, [selectedIndex, grid]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, close, goPrev, goNext]);

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
      const displayName =
        auth.currentUser?.displayName ||
        authorProfile?.kullaniciAdi ||
        "kullanıcı";
      const photoURL = auth.currentUser?.photoURL || null;

      const current = Array.isArray(selected.yorumlar) ? [...selected.yorumlar] : [];
      current.push({
        userId: uid,
        username: displayName,
        photoURL,
        text,
        timestamp: new Date().toISOString(),
      });

      await updateDoc(ref, { yorumlar: current });
      setComposerText("");
      if (composerRef.current) composerRef.current.style.height = "auto";
    } catch (e) {
      console.error(e);
      alert("Yorum eklenemedi. Lütfen tekrar dene.");
    }
  }, [composerText, selected, authorProfile]);

  const onComposerKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitComment();
      }
    },
    [submitComment]
  );

  const onToggleSave = useCallback(async () => {
    if (!selected?.id) return;
    setIsSaved((s) => !s);
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
      setIsSaved((s) => !s);
      alert("Kaydetme başarısız.");
    }
  }, [selected]);

  if (!grid || grid.length === 0) {
    return (
      <div className="clips-empty">
        <span className="icon">📷</span>
        <div>Henüz Clip Yok</div>
      </div>
    );
  }

  const comments = selected?.yorumlar || [];
  const currentUid = auth.currentUser?.uid;
  const ratingCount = contentAgg?.count ?? Number(selected?.starsCount || 0);
  const ratingAvg =
    contentAgg?.avg ?? contentAgg?.bayes ?? (ratingCount > 0 ? (contentAgg?.sum || 0) / ratingCount : 0);

  const headerAvatar = authorProfile?.profilFoto || selected?.authorProfilePic || null;
  const headerUsername = authorProfile?.kullaniciAdi || selected?.authorUsername || "kullanıcı";

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
          <div className="clip-dialog" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
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

            <aside className="clip-meta">
              <div className="clip-meta-head">
                <div className="clip-head-left">
                  <Avatar src={headerAvatar} />
                  <div className="clip-identity">
                    <div className="clip-username">{headerUsername}</div>
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
                  <button className="clip-ghost-btn" title="Kapat" aria-label="Kapat" onClick={close}>
                    {Icon.close}
                  </button>
                </div>
              </div>

              <div className="clip-comments">
                {selected?.caption ? (
                  <div className="clip-caption-row">
                    <Avatar src={headerAvatar} size={28} />
                    <div className="clip-caption-bubble">
                      <span className="clip-username--inline">{headerUsername}</span>{" "}
                      {selected?.caption}
                    </div>
                  </div>
                ) : null}

                {comments.length > 0 ? (
                  comments.map((c, i) => (
                    <CommentItem
                      key={i}
                      comment={c}
                      contentId={selected.id}
                      currentUid={currentUid}
                      sheetOpen={sheetOpen}
                    />
                  ))
                ) : (
                  <div className="clip-comment-empty">Henüz yorum yok.</div>
                )}
              </div>

              <div
                className={
                  "clip-composer" + (selected?.commentsDisabled ? " clip-composer--disabled" : "")
                }
              >
                <textarea
                  ref={composerRef}
                  className="clip-composer-input"
                  placeholder={selected?.commentsDisabled ? "Yorumlar kapalı" : "Yorum ekle…"}
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
                  disabled={!!selected?.commentsDisabled || !(composerText || "").trim()}
                >
                  {Icon.send}
                </button>
              </div>

              <div className="clip-actions" role="group" aria-label="Aksiyonlar">
                <div className="clip-actions-left">
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

                  <button
                    className="clip-action-btn"
                    title="Yorum"
                    aria-label="Yorum yap"
                    onClick={() => composerRef.current?.focus()}
                  >
                    {Icon.comment}
                  </button>

                  <button
                    className="clip-action-btn"
                    title="Paylaş"
                    aria-label="Paylaş"
                    onClick={shareClip}
                  >
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

              <div className="clip-meta-footer">
                {!selected?.hideLikes && (
                  <div className="clip-stats">
                    {ratingCount > 0 ? (
                      <>
                        <strong className="clip-stats-strong">
                          {Number(ratingAvg || 0).toFixed(1)} ★
                        </strong>{" "}
                        · {ratingCount} oy
                      </>
                    ) : (
                      <span>İlk oyu sen ver</span>
                    )}
                  </div>
                )}
                <div className="clip-time">
                  {selected?.tarih ? new Date(ts(selected.tarih)).toLocaleString() : ""}
                </div>
              </div>
            </aside>
          </div>

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
                  <li className="sheet-item" onClick={handleEditCaption}>Düzenle</li>
                  <li className="sheet-item" onClick={toggleHideLikes}>
                    {selected?.hideLikes ? "Beğenme sayısını göster" : "Beğenme sayısını başkalarından gizle"}
                  </li>
                  <li className="sheet-item" onClick={toggleCommentsDisabled}>
                    {selected?.commentsDisabled ? "Yorum yapmaya izin ver" : "Yorum yapmayı kapat"}
                  </li>
                  <li className="sheet-item" onClick={goToPost}>Gönderiye git</li>
                  <li className="sheet-item" onClick={shareClip}>Paylaş…</li>
                  <li className="sheet-item" onClick={copyLink}>Bağlantıyı Kopyala</li>
                  <li className="sheet-item" onClick={copyEmbed}>Sitene Göm</li>
                  <li className="sheet-item" onClick={aboutAccount}>Bu hesap hakkında</li>
                  <li className="sheet-item" onClick={() => setSheetOpen(false)}>İptal</li>
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
