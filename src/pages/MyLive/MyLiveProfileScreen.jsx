// FILE: src/pages/MyLive/MyLiveProfileScreen.jsx
// MyLive Profil - Manus Profile.tsx ile birebir aynı içerik
import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { getMyLiveProfile, saveMyLiveProfile } from "../../services/myLiveService";

const CYAN = "#00C8E0";
const MAGENTA = "#D946A8";

export default function MyLiveProfileScreen({ user }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ totalConnections: 0, avgRating: "—", level: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const load = async () => {
      try {
        const [p, conns1, conns2] = await Promise.all([
          getMyLiveProfile(user.uid),
          getDocs(query(collection(db, "mylive_connections"), where("user1Id", "==", user.uid))),
          getDocs(query(collection(db, "mylive_connections"), where("user2Id", "==", user.uid))),
        ]);
        const total = conns1.size + conns2.size;
        let ratingSum = 0, ratingCount = 0;
        conns1.docs.forEach((d) => {
          const r = d.data().user2Rating;
          if (r) { ratingSum += r; ratingCount++; }
        });
        conns2.docs.forEach((d) => {
          const r = d.data().user1Rating;
          if (r) { ratingSum += r; ratingCount++; }
        });
        const avg = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : "—";
        const level = Math.max(1, Math.floor(total / 5) + 1);
        setProfile(p);
        setStats({ totalConnections: total, avgRating: avg, level });
      } catch (err) {
        console.error("[MyLive] profile error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const displayName = user?.displayName || profile?.displayName || "Kullanıcı";
  const photoURL = user?.photoURL || profile?.photoURL || null;
  const email = user?.email || "";

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(140,150,180,0.6)" }}>Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: "80px", overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 0" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Profil</h1>
          <button style={{
            width: 36, height: 36, borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 16,
          }}>⚙️</button>
        </div>

        {/* Profil Kartı */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 24, padding: 24, marginBottom: 16,
          textAlign: "center", position: "relative", overflow: "hidden",
        }}>
          {/* Üst gradient çizgi */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: `linear-gradient(90deg, ${CYAN}80, ${MAGENTA}80)`,
            borderRadius: "24px 24px 0 0",
          }} />

          {/* Avatar */}
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: photoURL ? "transparent" : `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
            margin: "0 auto 12px",
            border: `3px solid ${CYAN}50`,
            overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32,
          }}>
            {photoURL ? (
              <img src={photoURL} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span>👤</span>
            )}
          </div>

          {/* İsim */}
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{displayName}</h2>

          {/* Email */}
          <div style={{ fontSize: 12, color: "rgba(140,150,180,0.6)" }}>{email}</div>

          {/* Premium badge */}
          {profile?.isPremium && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              marginTop: 10, padding: "4px 12px",
              background: "rgba(232,200,64,0.15)",
              border: "1px solid rgba(232,200,64,0.3)",
              borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#E8C840",
            }}>
              👑 Premium Üye
            </div>
          )}
        </div>

        {/* İstatistikler */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { icon: "📹", label: "Yayın", value: stats.totalConnections.toString(), color: CYAN },
            { icon: "⭐", label: "Puan", value: stats.avgRating, color: "#E8C840" },
            { icon: "🛡️", label: "Seviye", value: profile?.isPremium ? "Pro" : stats.level.toString(), color: "#70C8A0" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: "16px 8px", textAlign: "center",
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "rgba(140,150,180,0.6)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Bio */}
        {profile?.bio && (
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "14px 16px", marginBottom: 16,
          }}>
            <p style={{ fontSize: 13, color: "rgba(200,210,230,0.8)", lineHeight: 1.6, margin: 0 }}>{profile.bio}</p>
          </div>
        )}

        {/* Bağlantı Geçmişi Özeti */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: "14px 16px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>📊 İstatistikler</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(140,150,180,0.7)" }}>Toplam Bağlantı</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: CYAN }}>{stats.totalConnections}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(140,150,180,0.7)" }}>Ortalama Puan</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#E8C840" }}>{stats.avgRating}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "rgba(140,150,180,0.7)" }}>Seviye</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#70C8A0" }}>{profile?.isPremium ? "Pro" : stats.level}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
