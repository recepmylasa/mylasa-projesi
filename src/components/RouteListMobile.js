// src/components/RouteListMobile.js
// Kullanıcının bitmiş rotalarını listeler; görünürlüğe göre (public/followers/private) merge eder.

import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit as qlimit,
  getDocs,
  doc,
  onSnapshot,
} from "firebase/firestore";
import RouteCardMobile from "./RouteCardMobile";

function tsMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return Number(ts) || 0;
}

async function fetchRoutes({ ownerId, visibility, max, withOrder = true }) {
  const col = collection(db, "routes");
  const base = [
    where("ownerId", "==", String(ownerId)),
    where("status", "==", "finished"),
    where("visibility", "==", visibility),
  ];
  let q;
  if (withOrder) {
    q = query(col, ...base, orderBy("createdAt", "desc"), qlimit(max));
  } else {
    q = query(col, ...base, qlimit(max));
  }

  try {
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    return out;
  } catch (e) {
    if (withOrder) {
      return fetchRoutes({ ownerId, visibility, max, withOrder: false });
    }
    return [];
  }
}

export default function RouteListMobile({ userId, max = 30 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);

  const myUid = auth.currentUser?.uid || null;
  const isSelf = !!myUid && !!userId && myUid === userId;

  // Takip durumunu canlı dinle (başka profil için)
  useEffect(() => {
    if (!myUid || !userId || isSelf) {
      setIsFollowing(false);
      return;
    }
    const ref = doc(db, "follows", `${myUid}_${userId}`);
    const off = onSnapshot(
      ref,
      (snap) => setIsFollowing(snap.exists()),
      () => setIsFollowing(false)
    );
    return () => off && off();
  }, [myUid, userId, isSelf]);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!userId) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);

      try {
        let buckets = [];

        if (isSelf) {
          const [pub, fol, priv] = await Promise.all([
            fetchRoutes({ ownerId: userId, visibility: "public", max }),
            fetchRoutes({ ownerId: userId, visibility: "followers", max }),
            fetchRoutes({ ownerId: userId, visibility: "private", max }),
          ]);
          buckets = [pub, fol, priv];
        } else {
          const pub = await fetchRoutes({ ownerId: userId, visibility: "public", max });
          if (isFollowing) {
            const fol = await fetchRoutes({ ownerId: userId, visibility: "followers", max });
            buckets = [pub, fol];
          } else {
            buckets = [pub];
          }
        }

        // merge + dedupe + sort by createdAt desc
        const map = new Map();
        buckets.flat().forEach((r) => {
          if (!map.has(r.id)) map.set(r.id, r);
        });

        const merged = Array.from(map.values()).sort(
          (a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt)
        );

        if (!alive) return;
        setItems(merged.slice(0, Number(max) || 30));
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [userId, max, isSelf, isFollowing]);

  const open = (id) => {
    window.dispatchEvent(new CustomEvent("open-route-modal", { detail: { routeId: id } }));
  };

  if (loading) return <div style={{ padding: 12, color: "#555" }}>Yükleniyor…</div>;
  if (!items.length) return <div style={{ padding: 12, color: "#777" }}>Gösterilecek rota yok.</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, padding: 8 }}>
      {items.map((r) => (
        <RouteCardMobile key={r.id} route={r} onClick={() => open(r.id)} />
      ))}
    </div>
  );
}
