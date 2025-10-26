// src/components/RouteListMobile.js
// Kullanıcının bitmiş rotalarını listeler; kart tık → /r/:id modalını açtırır.

import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection, query, where, orderBy, limit, getDocs,
} from "firebase/firestore";
import RouteCardMobile from "./RouteCardMobile";

export default function RouteListMobile({ userId, max = 30 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const col = collection(db, "routes");
        // bitmiş rotalarım
        let q = query(
          col,
          where("ownerId", "==", String(userId || "")),
          where("status", "==", "finished"),
          orderBy("createdAt", "desc"),
          limit(Number(max) || 30)
        );
        const snaps = await getDocs(q);
        const arr = [];
        snaps.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setItems(arr);
      } catch (e) {
        // bazen index gerektirebilir → fallback: orderBy olmadan getir
        try {
          const col = collection(db, "routes");
          const q2 = query(col, where("ownerId", "==", String(userId || "")), where("status", "==", "finished"), limit(Number(max) || 30));
          const snaps2 = await getDocs(q2);
          const arr2 = [];
          snaps2.forEach((d) => arr2.push({ id: d.id, ...d.data() }));
          setItems(arr2);
        } catch {}
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, max]);

  const open = (id) => {
    // App.js dinler ve modal açar (pushState’i de yapar)
    window.dispatchEvent(new CustomEvent("open-route-modal", { detail: { routeId: id } }));
  };

  if (loading) return <div style={{ padding: 12, color: "#555" }}>Yükleniyor…</div>;
  if (!items.length) return <div style={{ padding: 12, color: "#777" }}>Henüz bitmiş rota yok.</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, padding: 8 }}>
      {items.map((r) => (
        <RouteCardMobile key={r.id} route={r} onClick={() => open(r.id)} />
      ))}
    </div>
  );
}
