// FILE: src/pages/MyLive/MyLiveProfileScreen.jsx
import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { getMyLiveProfile } from "../../services/myLiveService";

const CYAN = "#00C8E0";
const MAGENTA = "#D946A8";

export default function MyLiveProfileScreen({ user, isDark = true }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ totalConnections: 0, avgRating: "—", level: 1 });
  const [loading, setLoading] = useState(true);

  const bg = isDark ? "#0a0b0f" : "#f0f4ff";
  const textPrimary = isDark ? "#f0f4ff" : "#1a1a2e";
  const textSecondary = isDark ? "rgba(176,184,212,0.8)" : "rgba(60,80,120,0.75)";
  const cardBg = isDark ? "rgba(18,20,30,0.7)" : "rgba(255,255,255,0.9)";
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const load = async () => {
      try {
        // Profil ve bağlantıları ayrı ayrı sorgula (composite index gerektirmez)
        const [p, conns1, conns2] = await Promise.all([
          getMyLiveProfile(user.uid).catch(() => null),
          getDocs(query(collection(db, "mylive_connections"), where("user1Id", "==", user.uid), limit(50))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, "mylive_connections"), where("user2Id", "==", user.uid), limit(50))).catch(() => ({ docs: [] })),
        ]);
        const total = conns1.docs.length + conns2.docs.length;
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
      <div style={{ minHeight: "100dvh", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: textSecondary }}>Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: "80px", overflowY: "auto", background: bg, color: textPrimary, transition: "background 0.3s, color 0.3s" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 0" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: textPrimary }}>Profil</h1>
          <button style={{
            width: 36, height: 36, borderRadius: 12,
            background: cardBg, border: `1px solid ${cardBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 16,
          }}>⚙️</button>
        </div>

        {/* Profil Kartı */}
        <div style={{
          background: cardBg, border: `1px solid ${cardBorder}`,
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

          <h2 style={{ fontSize: 18, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>{displayName}</h2>
          <div style={{ fontSize: 12, color: textSecondary }}>{email}</div>

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
              background: cardBg, border: `1px solid ${cardBorder}`,
              borderRadius: 16, padding: "16px 8px", textAlign: "center",
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: textPrimary }}>{s.value}</div>
              <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Bio */}
        {profile?.bio && (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: textSecondary, lineHeight: 1.6, margin: 0 }}>{profile.bio}</p>
          </div>
        )}

        {/* İstatistikler detay */}
        <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary, marginBottom: 10 }}>📊 İstatistikler</div>
          {[
            { label: "Toplam Bağlantı", value: stats.totalConnections, color: CYAN },
            { label: "Ortalama Puan", value: stats.avgRating, color: "#E8C840" },
            { label: "Seviye", value: profile?.isPremium ? "Pro" : stats.level, color: "#70C8A0" },
          ].map((s, i) => (
            <div key={s.label} style={{
              display: "flex", justifyContent: "space-between",
              marginBottom: i < 2 ? 8 : 0,
            }}>
              <span style={{ fontSize: 12, color: textSecondary }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
