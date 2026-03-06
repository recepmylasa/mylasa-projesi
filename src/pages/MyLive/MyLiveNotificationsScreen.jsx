// FILE: src/pages/MyLive/MyLiveNotificationsScreen.jsx
import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

const CYAN = "#00C8E0";
const MAGENTA = "#D946A8";

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "az önce";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

export default function MyLiveNotificationsScreen({ user, isDark = true }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const bg = isDark ? "#0a0b0f" : "#f0f4ff";
  const textPrimary = isDark ? "#f0f4ff" : "#1a1a2e";
  const textSecondary = isDark ? "rgba(176,184,212,0.8)" : "rgba(60,80,120,0.75)";
  const cardBg = isDark ? "rgba(18,20,30,0.7)" : "rgba(255,255,255,0.9)";
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";

  useEffect(() => {
    if (!user?.uid) {
      // Giriş yapmamış - örnek bildirimler göster
      setNotifications([
        { id: "1", icon: "❤️", color: "#F43F5E", text: "Birisi seni beğendi", time: "2 dk önce" },
        { id: "2", icon: "👥", color: CYAN, text: "Yeni bir bağlantı isteği", time: "15 dk önce" },
        { id: "3", icon: "⭐", color: "#E8C840", text: "5 yıldız aldın!", time: "1 saat önce" },
      ]);
      setLoading(false);
      return;
    }

    const fetchNotifications = async () => {
      try {
        // Sadece user1Id ile sorgula (composite index gerektirmez)
        const q1 = query(
          collection(db, "mylive_connections"),
          where("user1Id", "==", user.uid),
          limit(10)
        );
        const q2 = query(
          collection(db, "mylive_connections"),
          where("user2Id", "==", user.uid),
          limit(10)
        );
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const items = [];

        snap1.docs.forEach((d) => {
          const data = d.data();
          const rating = data.user2Rating;
          if (rating) {
            items.push({
              id: d.id + "_r",
              icon: "⭐",
              color: "#E8C840",
              text: `${data.user2DisplayName || "Biri"} seni ${rating} yıldız ile değerlendirdi`,
              time: data.createdAt?.toDate ? timeAgo(data.createdAt.toDate()) : "az önce",
              ts: data.createdAt?.seconds || 0,
            });
          }
          items.push({
            id: d.id,
            icon: "📹",
            color: CYAN,
            text: `${data.user2DisplayName || "Biri"} ile bağlantı kuruldu`,
            time: data.createdAt?.toDate ? timeAgo(data.createdAt.toDate()) : "az önce",
            ts: data.createdAt?.seconds || 0,
          });
        });

        snap2.docs.forEach((d) => {
          const data = d.data();
          const rating = data.user1Rating;
          if (rating) {
            items.push({
              id: d.id + "_r2",
              icon: "⭐",
              color: "#E8C840",
              text: `${data.user1DisplayName || "Biri"} seni ${rating} yıldız ile değerlendirdi`,
              time: data.createdAt?.toDate ? timeAgo(data.createdAt.toDate()) : "az önce",
              ts: data.createdAt?.seconds || 0,
            });
          }
          items.push({
            id: d.id + "_2",
            icon: "📹",
            color: MAGENTA,
            text: `${data.user1DisplayName || "Biri"} ile bağlantı kuruldu`,
            time: data.createdAt?.toDate ? timeAgo(data.createdAt.toDate()) : "az önce",
            ts: data.createdAt?.seconds || 0,
          });
        });

        items.sort((a, b) => b.ts - a.ts);
        setNotifications(items.slice(0, 20));
      } catch (err) {
        console.error("[MyLive] notifications error:", err);
        // Fallback: örnek bildirimler
        setNotifications([
          { id: "1", icon: "❤️", color: "#F43F5E", text: "Birisi seni beğendi", time: "2 dk önce" },
          { id: "2", icon: "👥", color: CYAN, text: "Yeni bir bağlantı isteği", time: "15 dk önce" },
          { id: "3", icon: "⭐", color: "#E8C840", text: "5 yıldız aldın!", time: "1 saat önce" },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [user]);

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: "80px", overflowY: "auto", background: bg, color: textPrimary, transition: "background 0.3s, color 0.3s" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 0" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: textPrimary, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: CYAN }}>🔔</span> Bildirimler
          </h1>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 32, color: textSecondary }}>
            Yükleniyor...
          </div>
        ) : notifications.length === 0 ? (
          <div style={{
            textAlign: "center", padding: 40,
            background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 20,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
            <div style={{ fontSize: 14, color: textSecondary }}>Henüz bildiriminiz yok.</div>
            <div style={{ fontSize: 12, color: textSecondary, marginTop: 4 }}>
              Canlı yayın başlatınca bildirimler burada görünecek.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notifications.map((n) => (
              <div key={n.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px",
                background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: `${n.color}20`,
                  border: `1px solid ${n.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: 18,
                }}>
                  {n.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: textPrimary, margin: 0 }}>{n.text}</p>
                  <p style={{ fontSize: 11, color: textSecondary, margin: "2px 0 0" }}>{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
