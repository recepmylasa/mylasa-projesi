// src/pages/ProfileMobile.js
// Profil mobil kabuğu + BadgesBar + "Rotalarım" bölümü
// EMİR 2: isSelf / isFollowing mantığı + useUserRoutes + RouteCardMobile entegrasyonu

import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import BadgesBarMobile from "../components/BadgesBarMobile";
import RouteCardMobile from "../components/RouteCardMobile";
import useUserRoutes from "../hooks/useUserRoutes";
import { getFollowingUids } from "../services/follows";

export default function ProfileMobile({ userId }) {
  const viewerId = auth.currentUser?.uid || null;
  const resolvedUserId = userId || viewerId || null;

  const [user, setUser] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followingLoading, setFollowingLoading] = useState(false);

  const isSelf =
    !!viewerId && !!resolvedUserId && String(viewerId) === String(resolvedUserId);

  // Profil kullanıcısını dinle
  useEffect(() => {
    if (!resolvedUserId) {
      setUser(null);
      return;
    }
    const ref = doc(db, "users", resolvedUserId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setUser(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      },
      () => {
        setUser(null);
      }
    );
    return () => unsub();
  }, [resolvedUserId]);

  // Takip durumu (viewer → profil sahibi)
  useEffect(() => {
    let cancelled = false;

    async function checkFollowing() {
      // Giriş yoksa veya kendi profiline bakıyorsa takip bilgisi gereksiz
      if (!viewerId || !resolvedUserId || viewerId === resolvedUserId) {
        if (!cancelled) {
          setIsFollowing(false);
          setFollowingLoading(false);
        }
        return;
      }

      setFollowingLoading(true);
      try {
        const uids = await getFollowingUids(viewerId);
        if (!cancelled) {
          setIsFollowing(uids.includes(String(resolvedUserId)));
        }
      } catch (e) {
        if (!cancelled && process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[ProfileMobile] getFollowingUids hata:", e);
        }
        if (!cancelled) {
          setIsFollowing(false);
        }
      } finally {
        if (!cancelled) {
          setFollowingLoading(false);
        }
      }
    }

    checkFollowing();
    return () => {
      cancelled = true;
    };
  }, [viewerId, resolvedUserId]);

  if (!resolvedUserId) {
    return <div style={{ padding: 12 }}>Profil yüklenemedi.</div>;
  }

  if (!user) {
    return <div style={{ padding: 12 }}>Yükleniyor…</div>;
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 10px",
        }}
      >
        <img
          src={user.profilFoto || ""}
          alt=""
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "#eee",
            objectFit: "cover",
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {user.kullaniciAdi || user.username || "Profil"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{user.bio || ""}</div>
        </div>
      </div>

      {/* ROZET ÇUBUĞU */}
      <BadgesBarMobile userId={resolvedUserId} />

      {/* Basit info satırı (mevcut sekme yapına dokunmamak için bırakıldı) */}
      <div style={{ padding: "0 10px", fontSize: 12, opacity: 0.6 }}>
        İçerik sekmeleri burada…
      </div>

      {/* ROTALARIM BÖLÜMÜ */}
      <div
        style={{
          padding: "8px 10px 16px",
          borderTop: "1px solid #f2f2f2",
          marginTop: 8,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Rotalarım</span>
          {followingLoading && !isSelf && (
            <span style={{ fontSize: 11, opacity: 0.55 }}>takip durumu…</span>
          )}
        </div>

        <ProfileRoutesSection
          ownerId={resolvedUserId}
          viewerId={viewerId}
          isSelf={isSelf}
          isFollowing={isSelf ? false : isFollowing}
        />
      </div>
    </div>
  );
}

/**
 * Profil altındaki “Rotalarım” listesi.
 * - useUserRoutes(ownerId, { isSelf, isFollowing, viewerId })
 * - RouteCardMobile ile liste
 * - Kart tıklayınca open-route-modal event’i ile rota detayı açılır.
 */
function ProfileRoutesSection({ ownerId, viewerId, isSelf, isFollowing }) {
  const {
    routes,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    isEmpty,
  } = useUserRoutes(ownerId, {
    pageSize: 20,
    isSelf,
    isFollowing,
    viewerId,
  });

  const handleRouteClick = (route) => {
    try {
      window.dispatchEvent(
        new CustomEvent("open-route-modal", {
          detail: { routeId: route.id },
        })
      );
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[ProfileRoutesSection] open-route-modal hata:", e);
      }
    }
  };

  // Skeleton (ilk yükleme)
  if (loading && routes.length === 0) {
    return (
      <div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              borderRadius: 12,
              background:
                "linear-gradient(90deg, #f3f4f6, #e5e7eb, #f3f4f6)",
              backgroundSize: "200% 100%",
              animation: "mylasa-skeleton 1.2s ease-in-out infinite",
              height: 72,
              marginBottom: 8,
            }}
          />
        ))}
        {/* Skeleton animasyonu için küçük inline keyframes (global CSS yoksa bile bozulmaz) */}
        <style>
          {`@keyframes mylasa-skeleton {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }`}
        </style>
      </div>
    );
  }

  // Hata durumu
  if (!loading && error) {
    return (
      <div style={{ fontSize: 13, color: "#b91c1c", padding: "4px 0" }}>
        Rotalar yüklenirken bir hata oluştu. Lütfen daha sonra tekrar dene.
      </div>
    );
  }

  // Boş durum
  if (!loading && isEmpty) {
    return (
      <div style={{ fontSize: 13, opacity: 0.7, padding: "4px 0" }}>
        {isSelf
          ? "Henüz rota oluşturmadın."
          : "Bu kullanıcının henüz rotası yok."}
      </div>
    );
  }

  return (
    <div>
      {routes.map((route) => (
        <div key={route.id} style={{ marginBottom: 8 }}>
          <RouteCardMobile
            route={route}
            onClick={() => handleRouteClick(route)}
          />
        </div>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          style={{
            marginTop: 4,
            fontSize: 13,
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: loadingMore ? "default" : "pointer",
          }}
        >
          {loadingMore ? "Yükleniyor…" : "Daha fazla göster"}
        </button>
      )}
    </div>
  );
}
