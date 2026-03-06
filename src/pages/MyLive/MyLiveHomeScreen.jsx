// FILE: src/pages/MyLive/MyLiveHomeScreen.jsx
// MyLive Ana Sayfa - Manus Home.tsx ile birebir aynı içerik
import React from "react";

const CYAN = "#00C8E0";
const MAGENTA = "#D946A8";

export default function MyLiveHomeScreen({ user, onStart, onFilters }) {
  return (
    <div style={{ minHeight: "100dvh", paddingBottom: "80px", overflowY: "auto", background: "transparent" }}>
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
              <div style={{ fontSize: 12, color: "rgba(140,150,180,0.8)" }}>Canlı Video Sohbet</div>
            </div>
          </div>
        </div>

        {/* Hero */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "#fff", marginBottom: 8, lineHeight: 1.2 }}>
            Dünyayla<br />
            <span style={{ background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Bağlan.
            </span>
          </h1>
          <p style={{ fontSize: 14, color: "rgba(140,150,180,0.8)", lineHeight: 1.6 }}>
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
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>MyLive Özellikleri</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { icon: "⚡", title: "Anında Bağlan", desc: "Rastgele biri ile 2-5 saniyede video sohbet başlat", color: CYAN },
              { icon: "👥", title: "Rastgele Eşleştirme", desc: "İlgi alanlarına göre akıllı eşleştirme algoritması", color: MAGENTA },
              { icon: "🛡️", title: "Güvenli & Şifreli", desc: "WebRTC ile uçtan uca şifreli P2P bağlantı", color: "#70C8A0" },
              { icon: "⭐", title: "Değerlendirme Sistemi", desc: "Her bağlantıdan sonra 5 yıldızlı puanlama", color: "#E8C840" },
            ].map((f) => (
              <button
                key={f.title}
                onClick={f.title === "Anında Bağlan" || f.title === "Rastgele Eşleştirme" ? onStart : undefined}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: "rgba(140,150,180,0.8)", lineHeight: 1.4 }}>{f.desc}</div>
                </div>
                <span style={{ color: "rgba(140,150,180,0.5)", fontSize: 16 }}>›</span>
              </button>
            ))}
          </div>
        </div>

        {/* Trend */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: CYAN, fontSize: 16 }}>📈</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Trend</span>
          </div>
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "12px 16px",
          }}>
            {["#MyLive", "#CanlıSohbet", "#YeniArkadaşlar", "#Keşfet"].map((tag, i) => (
              <div key={tag} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.05)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "rgba(140,150,180,0.5)", width: 16 }}>{i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{tag}</span>
                </div>
                <span style={{ fontSize: 11, color: "rgba(140,150,180,0.5)" }}>
                  {Math.floor(Math.random() * 900 + 100)} gönderi
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
