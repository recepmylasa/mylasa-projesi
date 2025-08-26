// src/ClipsGrid.js
// Kullanıcının "video" içeriklerini 9:16 grid olarak gösterir.
// /p/:id pushState + popstate (App.js) ile detay modalını açar.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import "./ClipsGrid.css";
import { db } from "./firebase";
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";

const PlayBadge = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="#fff">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const isVideoUrl = (url = "") => /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);

// esnek alan isimleri
const TS = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v < 2e12 ? v * 1000 : v;
  if (v.seconds) return v.seconds * 1000;
  if (v._seconds) return v._seconds * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

async function fetchUserClipsFlexible(userId) {
  // olası koleksiyon adları
  const colNames = ["clips", "reels", "posts", "gonderiler", "paylasimlar"];
  // kullanıcı id alanları
  const idFields = [
    "userId",
    "uid",
    "ownerId",
    "kullaniciId",
    "authorId",
    "createdBy",
    "olusturanId",
    "user.uid",
    "author.uid",
  ];

  // Top-level
  for (const cn of colNames) {
    for (const f of idFields) {
      try {
        const qy = query(collection(db, cn), where(f, "==", userId), limit(150));
        const snap = await getDocs(qy);
        if (!snap.empty) {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          return arr.filter((x) => {
            const url =
              x.videoUrl || x.mediaUrl || x.url || x.imageUrl || x.photoUrl || "";
            return x.type === "clip" || isVideoUrl(url);
          });
        }
      } catch (_) {}
    }
  }

  // Collection group (ör: users/<uid>/clips veya users/<uid>/posts)
  for (const cn of colNames) {
    for (const f of idFields) {
      try {
        const qy = query(collectionGroup(db, cn), where(f, "==", userId), limit(150));
        const snap = await getDocs(qy);
        if (!snap.empty) {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          return arr.filter((x) => {
            const url =
              x.videoUrl || x.mediaUrl || x.url || x.imageUrl || x.photoUrl || "";
            return x.type === "clip" || isVideoUrl(url);
          });
        }
      } catch (_) {}
    }
  }

  return [];
}

export default function ClipsGrid({ userId }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchUserClipsFlexible(userId);
        if (!cancelled) setItems(rows);
      } catch (e) {
        console.error("ClipsGrid fetch error:", e);
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const list = useMemo(() => {
    const arr = Array.isArray(items) ? items.slice() : [];
    arr.sort(
      (a, b) =>
        TS(
          b.createdAt ||
            b.created_at ||
            b.tarih ||
            b.timestamp ||
            b.time ||
            b.date
        ) -
        TS(
          a.createdAt ||
            a.created_at ||
            a.tarih ||
            a.timestamp ||
            a.time ||
            a.date
        )
    );
    return arr;
  }, [items]);

  const openPost = useCallback((it) => {
    if (!it?.id) return;
    try {
      window.history.pushState({ modal: "post", id: it.id }, "", `/p/${it.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (e) {
      console.error("open clip error:", e);
    }
  }, []);

  if (!items) {
    return (
      <div className="clips-placeholder">
        Yükleniyor…
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <div className="clips-placeholder">
        Henüz Clips yok
      </div>
    );
  }

  return (
    <div className="clips-grid" role="list">
      {list.map((it) => {
        const url =
          it.videoUrl || it.mediaUrl || it.url || it.imageUrl || it.photoUrl || "";
        if (!url) return null;
        return (
          <button
            key={it.id}
            type="button"
            className="clips-card"
            onClick={() => openPost(it)}
            aria-label="Clips'i aç"
            role="listitem"
          >
            <video
              src={url}
              className="clips-media"
              muted
              playsInline
              preload="metadata"
            />
            <div className="clips-badge">
              <PlayBadge />
            </div>
          </button>
        );
      })}
    </div>
  );
}
