// src/Profile.js
// /u/:username rotasını çözer; ekranda ProfileDesktop veya ProfileMobile render eder.

import React, { useEffect, useMemo, useState } from "react";
import ProfileDesktop from "./ProfileDesktop";
import ProfileMobile from "./ProfileMobile";
import { getUserByUsername } from "./api/profileApi";

function parseUsernameFromPath() {
  const path = window.location.pathname || "";
  const m = path.match(/^\/u\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

const isMobileViewport = () => window.innerWidth <= 735;

export default function Profile() {
  const username = useMemo(parseUsernameFromPath, []);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobile, setMobile] = useState(isMobileViewport());

  useEffect(() => {
    const onResize = () => setMobile(isMobileViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!username) {
        setLoading(false);
        return;
      }
      const u = await getUserByUsername(username);
      if (mounted) {
        setUser(u);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [username]);

  if (!username) {
    return (
      <div style={{ padding: 24 }}>
        Profil yolu hatalı. Beklenen: <code>/u/&lt;kullanıcı_adı&gt;</code>
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ height: "80vh", display: "grid", placeItems: "center" }}>
        Yükleniyor…
      </div>
    );
  }
  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        Kullanıcı bulunamadı: <b>@{username}</b>
      </div>
    );
  }

  return mobile ? <ProfileMobile user={user} /> : <ProfileDesktop user={user} />;
}
