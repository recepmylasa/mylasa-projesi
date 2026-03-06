// FILE: src/pages/MyLive/MyLiveHub.jsx
import React, { useState, useEffect } from "react";
import "../../styles/myLive.css";
import { getStats } from "../../services/myLiveService";

const FEATURES = [
  {
    icon: "⚡",
    bg: "linear-gradient(135deg,rgba(0,242,255,0.15),rgba(0,242,255,0.05))",
    border: "rgba(0,242,255,0.2)",
    title: "Anında Bağlan",
    desc: "Rastgele biri ile 2-5 saniyede video sohbet başlat",
  },
  {
    icon: "🎯",
    bg: "linear-gradient(135deg,rgba(255,20,147,0.15),rgba(255,20,147,0.05))",
    border: "rgba(255,20,147,0.2)",
    title: "Akıllı Eşleştirme",
    desc: "İlgi alanlarına göre filtreli eşleştirme algoritması",
  },
  {
    icon: "🔒",
    bg: "linear-gradient(135deg,rgba(157,78,221,0.15),rgba(157,78,221,0.05))",
    border: "rgba(157,78,221,0.2)",
    title: "Güvenli & Şifreli",
    desc: "WebRTC ile uçtan uca şifreli P2P bağlantı",
  },
  {
    icon: "⭐",
    bg: "linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,215,0,0.05))",
    border: "rgba(255,215,0,0.2)",
    title: "Puanlama Sistemi",
    desc: "Her bağlantı sonrası 5 yıldızlı değerlendirme",
  },
];

export default function MyLiveHub({ onStart, onFilters, user }) {
  const [stats, setStats] = useState({ activeUsers: 0 });

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    const interval = setInterval(() => {
      getStats().then(setStats).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mylive-hub">
      {/* Header */}
      <div className="mylive-hub-header">
        <div>
          <div className="mylive-hub-title">MyLive</div>
          <div className="mylive-hub-subtitle">
            {user ? `Merhaba, ${user.displayName?.split(" ")[0] ?? "Kullanıcı"} 👋` : "Canlı Video Sohbet"}
          </div>
        </div>
        <div className="mylive-live-badge">
          <div className="mylive-live-dot" />
          {stats.activeUsers} Canlı
        </div>
      </div>

      {/* Stats */}
      <div className="mylive-stats-banner">
        <div className="mylive-stat-item">
          <div className="mylive-stat-value">{stats.activeUsers}</div>
          <div className="mylive-stat-label">Aktif Kullanıcı</div>
        </div>
        <div className="mylive-stat-divider" />
        <div className="mylive-stat-item">
          <div className="mylive-stat-value" style={{ color: "#FF1493" }}>P2P</div>
          <div className="mylive-stat-label">Şifreli Bağlantı</div>
        </div>
        <div className="mylive-stat-divider" />
        <div className="mylive-stat-item">
          <div className="mylive-stat-value" style={{ color: "#FFD700" }}>⭐</div>
          <div className="mylive-stat-label">Puanlama</div>
        </div>
      </div>

      {/* Actions */}
      <div className="mylive-actions">
        <button
          className="mylive-btn-primary"
          onClick={() => {
            if (!user) { alert("MyLive'ı kullanmak için giriş yapmalısınız."); return; }
            onStart?.("random");
          }}
        >
          <span style={{ fontSize: 20 }}>📡</span>
          Rastgele Bağlan
        </button>
        <button
          className="mylive-btn-secondary"
          onClick={() => {
            if (!user) { alert("MyLive'ı kullanmak için giriş yapmalısınız."); return; }
            onFilters?.();
          }}
        >
          <span style={{ fontSize: 18 }}>🎛️</span>
          Premium Filtreler
          <span style={{
            marginLeft: "auto",
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 10,
            background: "linear-gradient(135deg,#FFD700,#FFA500)",
            color: "#0A0E27",
          }}>PRO</span>
        </button>
      </div>

      {/* Features */}
      <div className="mylive-features">
        <div className="mylive-section-title">MyLive Özellikleri</div>
        {FEATURES.map((f, i) => (
          <div
            key={i}
            className="mylive-feature-card"
            style={{ background: f.bg, borderColor: f.border }}
          >
            <div className="mylive-feature-icon" style={{ background: f.bg, border: `1px solid ${f.border}` }}>
              {f.icon}
            </div>
            <div className="mylive-feature-text">
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 18, marginLeft: "auto" }}>›</span>
          </div>
        ))}
      </div>

      {/* Premium Banner */}
      <div style={{ margin: "0 16px 20px", padding: "16px", borderRadius: 16, background: "linear-gradient(135deg,rgba(255,215,0,0.1),rgba(255,165,0,0.05))", border: "1px solid rgba(255,215,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>👑</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#FFD700" }}>MyLive Premium</span>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,215,0,0.7)", margin: "0 0 12px" }}>
          Yaş, cinsiyet ve ilgi alanı filtrelerini kullanarak ideal eşleşmeler bul.
        </p>
        <button
          onClick={() => onFilters?.()}
          style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#FFD700,#FFA500)", color: "#0A0E27", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          Filtreleri Keşfet
        </button>
      </div>
    </div>
  );
}
