// src/pages/ProfileMobile.js
// Basit profil şablonu + BadgesBar entegrasyonu (örnek).
import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import BadgesBarMobile from "../components/BadgesBarMobile";

export default function ProfileMobile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!userId) return;
    const ref = doc(db, "users", userId);
    const unsub = onSnapshot(ref, (snap) => {
      setUser(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return () => unsub();
  }, [userId]);

  if (!user) return <div style={{padding:12}}>Yükleniyor…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex", alignItems:"center", gap:12, padding:"12px 10px"}}>
        <img
          src={user.profilFoto || ""}
          alt=""
          style={{width:64, height:64, borderRadius:"50%", background:"#eee", objectFit:"cover"}}
        />
        <div style={{minWidth:0}}>
          <div style={{fontWeight:900, fontSize:18}}>{user.kullaniciAdi || "Profil"}</div>
          <div style={{fontSize:12, opacity:.7}}>{user.bio || ""}</div>
        </div>
      </div>

      {/* ROZET ÇUBUĞU */}
      <BadgesBarMobile userId={userId || auth.currentUser?.uid} />

      {/* Buradan aşağısı senin mevcut gönderiler/sekme vs. */}
      <div style={{padding:"0 10px", fontSize:12, opacity:.6}}>İçerik sekmeleri burada…</div>
    </div>
  );
}
