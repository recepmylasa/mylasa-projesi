// src/Profile.js
// /u/:username güzergâhını çözer; URL’i kanonikleştirir (boşluk vs. atar)
// Cihaza göre Desktop/Mobile bileşenini gösterir.

import React, { useEffect, useMemo, useState } from "react";
import ProfileDesktop from "./ProfileDesktop";
import ProfileMobile from "./ProfileMobile";
import { getUserByUsername, slugifyUsername } from "./api/profileApi";

const parseFromPath = () => {
  const path = window.location.pathname || "";
  const m = path.match(/^\/u\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
};

const isMobileViewport = () => window.innerWidth <= 735;

export default function Profile() {
  const rawUsername = useMemo(parseFromPath, []);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobile, setMobile] = useState(isMobileViewport());

  // URL’i kanonik formata çevir (ör. /u/recep asik → /u/recepasik)
  useEffect(() => {
    if (!rawUsername) return;
    const canon = slugifyUsername(rawUsername);
    const wanted = `/u/${canon}`;
    if (canon && window.location.pathname !== wanted) {
      window.history.replaceState({}, "", wanted);
    }
  }, [rawUsername]);

  useEffect(() => {
    const onResize = () => setMobile(isMobileViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!rawUsername) { setLoading(false); return; }
      const u = await getUserByUsername(rawUsername);
      if (alive) { setUser(u); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [rawUsername]);

  if (!rawUsername) {
    return <div style={{ padding: 24 }}>
      Profil yolu hatalı. Beklenen: <code>/u/&lt;kullanıcı_adı&gt;</code>
    </div>;
  }
  if (loading) {
    return <div style={{ height: "80vh", display: "grid", placeItems: "center" }}>Yükleniyor…</div>;
  }
  if (!user) {
    return <div style={{ padding: 24 }}>
      Kullanıcı bulunamadı: <b>@{rawUsername}</b>
    </div>;
  }

  return mobile ? <ProfileMobile user={user} /> : <ProfileDesktop user={user} />;
}
