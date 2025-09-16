// TaggedGridLite — Kullanıcının etiketlendiği içerikleri esnek şekilde getirir.
// Olası alanlar: taggedUserIds, tagged, etiketlenenler, mentions, users, people -> array-contains userId
// Veri kaynağı: posts/gonderiler/postlar (collection + collectionGroup)

import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, collectionGroup, getDocs, limit, query, where } from "firebase/firestore";
import UserPosts from "./UserPosts";

const POST_COLLECTIONS = ["posts","gonderiler","paylasimlar","postlar","clips","reels","videolar"];
const TAG_FIELDS = ["taggedUserIds","tagged","etiketlenenler","mentions","users","people"];

async function fetchTaggedForUserFlexible(userId) {
  if (!userId) return [];
  // Top-level
  for (const cn of POST_COLLECTIONS) {
    for (const f of TAG_FIELDS) {
      try {
        const qy = query(collection(db, cn), where(f, "array-contains", userId), limit(200));
        const snap = await getDocs(qy);
        if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch {}
    }
  }
  // CollectionGroup
  for (const cn of POST_COLLECTIONS) {
    for (const f of TAG_FIELDS) {
      try {
        const qy = query(collectionGroup(db, cn), where(f, "array-contains", userId), limit(200));
        const snap = await getDocs(qy);
        if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch {}
    }
  }
  return [];
}

export default function TaggedGridLite({ userId, onOpen }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const list = await fetchTaggedForUserFlexible(userId);
        if (!gone) setItems(list);
      } catch (e) {
        console.error("TaggedGridLite fetch error:", e);
        if (!gone) setItems([]);
      }
    })();
    return () => { gone = true; };
  }, [userId]);

  if (items === null) return <div className="tab-empty">Yükleniyor...</div>;
  if (!items.length) return <div className="tab-empty">Henüz Etiketlenen İçerik Yok</div>;

  return <UserPosts userId={userId} content={items} onOpen={onOpen} />;
}
