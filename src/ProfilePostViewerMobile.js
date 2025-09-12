// src/ProfilePostViewerMobile.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { auth, db } from "./firebase";
import {
  collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc,
} from "firebase/firestore";
import StarRatingV2 from "./components/StarRatingV2/StarRatingV2";
import { ensureContentDoc, rateContent as sendRating } from "./reputationClient";
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from "./savesClient";
import "./ProfilePostViewerMobile.css";

function ts(v){ if(!v) return 0; if(typeof v==="number") return v<2e12? v*1000:v;
  if(v.seconds) return v.seconds*1000; const t=Date.parse(v); return Number.isFinite(t)?t:0; }

export default function ProfilePostViewerMobile({ userId, startId, onClose }) {
  const [items, setItems] = useState([]);
  const [initialIndex, setInitialIndex] = useState(0);
  const [savedMap, setSavedMap] = useState({});
  const listRef = useRef(null);

  // posts + clips (aynı profilden)
  useEffect(() => {
    if (!userId) return;
    const qPosts = query(
      collection(db, "posts"),
      where("authorId", "==", userId),
      orderBy("tarih", "desc"),
      limit(50)
    );
    const qClips = query(
      collection(db, "clips"),
      where("authorId", "==", userId),
      orderBy("tarih", "desc"),
      limit(50)
    );

    const unsubs = [];
    const buf = { posts: [], clips: [] };

    const flush = () => {
      const merged = [...buf.posts.map(x => ({...x, type:"post"})),
                      ...buf.clips.map(x => ({...x, type:"clip"}))];
      merged.sort((a,b)=> ts(b.tarih)-ts(a.tarih));
      setItems(merged);
      if (startId) {
        const idx = merged.findIndex(x => x.id === startId);
        setInitialIndex(idx >= 0 ? idx : 0);
      }
    };

    unsubs.push(onSnapshot(qPosts, s=>{
      buf.posts = s.docs.map(d=>({id:d.id, ...d.data()}));
      flush();
    }));
    unsubs.push(onSnapshot(qClips, s=>{
      buf.clips = s.docs.map(d=>({id:d.id, ...d.data()}));
      flush();
    }));

    return () => unsubs.forEach(u=>u());
  }, [userId, startId]);

  // açılışta ilgili karta kaydır
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const child = el.children[initialIndex];
    if (child) child.scrollIntoView({ block: "start", behavior: "instant" });
  }, [items.length, initialIndex]);

  const toggleSave = useCallback(async (it) => {
    setSavedMap(m => ({...m, [it.id]: !(m[it.id])}));
    try {
      const { saved } = await fsToggleSave({
        contentId: it.id, type: it.type, authorId: it.authorId,
        mediaUrl: it.mediaUrl || it.videoUrl || "", caption: it.aciklama || it.mesaj || it.caption || "",
      });
      setSavedMap(m => ({...m, [it.id]: !!saved}));
    } catch(e){
      setSavedMap(m => ({...m, [it.id]: !(m[it.id])}));
    }
  }, []);

  const rate = useCallback(async (it, value) => {
    await ensureContentDoc(it.id, it.authorId, it.type);
    await sendRating({ contentId: it.id, authorId: it.authorId, value, type: it.type });
  }, []);

  return (
    <div className="ppv-overlay" data-modal-root>
      {/* header */}
      <div className="ppv-header">
        <button className="ppv-back" onClick={onClose} aria-label="Geri">←</button>
        <div className="ppv-title">Gönderiler</div>
      </div>

      {/* dikey sayfa sayfa liste */}
      <div className="ppv-list" ref={listRef}>
        {items.map((it) => (
          <section key={it.id} className="ppv-item" role="group" aria-label="Gönderi">
            {/* medya */}
            <div className="ppv-media">
              {it.type === "clip" ? (
                <video
                  src={it.mediaUrl || it.videoUrl} className="ppv-mediaEl"
                  controls playsInline autoPlay muted
                />
              ) : (
                <img src={it.mediaUrl} alt="" className="ppv-mediaEl" draggable={false}/>
              )}
            </div>

            {/* aksiyonlar */}
            <div className="ppv-actions">
              <StarRatingV2 size={24} onRate={(v)=>rate(it,v)} />
              <button className="ppv-btn" onClick={()=>{ /* yorum inputuna focus: opsiyonel */ }}>
                💬
              </button>
              <button className="ppv-btn" onClick={()=>{
                const url = `${window.location.origin}/${it.type === "clip" ? "c":"p"}/${it.id}`;
                navigator.share ? navigator.share({ title:"Gönderi", url }).catch(()=>{})
                               : navigator.clipboard.writeText(url);
              }}>↗</button>
              <button className={"ppv-btn save" + (savedMap[it.id] ? " active": "")}
                      onClick={()=>toggleSave(it)}>
                {savedMap[it.id] ? "🔖" : "📑"}
              </button>
            </div>

            {/* yazı + zaman */}
            {(it.aciklama || it.mesaj || it.caption) && (
              <div className="ppv-caption">
                {it.aciklama || it.mesaj || it.caption}
              </div>
            )}
            <div className="ppv-time">
              {new Date(ts(it.tarih)).toLocaleDateString("tr-TR")}
            </div>

            {/* yorum composer (opsiyonel hızlı alan) */}
            <div className="ppv-composer">
              <img className="ppv-avatar"
                   src={auth.currentUser?.photoURL || "https://placehold.co/28x28"}
                   alt="" />
              <input className="ppv-input" placeholder="Yorum ekle…" />
              <button className="ppv-send">Paylaş</button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
