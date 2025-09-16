// SavedGridLite — Kaydedilen içerikleri esnek şekilde getirir ve UserPosts gridinde gösterir.
// Şema esnekliği: users/{uid}/saved/*  |  saves (top-level)  |  kayitlar/kaydedilenler  ...
// Kayıt alan adları: postId, contentId, icerikId, item.id, ref, postRef, contentRef ...
// Post koleksiyon adları: posts, gonderiler, paylasimlar, postlar, clips, reels, videolar

import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import {
  collection, collectionGroup, doc, getDoc, getDocs, limit, query, where
} from "firebase/firestore";
import UserPosts from "./UserPosts";

const POST_COLLECTIONS = ["posts","gonderiler","paylasimlar","postlar","clips","reels","videolar"];
const ID_FIELDS = [
  "authorId","userId","uid","userID","ownerId","kullaniciId","createdBy","olusturanId","accountId",
  "user.uid","author.uid","owner.uid","user.id","author.id"
];

async function fetchPostByIdFlexible(postId) {
  if (!postId) return null;
  // Top-level aramalar
  for (const cn of POST_COLLECTIONS) {
    try {
      const ref = doc(db, cn, postId);
      const snap = await getDoc(ref);
      if (snap.exists()) return { id: snap.id, ...snap.data() };
    } catch {}
  }
  // CollectionGroup ile tarama (id eşleşmesi)
  for (const cn of POST_COLLECTIONS) {
    try {
      const qy = query(collectionGroup(db, cn), where("__name__", "==", postId), limit(1));
      const snap = await getDocs(qy);
      if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch {}
  }
  return null;
}

async function resolveSavedDocToPost(savedDoc, userId) {
  if (!savedDoc) return null;

  // 1) doğrudan gömülü içerik
  if (savedDoc.item && savedDoc.item.id) return { id: savedDoc.item.id, ...savedDoc.item };
  if (savedDoc.post && savedDoc.post.id) return { id: savedDoc.post.id, ...savedDoc.post };
  if (savedDoc.content && savedDoc.content.id) return { id: savedDoc.content.id, ...savedDoc.content };

  // 2) id alanları
  const idCandidates = [
    savedDoc.postId, savedDoc.contentId, savedDoc.icerikId, savedDoc.postID, savedDoc.contentID, savedDoc.id,
  ].filter(Boolean);
  for (const pid of idCandidates) {
    const post = await fetchPostByIdFlexible(String(pid));
    if (post) return post;
  }

  // 3) referans alanları (postRef/contentRef) → dokümanı çek
  try {
    const ref = savedDoc.postRef || savedDoc.contentRef || savedDoc.ref;
    if (ref && ref.path) {
      const snap = await getDoc(ref);
      if (snap.exists()) return { id: snap.id, ...snap.data() };
    }
  } catch {}

  // 4) son çare: kullanıcıya göre tüm içerikten tarama ve eşleşenleri döndürme (çok pahalı olduğu için geç)
  // Burada sadece kullanıcı id'si eşleşenleri döndürmek yerine null veriyoruz; geniş taramayı
  // SavedGridLite değil, profil grid üstleniyor. (Performans için)
  return null;
}

async function fetchSavedForUserFlexible(userId) {
  if (!userId) return [];
  const results = [];

  // A) users/{uid}/saved/*
  try {
    const savedCol = collection(db, "users", userId, "saved");
    const snap = await getDocs(query(savedCol, limit(300)));
    for (const d of snap.docs) {
      const post = await resolveSavedDocToPost({ id: d.id, ...d.data() }, userId);
      if (post) results.push(post);
    }
    if (results.length) return results;
  } catch {}

  // B) saves (top-level) — userId alanı  (çeşitli id alan adları)
  const SAVE_COLLECTION_NAMES = ["saves","kaydedilenler","favorites","favoriler","bookmarks"];
  for (const cn of SAVE_COLLECTION_NAMES) {
    for (const f of ["userId","uid","ownerId","kullaniciId","accountId"]) {
      try {
        const qy = query(collection(db, cn), where(f, "==", userId), limit(300));
        const snap = await getDocs(qy);
        if (!snap.empty) {
          for (const d of snap.docs) {
            const post = await resolveSavedDocToPost({ id: d.id, ...d.data() }, userId);
            if (post) results.push(post);
          }
          if (results.length) return results;
        }
      } catch {}
    }
  }

  // C) users/{uid}/saves/* alternatif
  try {
    const alt = collection(db, "users", userId, "saves");
    const snap = await getDocs(query(alt, limit(300)));
    for (const d of snap.docs) {
      const post = await resolveSavedDocToPost({ id: d.id, ...d.data() }, userId);
      if (post) results.push(post);
    }
    if (results.length) return results;
  } catch {}

  // Sonuç yoksa boş
  return [];
}

export default function SavedGridLite({ userId, onOpen }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const list = await fetchSavedForUserFlexible(userId);
        if (!gone) setItems(list);
      } catch (e) {
        console.error("SavedGridLite fetch error:", e);
        if (!gone) setItems([]);
      }
    })();
    return () => { gone = true; };
  }, [userId]);

  // UserPosts, content alırsa sorgulamaz; aynı görsel/etkileşim → tek doğruluk noktası
  if (items === null) return <div className="tab-empty">Yükleniyor...</div>;
  if (!items.length) return <div className="tab-empty">Henüz Kaydedilen Yok</div>;

  return <UserPosts userId={userId} content={items} onOpen={onOpen} />;
}
