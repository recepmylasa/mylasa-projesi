// src/hooks/usePostLogic.js
import { useEffect, useMemo, useRef, useState } from "react";
import { db, storage, auth } from "../firebase";
import { deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";

import { ensureContentDoc, rateContent as sendRating } from "../reputationClient";
import { isSaved as fsIsSaved, toggleSave as fsToggleSave } from "../savesClient";

export function usePostLogic(post, aktifKullaniciId, onCommentClick) {
  // ----- STATE
  const [authorProfile, setAuthorProfile] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  const [showFullCaption, setShowFullCaption] = useState(false);
  const [agg, setAgg] = useState(null);

  const menuRef = useRef(null);
  const isOwner = post?.authorId === aktifKullaniciId;

  // ----- LISTENERS
  useEffect(() => {
    if (!post?.authorId) return;
    const userRef = doc(db, "users", post.authorId);
    const unsub = onSnapshot(userRef, (s) => setAuthorProfile(s.exists() ? s.data() : null));
    return () => unsub();
  }, [post?.authorId]);

  useEffect(() => {
    if (!post?.id) return;
    const contentRef = doc(db, "content", post.id);
    const unsub = onSnapshot(contentRef, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      setAgg(d?.agg || null);
    });
    return () => unsub();
  }, [post?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await fsIsSaved(post?.id);
      if (!cancelled) setIsSaved(saved);
    })();
    return () => { cancelled = true; };
  }, [post?.id]);

  // Menü kapatma bağlayıcıları
  useEffect(() => {
    if (!optionsOpen) return;
    const onDown = (e) => e.key === "Escape" && setOptionsOpen(false);
    const onClickAway = (e) => menuRef.current && !menuRef.current.contains(e.target) && setOptionsOpen(false);
    const onScroll = () => setOptionsOpen(false);
    document.addEventListener("keydown", onDown);
    document.addEventListener("click", onClickAway);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("keydown", onDown);
      document.removeEventListener("click", onClickAway);
      window.removeEventListener("scroll", onScroll);
    };
  }, [optionsOpen]);

  // ----- türetilen
  const { visibleScore, showGold } = useMemo(() => {
    const rep = authorProfile?.reputation || {};
    const badges = authorProfile?.badges || {};
    const visible = typeof rep?.visible === "number" ? rep.visible : rep?.visible ? Number(rep.visible) : 0;
    const sample  = typeof rep?.sample  === "number" ? rep.sample  : rep?.sample  ? Number(rep.sample)  : 0;
    const gold = badges?.gold === true || (visible >= 4.5 && sample >= 1000);
    return { visibleScore: visible, showGold: gold };
  }, [authorProfile]);

  // ----- ACTIONS
  const handleDelete = async () => {
    if (!isOwner || !post?.id) return;
    if (!window.confirm("Bu gönderiyi silmek istediğinizden emin misiniz?")) return;
    try {
      if (post.mediaStoragePath) await deleteObject(ref(storage, post.mediaStoragePath));
      await deleteDoc(doc(db, "posts", post.id));
    } catch (e) {
      console.error("Gönderi silinirken hata:", e);
    }
  };

  const handleToggleSave = async () => {
    setIsSaved((s) => !s);
    try {
      const { saved } = await fsToggleSave({
        contentId: post.id,
        type: post?.type || "post",
        authorId: post.authorId,
        mediaUrl: post.mediaUrl,
        caption: post.mesaj || "",
      });
      setIsSaved(saved);
    } catch (e) {
      setIsSaved((s) => !s);
      console.error("Kaydet sırasında hata:", e);
    }
  };

  const permalink = `${window.location.origin}/p/${post?.id || ""}`;
  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Gönderi", url: permalink });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(permalink);
        window.alert("Bağlantı kopyalandı");
      } else {
        const input = document.createElement("input");
        input.value = permalink;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        window.alert("Bağlantı kopyalandı");
      }
    } catch (e) {
      console.error("Paylaşım sırasında hata:", e);
    }
  };

  const handleToggleComments = async () => {
    if (!isOwner || !post?.id) return;
    try {
      await updateDoc(doc(db, "posts", post.id), { yorumlarKapali: !post?.yorumlarKapali });
      setOptionsOpen(false);
    } catch (e) {
      console.error("Yorumlar durumunu güncellerken hata:", e);
    }
  };

  const handleGoToPost = () => onCommentClick?.(post);

  const handleRate = async (value) => {
    const user = auth.currentUser;
    if (!user || !post?.id || !post?.authorId) return;
    await ensureContentDoc(post.id, post.authorId, post?.type || "post");
    await sendRating({ contentId: post.id, authorId: post.authorId, value, type: post?.type || "post" });
  };

  return {
    // state
    authorProfile, isSaved, optionsOpen, setOptionsOpen,
    isMediaLoaded, setIsMediaLoaded, showFullCaption, setShowFullCaption, agg,
    // refs
    menuRef,
    // derived
    isOwner, visibleScore, showGold,
    // actions
    handleDelete, handleToggleSave, handleShare, handleToggleComments, handleGoToPost, handleRate,
  };
}
