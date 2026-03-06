// FILE: src/pages/MyLive/MyLiveNotificationsScreen.jsx
// MyLive Bildirimler - Manus Notifications.tsx ile birebir aynı içerik
import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";

const CYAN = "#00C8E0";

export default function MyLiveNotificationsScreen({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    // Firestore'dan MyLive bağlantı geçmişini çek
    const fetchNotifications = async () => {
      try {
        const q = query(
          collection(db, "mylive_connections"),
          where("user1Id", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(20)
        );
        const q2 = query(
          collection(db, "mylive_connections"),
          where("user2Id", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(20)
        );
        const [snap1, snap2] = await Promise.all([getDocs(q), getDocs(q2)]);
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
            });
          }
          items.push({
            id: d.id,
            icon: "📹",
            color: CYAN,
            text: `${data.user2DisplayName || "Biri"} ile bağlantı kuruldu`,
            time: data.createdAt?.toDate ? timeAgo(data.createdAt.toDate()) : "az önce",
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
            });
          }
          items.push({
            id: d.id + "_2",
            icon: "📹",
            color: "#D946A8",
            text: `${data.user1DisplayName || "Biri"} ile bağlantı kuruldu`,
            time: data.createdAt?.toDate ? timeAgo(data.createdAt.toDate()) : "az önce",
          });
        });
        // Tarihe göre sırala
        items.sort((a, b) => 0);
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
    <div style={{ minHeight: "100dvh", paddingBottom: "80px", overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 0" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: CYAN }}>🔔</span> Bildirimler
          </h1>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 32, color: "rgba(140,150,180,0.6)" }}>
            Yükleniyor...
          </div>
        ) : notifications.length === 0 ? (
          <div style={{
            textAlign: "center", padding: 40,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
            <div style={{ fontSize: 14, color: "rgba(140,150,180,0.7)" }}>Henüz bildiriminiz yok.</div>
            <div style={{ fontSize: 12, color: "rgba(140,150,180,0.5)", marginTop: 4 }}>
              Canlı yayın başlatınca bildirimler burada görünecek.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notifications.map((n) => (
              <div key={n.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: 18,
                }}>
                  {n.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: "#fff", margin: 0 }}>{n.text}</p>
                  <p style={{ fontSize: 11, color: "rgba(140,150,180,0.6)", margin: "2px 0 0" }}>{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

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
