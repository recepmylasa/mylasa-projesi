// FILE: src/pages/MyLive/MyLiveExploreScreen.jsx
// MyLive Keşfet - Manus Explore.tsx ile birebir aynı içerik
import React, { useState } from "react";

const CYAN = "#00C8E0";

export default function MyLiveExploreScreen() {
  const [search, setSearch] = useState("");

  return (
    <div style={{ minHeight: "100dvh", paddingBottom: "80px", overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 0" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: CYAN }}>🧭</span> Keşfet
          </h1>
          <p style={{ fontSize: 13, color: "rgba(140,150,180,0.8)", marginTop: 4 }}>
            Yeni içerikler ve insanlar keşfet
          </p>
        </div>

        {/* Arama */}
        <div style={{ position: "relative", marginBottom: 24 }}>
          <span style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            color: "rgba(140,150,180,0.6)", fontSize: 16,
          }}>🔍</span>
          <input
            type="text"
            placeholder="Ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "12px 16px 12px 40px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14, fontSize: 14, color: "#fff",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Trend Konular */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: "14px 16px", marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: CYAN, fontSize: 15 }}>📈</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Trend Konular</span>
          </div>
          {["#MyLive", "#Canlı", "#Sohbet", "#Yeni"].map((tag, i) => (
            <div key={tag} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 0",
              borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              <span style={{ fontSize: 12, color: "rgba(140,150,180,0.5)" }}>#</span>
              <span style={{ fontSize: 13, color: "#fff" }}>{tag}</span>
            </div>
          ))}
        </div>

        {/* Canlı Kullanıcılar */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: "14px 16px", marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: "#D946A8", fontSize: 15 }}>🔴</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Şu An Canlı</span>
          </div>
          <div style={{ textAlign: "center", padding: "16px 0", color: "rgba(140,150,180,0.6)", fontSize: 13 }}>
            Canlı kullanıcılar yakında gösterilecek...
          </div>
        </div>

        <div style={{ textAlign: "center", padding: "16px 0", color: "rgba(140,150,180,0.5)", fontSize: 12 }}>
          Daha fazla içerik yakında...
        </div>

      </div>
    </div>
  );
}
