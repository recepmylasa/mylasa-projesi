// FILE: src/pages/MyLive/LoadingScreen.jsx
// Manus önizlemesiyle birebir aynı tasarım - inline style versiyonu
import React, { useState, useEffect, useRef } from "react";
import "../../styles/myLive.css";

const SEARCH_MESSAGES = [
  "Aktif yayıncılar aranıyor...",
  "Uygun biri bulunuyor...",
  "Bağlantı kuruluyor...",
  "Neredeyse hazır...",
];

const CYAN = "#00c8e0";
const MAGENTA = "#d946a8";
const GREEN = "#22c97a";
const GOLD = "#c9a227";

export default function LoadingScreen({ user, onCancel }) {
  const [messageIdx, setMessageIdx] = useState(0);
  const [searchTime, setSearchTime] = useState(0);
  const intervalRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setMessageIdx(prev => (prev + 1) % SEARCH_MESSAGES.length);
    }, 2500);
    timerRef.current = setInterval(() => {
      setSearchTime(prev => prev + 1);
    }, 1000);
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const avatarUrl = user?.photoURL || user?.profilePhoto || null;
  const displayName = user?.displayName?.split(" ")[0] || user?.name?.split(" ")[0] || "Sen";

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0a0b0f",
      color: "#f0f4ff",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background gradient */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(0,200,224,0.10) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(217,70,168,0.07) 0%, transparent 60%)",
      }} />

      {/* Close button */}
      <button
        onClick={onCancel}
        style={{
          position: "absolute", top: "16px", right: "16px",
          width: "36px", height: "36px", borderRadius: "50%",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          color: "rgba(176,184,212,0.8)", fontSize: "18px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10,
        }}
      >
        ✕
      </button>

      {/* Main content */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>

        {/* Radar animation */}
        <div style={{ position: "relative", width: "192px", height: "192px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "40px" }}>
          {/* Radar rings */}
          {[0, 0.6, 1.2].map((delay, i) => (
            <div key={i} style={{
              position: "absolute",
              width: "192px", height: "192px",
              borderRadius: "50%",
              border: `1px solid rgba(0,200,224,${0.3 - i * 0.08})`,
              animation: `ml-radar-ring 2s ease-out ${delay}s infinite`,
            }} />
          ))}

          {/* Inner circle */}
          <div style={{
            position: "absolute",
            width: "128px", height: "128px",
            borderRadius: "50%",
            background: "rgba(0,200,224,0.05)",
            border: "1px solid rgba(0,200,224,0.2)",
          }} />

          {/* Center - user avatar or icon */}
          <div style={{
            position: "relative",
            width: "80px", height: "80px",
            borderRadius: "50%",
            background: avatarUrl ? "transparent" : `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 20px rgba(0,200,224,0.35), 0 0 60px rgba(0,200,224,0.15)`,
            animation: "ml-float 4s ease-in-out infinite",
            overflow: "hidden",
            zIndex: 2,
          }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            )}
          </div>

          {/* Orbiting dots */}
          {[
            { color: CYAN, delay: "0s" },
            { color: MAGENTA, delay: "-1s" },
            { color: GOLD, delay: "-2s" },
          ].map((dot, i) => (
            <div key={i} style={{
              position: "absolute",
              width: "12px", height: "12px",
              borderRadius: "50%",
              background: dot.color,
              boxShadow: `0 0 8px ${dot.color}`,
              animation: `ml-orbit-${i} 3s linear infinite`,
              animationDelay: dot.delay,
              top: "50%", left: "50%",
            }} />
          ))}
        </div>

        {/* Status text */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#f0f4ff", margin: "0 0 8px 0" }}>
            Eşleşme Aranıyor
          </h2>
          <p style={{ fontSize: "14px", fontWeight: 600, color: CYAN, margin: 0 }}>
            {SEARCH_MESSAGES[messageIdx]}
          </p>
        </div>

        {/* Timer */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "32px" }}>
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%", background: MAGENTA,
            animation: "ml-live-pulse 1.5s ease-in-out infinite", display: "block",
          }} />
          <span style={{ color: "rgba(176,184,212,0.7)", fontSize: "14px", fontFamily: "monospace" }}>
            {formatTime(searchTime)}
          </span>
        </div>

        {/* Info cards */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "40px" }}>
          {[
            { icon: "🔒", label: "P2P Şifreli", color: GREEN },
            { icon: "⚡", label: "Düşük Gecikme", color: GOLD },
            { icon: "🎲", label: "Rastgele", color: CYAN },
          ].map((item) => (
            <div key={item.label} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
              padding: "10px 14px", borderRadius: "14px",
              background: "rgba(18,20,30,0.7)", border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(12px)",
            }}>
              <span style={{ fontSize: "16px" }}>{item.icon}</span>
              <span style={{ fontSize: "10px", color: "rgba(176,184,212,0.7)" }}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Cancel button */}
        <button
          onClick={onCancel}
          style={{
            padding: "12px 32px", borderRadius: "16px", cursor: "pointer",
            background: "rgba(22,24,36,0.9)", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(176,184,212,0.7)", fontSize: "14px", fontWeight: 600,
            transition: "all 0.2s",
          }}
        >
          Aramayı İptal Et
        </button>
      </div>

      <style>{`
        @keyframes ml-radar-ring {
          0% { transform: scale(0.3); opacity: 0.9; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes ml-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes ml-live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes ml-orbit-0 {
          0% { transform: translate(-50%, -50%) rotate(0deg) translateX(80px); }
          100% { transform: translate(-50%, -50%) rotate(360deg) translateX(80px); }
        }
        @keyframes ml-orbit-1 {
          0% { transform: translate(-50%, -50%) rotate(120deg) translateX(80px); }
          100% { transform: translate(-50%, -50%) rotate(480deg) translateX(80px); }
        }
        @keyframes ml-orbit-2 {
          0% { transform: translate(-50%, -50%) rotate(240deg) translateX(80px); }
          100% { transform: translate(-50%, -50%) rotate(600deg) translateX(80px); }
        }
      `}</style>
    </div>
  );
}
