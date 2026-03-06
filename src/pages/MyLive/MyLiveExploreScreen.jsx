// FILE: src/pages/MyLive/MyLiveExploreScreen.jsx
import React, { useState } from "react";

const CYAN = "#00C8E0";
const MAGENTA = "#D946A8";

export default function MyLiveExploreScreen({ isDark = true }) {
  const [search, setSearch] = useState("");

  const bg = isDark ? "#0a0b0f" : "#f0f4ff";
  const textPrimary = isDark ? "#f0f4ff" : "#1a1a2e";
  const textSecondary = isDark ? "rgba(176,184,212,0.8)" : "rgba(60,80,120,0.75)";
  const cardBg = isDark ? "rgba(18,20,30,0.7)" : "rgba(255,255,255,0.9)";
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
  const inputBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const inputBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)";

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: "80px", overflowY: "auto", background: bg, color: textPrimary, transition: "background 0.3s, color 0.3s" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 0" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: textPrimary, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: CYAN }}>🧭</span> Keşfet
          </h1>
          <p style={{ fontSize: 13, color: textSecondary, marginTop: 4 }}>
            Yeni içerikler ve insanlar keşfet
          </p>
        </div>

        {/* Arama */}
        <div style={{ position: "relative", marginBottom: 24 }}>
          <span style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            color: textSecondary, fontSize: 16,
          }}>🔍</span>
          <input
            type="text"
            placeholder="Ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "12px 16px 12px 40px",
              background: inputBg,
              border: `1px solid ${inputBorder}`,
              borderRadius: 14, fontSize: 14, color: textPrimary,
              outline: "none", boxSizing: "border-box",
              transition: "background 0.3s",
            }}
          />
        </div>

        {/* Trend Konular */}
        <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: CYAN, fontSize: 15 }}>📈</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>Trend Konular</span>
          </div>
          {["#MyLive", "#Canlı", "#Sohbet", "#Yeni"].map((tag, i) => (
            <div key={tag} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 0",
              borderBottom: i < 3 ? `1px solid ${cardBorder}` : "none",
            }}>
              <span style={{ fontSize: 12, color: textSecondary }}>#</span>
              <span style={{ fontSize: 13, color: textPrimary }}>{tag}</span>
            </div>
          ))}
        </div>

        {/* Canlı Kullanıcılar */}
        <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: MAGENTA, fontSize: 15 }}>🔴</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>Şu An Canlı</span>
          </div>
          <div style={{ textAlign: "center", padding: "16px 0", color: textSecondary, fontSize: 13 }}>
            Canlı kullanıcılar yakında gösterilecek...
          </div>
        </div>

        <div style={{ textAlign: "center", padding: "16px 0", color: textSecondary, fontSize: 12 }}>
          Daha fazla içerik yakında...
        </div>

      </div>
    </div>
  );
}
