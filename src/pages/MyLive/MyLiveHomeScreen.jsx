// FILE: src/pages/MyLive/MyLiveHomeScreen.jsx
import React from "react";

const CYAN = "#00C8E0";
const MAGENTA = "#D946A8";

export default function MyLiveHomeScreen({ user, onStart, onFilters, isDark = true }) {
  const bg = isDark ? "#0a0b0f" : "#f0f4ff";
  const textPrimary = isDark ? "#f0f4ff" : "#1a1a2e";
  const textSecondary = isDark ? "rgba(176,184,212,0.8)" : "rgba(60,80,120,0.75)";
  const cardBg = isDark ? "rgba(18,20,30,0.7)" : "rgba(255,255,255,0.9)";
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: "80px", overflowY: "auto", background: bg, color: textPrimary, transition: "background 0.3s, color 0.3s" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 0" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 20 }}>📡</span>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: CYAN, lineHeight: 1.1 }}>MyLive</div>
              <div style={{ fontSize: 12, color: textSecondary }}>Canlı Video Sohbet</div>
            </div>
          </div>
        </div>

        {/* Selamlama */}
        {user?.displayName && (
          <p style={{ fontSize: 14, color: textSecondary, marginBottom: 16 }}>
            Merhaba, {user.displayName} 👋
          </p>
        )}

        {/* Hero */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: textPrimary, marginBottom: 8, lineHeight: 1.2 }}>
            Dünyayla<br />
            <span style={{ background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Bağlan.
            </span>
          </h1>
          <p style={{ fontSize: 14, color: textSecondary, lineHeight: 1.6 }}>
            Rastgele insanlarla gerçek zamanlı video sohbet yap. Yeni arkadaşlar edin, farklı kültürler keşfet.
          </p>
        </div>

        {/* CTA Butonları */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          <button
            onClick={onStart}
            style={{
              width: "100%", padding: "16px",
              background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
              border: "none", borderRadius: 16, cursor: "pointer",
              fontSize: 16, fontWeight: 700, color: "#0a0b0f",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: `0 8px 32px rgba(0,200,224,0.3)`,
            }}
          >
            ⚡ Canlı Yayın Başlat
          </button>
          <button
            onClick={onStart}
            style={{
              width: "100%", padding: "16px",
              background: cardBg,
              border: `1px solid ${cardBorder}`,
              borderRadius: 16, cursor: "pointer",
              fontSize: 15, fontWeight: 600,
              color: CYAN,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            👥 Rastgele Bağlan
          </button>
        </div>

        {/* Özellikler */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary, marginBottom: 12 }}>MyLive Özellikleri</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { icon: "⚡", title: "Anında Bağlan", desc: "Rastgele biri ile 2-5 saniyede video sohbet başlat", color: CYAN },
              { icon: "👥", title: "Rastgele Eşleştirme", desc: "İlgi alanlarına göre akıllı eşleştirme algoritması", color: MAGENTA },
              { icon: "🛡️", title: "Güvenli & Şifreli", desc: "WebRTC ile uçtan uca şifreli P2P bağlantı", color: "#70C8A0" },
              { icon: "⭐", title: "Değerlendirme Sistemi", desc: "Her bağlantıdan sonra 5 yıldızlı puanlama", color: "#E8C840" },
            ].map((f) => (
              <button
                key={f.title}
                onClick={onStart}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 16px",
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 16, cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: `${f.color}20`,
                  border: `1px solid ${f.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}>
                  {f.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary, marginBottom: 2 }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: textSecondary, lineHeight: 1.4 }}>{f.desc}</div>
                </div>
                <span style={{ color: textSecondary, fontSize: 16 }}>›</span>
              </button>
            ))}
          </div>
        </div>

        {/* Trend */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: CYAN, fontSize: 16 }}>📈</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>Trend</span>
          </div>
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "12px 16px" }}>
            {["#MyLive", "#CanlıSohbet", "#YeniArkadaşlar", "#Keşfet"].map((tag, i) => (
              <div key={tag} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: i < 3 ? `1px solid ${cardBorder}` : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: textSecondary, width: 16 }}>{i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{tag}</span>
                </div>
                <span style={{ fontSize: 11, color: textSecondary }}>
                  {[342, 218, 187, 156][i]} gönderi
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
